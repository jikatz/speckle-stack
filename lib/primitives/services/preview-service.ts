import { Port, SecurityGroup } from "aws-cdk-lib/aws-ec2"
import { Compatibility, ContainerImage, FargateService, LogDriver, Secret, TaskDefinition } from "aws-cdk-lib/aws-ecs"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getPreviewService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-preview-service'
    const imageTag = compute?.tagOverride ?? 'latest'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const logDriver = LogDriver.awsLogs({ streamPrefix: `speckle-preview-${stack.namespace}` })


    const taskDefinition = new TaskDefinition(stack, `preview-task-${stack.namespace}`, {
        memoryMiB: `${compute?.memoryLimitMiB || 1024}`,
        cpu: `${compute?.cpu || 512}`,
        compatibility: Compatibility.FARGATE,

    })

    const containerDefinition = taskDefinition.addContainer(`speckle-preview-container-${stack.namespace}`, {
        image,
        memoryLimitMiB: compute?.memoryLimitMiB || 1024,
        logging: logDriver,
        cpu: compute?.cpu || 512,
        environment: {
            HOST: '127.0.0.1',
            METRICS_HOST: '127.0.0.1',
            LOG_LEVEL: 'info',
            PORT: '3001',
            REDIS_URL: `redis://${stack.cacheCluster.attrRedisEndpointAddress}:${stack.cacheCluster.attrRedisEndpointPort}`,
        },
        secrets: {
            PG_CONNECTION_STRING: Secret.fromSecretsManager(stack.secret, 'db-connection-string')
        }
    });

    const previewService = new FargateService(stack, `speckle-preview-service-${stack.namespace}`, {
        taskDefinition,
        assignPublicIp: false,
        cluster: stack.computeCluster,
    })

    stack.dbCluster.grantConnect(previewService.taskDefinition.taskRole, 'postgres')
    previewService.connections.allowFrom(stack.dbCluster, Port.tcp(5432))
    previewService.connections.allowTo(stack.dbCluster, Port.tcp(5432))
    stack.dbCluster.connections.allowDefaultPortFrom(previewService)

    stack.cacheSecurityGroup.addIngressRule(previewService.connections.securityGroups[0], Port.tcp(6379))
    stack.cacheSecurityGroup.addEgressRule(previewService.connections.securityGroups[0], Port.tcp(6379))
    previewService.connections.allowFrom(stack.cacheSecurityGroup, Port.tcp(6379))

    const scalableTarget = previewService.autoScaleTaskCount({
        minCapacity: compute?.minCapacity || 1,
        maxCapacity: compute?.maxCapacity || 2,
    });

    scalableTarget.scaleOnCpuUtilization(`preview-cpu-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization(`preview-memory-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });
}
