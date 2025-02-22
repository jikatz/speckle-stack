import { Port, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2"
import { ContainerImage, Secret } from "aws-cdk-lib/aws-ecs"
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getFileImportService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-fileimport-service' 
    const imageTag = compute?.tagOverride ?? 'latest'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const fileImportService = new ApplicationLoadBalancedFargateService(stack, `speckle-import-service-${stack.namespace}`, {
        memoryLimitMiB: compute?.memoryLimitMiB || 4096,
        desiredCount: compute?.desiredCount || 1,
        publicLoadBalancer: false,
        cpu: compute?.cpu || 2048,
        taskImageOptions: {
            image,
            containerName: "file-import-service",
            environment: {
                SPECKLE_SERVER_URL: `https://${stack.apiUrl}:3000`,
                LOG_LEVEL: "info",
                POSTGRES_URL: `${stack.dbCluster.clusterEndpoint.hostname}`,
                POSTGRES_USER: "postgres",
                POSTGRES_DB: "speckle",
                FILE_IMPORT_TIME_LIMIT_MIN: "10",
            },
            secrets: {
                POSTGRES_PASSWORD: Secret.fromSecretsManager(stack.secret, "password"),
            },
        },
        vpc: stack.vpc,
        taskSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS
        }
    });

    stack.dbCluster.grantConnect(fileImportService.taskDefinition.taskRole, 'postgres')
    fileImportService.service.connections.allowFrom(stack.dbCluster, Port.tcp(5432))
    fileImportService.service.connections.allowTo(stack.dbCluster, Port.tcp(5432))
    stack.dbCluster.connections.allowDefaultPortFrom(fileImportService.service)

    const vpcDefaultSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, `vpc-default-security-group-${stack.namespace}`, stack.vpc.vpcDefaultSecurityGroup)
    vpcDefaultSecurityGroup.addIngressRule(fileImportService.service.connections.securityGroups[0], Port.tcp(6379))
    vpcDefaultSecurityGroup.addEgressRule(fileImportService.service.connections.securityGroups[0], Port.tcp(6379))

    fileImportService.targetGroup.configureHealthCheck({
        path: '/readiness',
        port: '3000',
    });

    const scalableTarget = fileImportService.service.autoScaleTaskCount({
        minCapacity: compute?.minCapacity || 1,
        maxCapacity: compute?.maxCapacity || 2,
    });

    scalableTarget.scaleOnCpuUtilization(`import-cpu-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization(`import-memory-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });
}