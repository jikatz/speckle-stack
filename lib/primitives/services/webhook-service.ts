import { Port, SecurityGroup } from "aws-cdk-lib/aws-ec2"
import { Compatibility, ContainerImage, FargateService, LogDriver, TaskDefinition } from "aws-cdk-lib/aws-ecs"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getWebhookService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-webhook-service'
    const imageTag = compute?.tagOverride ?? 'latest'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const logDriver = LogDriver.awsLogs({ streamPrefix: `speckle-webhook-${stack.namespace}` })


    const taskDefinition = new TaskDefinition(stack, `webhook-task-${stack.namespace}`, {
        memoryMiB: `${compute?.memoryLimitMiB || 512}`,
        cpu: `${compute?.cpu || 256}`,
        compatibility: Compatibility.FARGATE,

    })

    const containerDefinition = taskDefinition.addContainer(`speckle-webhook-container-${stack.namespace}`, {
        image,
        memoryLimitMiB: compute?.memoryLimitMiB || 1024,
        logging: logDriver,
        cpu: compute?.cpu || 512,
        environment: {
            LOG_LEVEL: 'info',
            PG_CONNECTION_STRING: 'postgres://speckle:speckle@postgres/speckle'
        },
    });

    const webhookService = new FargateService(stack, `speckle-webhook-service-${stack.namespace}`, {
        taskDefinition,
        assignPublicIp: false,
        cluster: stack.computeCluster,
    })


    stack.dbCluster.grantConnect(webhookService.taskDefinition.taskRole, 'postgres')
    webhookService.connections.allowFrom(stack.dbCluster, Port.tcp(5432))
    webhookService.connections.allowTo(stack.dbCluster, Port.tcp(5432))
    stack.dbCluster.connections.allowDefaultPortFrom(webhookService)

    const vpcDefaultSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, `vpc-default-security-group-${stack.namespace}`, stack.vpc.vpcDefaultSecurityGroup)
    vpcDefaultSecurityGroup.addIngressRule(webhookService.connections.securityGroups[0], Port.tcp(6379))
    vpcDefaultSecurityGroup.addEgressRule(webhookService.connections.securityGroups[0], Port.tcp(6379))


    const scalableTarget = webhookService.autoScaleTaskCount({
        minCapacity: compute?.minCapacity || 1,
        maxCapacity: compute?.maxCapacity || 2,
    });

    scalableTarget.scaleOnCpuUtilization(`webhook-cpu-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });

    scalableTarget.scaleOnMemoryUtilization(`webhook-memory-scaling-${stack.namespace}`, {
        targetUtilizationPercent: 50,
    });
}