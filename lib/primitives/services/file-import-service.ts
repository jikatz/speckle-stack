import { Port, SecurityGroup } from "aws-cdk-lib/aws-ec2"
import { Compatibility, ContainerImage, FargateService, LogDriver, Secret, TaskDefinition } from "aws-cdk-lib/aws-ecs"
import { SpeckleComputeProps } from "../../props"
import { SpeckleStack } from "../../speckle-stack"

export const getFileImportService = (stack: SpeckleStack, compute?: SpeckleComputeProps) => {

    const repoName = compute?.repoName ?? 'speckle/speckle-fileimport-service' 
    const imageTag = compute?.tagOverride ?? 'latest'
    const image = ContainerImage.fromRegistry(`${repoName}:${imageTag}`)

    const logDriver = LogDriver.awsLogs({streamPrefix: `speckle-import-${stack.namespace}`})


    const taskDefinition = new TaskDefinition(stack, `file-import-task-${stack.namespace}`, {
        memoryMiB: `${compute?.memoryLimitMiB || 1024}`,
        cpu: `${compute?.cpu || 512}`,
        compatibility:Compatibility.FARGATE,
        
    })

    //need to add a secret for the db password in the connection string

    const containerDefinition = taskDefinition.addContainer( `speckle-${stack.namespace}`, {
        image,
        memoryLimitMiB:  compute?.memoryLimitMiB || 1024,
        logging: logDriver,
        cpu: compute?.cpu || 512,
        environment: {
            LOG_LEVEL: 'info',
            SPECKLE_SERVER_URL: `https://${stack.apiUrl}:3000`,
            REDIS_URL: `redis://${stack.cacheCluster.attrRedisEndpointAddress}:${stack.cacheCluster.attrRedisEndpointPort}`,
            FILE_IMPORT_TIME_LIMIT_MIN: '10'
        },
        secrets: {
            PG_CONNECTION_STRING: Secret.fromSecretsManager(stack.secret, 'db-connection-string')
        }
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

    stack.cacheSecurityGroup.addIngressRule(fileImportService.connections.securityGroups[0], Port.tcp(6379))
    stack.cacheSecurityGroup.addEgressRule(fileImportService.connections.securityGroups[0], Port.tcp(6379))
    fileImportService.connections.allowFrom(stack.cacheSecurityGroup, Port.tcp(6379))


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
