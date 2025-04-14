import { SecretsManagerClient, UpdateSecretCommand, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const secretsManager = new SecretsManagerClient({});

export const handler = async (event: CloudFormationCustomResourceEvent) => {
    const { SecretArn, DbHost, DbPort, DbName, DbUser } = event.ResourceProperties;

    if (event.RequestType === 'Delete') {
        return {
            PhysicalResourceId: event.PhysicalResourceId,
            Status: 'SUCCESS'
        };
    }

    try {
        // Get the current secret value
        const getSecretResponse = await secretsManager.send(new GetSecretValueCommand({
            SecretId: SecretArn
        }));

        const secretValue = JSON.parse(getSecretResponse.SecretString || '{}');
        const password = secretValue.password || '';

        // Construct the connection string
        const connectionString = `postgresql://${DbUser}:${password}@${DbHost}:${DbPort}/${DbName}`;

        // Update the secret with the connection string
        await secretsManager.send(new UpdateSecretCommand({
            SecretId: SecretArn,
            SecretString: JSON.stringify({
                ...secretValue,
                'db-connection-string': connectionString
            })
        }));

        return {
            PhysicalResourceId: `db-connection-string-${event.LogicalResourceId}`,
            Status: 'SUCCESS',
            Data: {
                ConnectionString: connectionString
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            PhysicalResourceId: `db-connection-string-${event.LogicalResourceId}`,
            Status: 'FAILED',
            Reason: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}; 