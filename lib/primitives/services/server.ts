import { Port, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2"
import { ContainerImage, Secret } from "aws-cdk-lib/aws-ecs"
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns"
import { ApplicationProtocol } from "aws-cdk-lib/aws-elasticloadbalancingv2"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"
import { AccessKey, User } from "aws-cdk-lib/aws-iam"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export const getServerService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-server'
    const imageTag = compute?.tagOverride ?? '2'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    // Creates a new IAM user, access and secret keys, and stores the secret access key in a Secret.
    const user = new User(stack, `speckle-bucket-user-${stack.namespace}`);
    stack.bucket.grantReadWrite(user);
    const accessKey = new AccessKey(stack, `speckle-bucket-accesskey-${stack.namespace}`, { user });
    const accessKeySecret = new secretsmanager.Secret(stack, `speckle-bucket-secret-${stack.namespace}`, {
        secretStringValue: accessKey.secretAccessKey,
    });

    const serverService = new ApplicationLoadBalancedFargateService(stack, `speckle-server-service-${stack.namespace}`, {
        memoryLimitMiB: compute?.memoryLimitMiB || 4096,
        desiredCount: compute?.desiredCount || 1,
        publicLoadBalancer: true,
        cpu: compute?.cpu || 2048,
        cluster: stack.computeCluster,  
        taskImageOptions: {
            image,
            containerPort: 3000,
            containerName: "speckle-server",
            environment: {
                CANONICAL_URL: `https://${stack.webUrl}`,
                STRATEGY_LOCAL: "true",
                // STRATEGY_OIDC: "true",
                // OIDC_NAME: "SSO",
                // OIDC_DISCOVERY_URL: props.authProps.jwksURI,
                // OIDC_CLIENT_ID: props.authProps.clientId,
                DEBUG: "speckle:*",
                POSTGRES_URL: `${stack.dbCluster.clusterEndpoint.hostname}`,
                POSTGRES_USER: "postgres",
                POSTGRES_DB: "speckle",
                S3_BUCKET: stack.bucket.bucketName,
                S3_ENDPOINT: `https://s3.${stack.region}.amazonaws.com`,
                S3_ACCESS_KEY: accessKey.accessKeyId,
                REDIS_URL: `redis://${stack.cacheCluster.attrRedisEndpointAddress}:${stack.cacheCluster.attrRedisEndpointPort}`,
            },
            secrets: {
                SESSION_SECRET: Secret.fromSecretsManager(stack.secret, "SPECKLE_SESSION_SECRET"),
                POSTGRES_PASSWORD: Secret.fromSecretsManager(stack.secret, "password"),
                S3_SECRET_KEY: Secret.fromSecretsManager(accessKeySecret),
                OIDC_CLIENT_SECRET: Secret.fromSecretsManager(stack.secret, "OIDC_CLIENT_SECRET"),
            },
        },
        healthCheck: {
            command: [
                "CMD",
                "/nodejs/bin/node",
                "-e",
                "try { require('node:http').request({headers: {'Content-Type': 'application/json'}, port:3000, hostname:'127.0.0.1', path:'/graphql?query={serverInfo{version}}', method: 'GET', timeout: 2000 }, (res) => { body = ''; res.on('data', (chunk) => {body += chunk;}); res.on('end', () => {process.exit(res.statusCode != 200 || body.toLowerCase().includes('error'));}); }).end(); } catch { process.exit(1); }",
            ]
        },
        domainName: `${stack.apiUrl}`,
        domainZone: stack.hostedZone,
        protocol: ApplicationProtocol.HTTPS,
        listenerPort: 3000,
        taskSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS
        }
    });


    stack.bucket.grantReadWrite(serverService.taskDefinition.taskRole)
    stack.dbCluster.grantConnect(serverService.taskDefinition.taskRole, 'postgres')
    serverService.service.connections.allowFrom(stack.dbCluster, Port.tcp(5432))
    serverService.service.connections.allowTo(stack.dbCluster, Port.tcp(5432))
    stack.dbCluster.connections.allowDefaultPortFrom(serverService.service)

    stack.cacheSecurityGroup.addIngressRule(serverService.service.connections.securityGroups[0], Port.tcp(6379))
    stack.cacheSecurityGroup.addEgressRule(serverService.service.connections.securityGroups[0], Port.tcp(6379))
    serverService.service.connections.allowFrom(stack.cacheSecurityGroup, Port.tcp(6379))

    serverService.targetGroup.configureHealthCheck({
        path: '/readiness',
        port: '3000',
    });

    const scalableTarget = serverService.service.autoScaleTaskCount({
        minCapacity: compute?.minCapacity || 1,
        maxCapacity: compute?.maxCapacity || 2,
    });

    scalableTarget.scaleOnCpuUtilization(`server-cpu-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization(`server-memory-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });
}
