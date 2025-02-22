import { SubnetType } from "aws-cdk-lib/aws-ec2";
import { AuroraPostgresEngineVersion, ClusterInstance, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { SpeckleDbProps } from "../props";
import { SpeckleStack } from "../speckle-stack";

export const getDb = (stack:SpeckleStack, dbProps?: SpeckleDbProps): DatabaseCluster => {

    const namespace = stack.namespace;

    return new DatabaseCluster(stack, `speckle-db-${namespace}`, {
        engine: DatabaseClusterEngine.auroraPostgres({
            version: AuroraPostgresEngineVersion.VER_16_1
        }),
        serverlessV2MaxCapacity: dbProps?.maxCapacity || 2,
        serverlessV2MinCapacity: dbProps?.minCapacity || 1,
        writer: ClusterInstance.serverlessV2('writer'),
        defaultDatabaseName: `speckle`,
        credentials: {
            "username": "postgres",
            password: stack.secret.secretValueFromJson("password")
        },
        vpc: stack.vpc,
        vpcSubnets: {
            subnetType: SubnetType.PRIVATE_ISOLATED
        }
    });

}
