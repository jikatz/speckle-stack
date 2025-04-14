import { CustomResource, Duration } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SpeckleStack } from '../speckle-stack';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';

export const createDbConnectionString = (stack: SpeckleStack, dbCluster: DatabaseCluster) => {
    const handler = new NodejsFunction(stack, `db-connection-string-handler-${stack.namespace}`, {
        runtime: Runtime.NODEJS_20_X,
        entry: 'lib/lambda/db-connection-string.ts',
        timeout: Duration.seconds(30),
        environment: {
            SECRET_ARN: stack.secret.secretArn,
            DB_HOST: dbCluster.clusterEndpoint.hostname,
            DB_PORT: '5432',
            DB_NAME: 'speckle',
            DB_USER: 'postgres'
        }
    });

    stack.secret.grantRead(handler);
    stack.secret.grantWrite(handler);

    const provider = new Provider(stack, `db-connection-string-provider-${stack.namespace}`, {
        onEventHandler: handler
    });

    const resource = new CustomResource(stack, `db-connection-string-${stack.namespace}`, {
        serviceToken: provider.serviceToken,
        properties: {
            SecretArn: stack.secret.secretArn,
            DbHost: dbCluster.clusterEndpoint.hostname,
            DbPort: '5432',
            DbName: 'speckle',
            DbUser: 'postgres'
        }
    });

}; 