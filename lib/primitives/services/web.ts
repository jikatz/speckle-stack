import { Port, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2"
import { ContainerImage } from "aws-cdk-lib/aws-ecs"
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns"
import { ApplicationProtocol } from "aws-cdk-lib/aws-elasticloadbalancingv2"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getWebService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-frontend-2'
    const imageTag = compute?.tagOverride ?? '2'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const webService = new ApplicationLoadBalancedFargateService(stack, `speckle-frontend-service-${stack.namespace}`, {
        memoryLimitMiB: compute?.memoryLimitMiB || 4096,
        desiredCount: compute?.desiredCount || 1,
        cluster: stack.computeCluster,  
        publicLoadBalancer: true,
        cpu: compute?.cpu || 2048,
        taskImageOptions: {
            image,
            containerPort: 8080,
            containerName: "speckle-frontend",
            environment: {
                NUXT_PUBLIC_SERVER_NAME: `speckle-${stack.namespace}`,
                NUXT_PUBLIC_API_ORIGIN: `https://${stack.apiUrl}`,
                NUXT_PUBLIC_BACKEND_API_ORIGIN: `https://${stack.apiUrl}`,
                NUXT_PUBLIC_BASE_URL: `https://${stack.webUrl}`,
                NUXT_PUBLIC_LOG_LEVEL: 'warn',
                NUXT_REDIS_URL: `redis://${stack.cacheCluster.attrRedisEndpointAddress}:${stack.cacheCluster.attrRedisEndpointPort}`
            }
        },
        domainName: `${stack.webUrl}`,
        domainZone: stack.hostedZone,
        protocol: ApplicationProtocol.HTTPS,
        listenerPort: 443,
        taskSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS
        }
    });


    stack.cacheSecurityGroup.addIngressRule(webService.service.connections.securityGroups[0], Port.tcp(6379))
    stack.cacheSecurityGroup.addEgressRule(webService.service.connections.securityGroups[0], Port.tcp(6379))

    webService.service.connections.allowFrom(stack.cacheSecurityGroup, Port.tcp(6379))

    webService.targetGroup.configureHealthCheck({
        path: '/health',
    });

    const scalableFrontendTarget = webService.service.autoScaleTaskCount({
        minCapacity: compute?.minCapacity ?? 1,
        maxCapacity: compute?.maxCapacity || 2,
    });

    scalableFrontendTarget.scaleOnCpuUtilization(`web-cpu-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

    scalableFrontendTarget.scaleOnMemoryUtilization(`web-memory-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

}
