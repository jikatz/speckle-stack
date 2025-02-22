import { Port, SecurityGroup } from "aws-cdk-lib/aws-ec2"
import { Compatibility, ContainerImage, FargateService, LogDriver, TaskDefinition } from "aws-cdk-lib/aws-ecs"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getFileImportService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-fileimport-service' 
    const imageTag = compute?.tagOverride ?? 'latest'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const logDriver = LogDriver.awsLogs({streamPrefix: `speckle-import-${stack.namespace}`})


    const taskDefinition = new TaskDefinition(stack, `file-import-task-${stack.namespace}`, {
        memoryMiB: `${compute?.memoryLimitMiB || 512}`,
        cpu: `${compute?.cpu || 256}`,
        compatibility:Compatibility.FARGATE,
        
    })

    const containerDefinition = taskDefinition.addContainer( `speckle-${stack.namespace}`, {
        image,
        memoryLimitMiB:  compute?.memoryLimitMiB || 1024,
        logging: logDriver,
        cpu: compute?.cpu || 512,
        environment: {
            LOG_LEVEL: 'info',
            PG_CONNECTION_STRING: 'postgres://speckle:speckle@postgres/speckle',
            SPECKLE_SERVER_URL: 'http://speckle-server:3000',
            FILE_IMPORT_TIME_LIMIT_MIN: '10'
        },
    });

    const fileImportService = new FargateService(stack, `file-import-service-${stack.namespace}`, {
        taskDefinition,
        assignPublicIp: false,
        cluster: stack.computeCluster,
    })


    stack.dbCluster.grantConnect(fileImportService.taskDefinition.taskRole, 'postgres')
    fileImportService.connections.allowFrom(stack.dbCluster, Port.tcp(5432))
    fileImportService.connections.allowTo(stack.dbCluster, Port.tcp(5432))
    stack.dbCluster.connections.allowDefaultPortFrom(fileImportService)

    const vpcDefaultSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, `vpc-default-security-group-${stack.namespace}`, stack.vpc.vpcDefaultSecurityGroup)
    vpcDefaultSecurityGroup.addIngressRule(fileImportService.connections.securityGroups[0], Port.tcp(6379))
    vpcDefaultSecurityGroup.addEgressRule(fileImportService.connections.securityGroups[0], Port.tcp(6379))


    const scalableTarget = fileImportService.autoScaleTaskCount({
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