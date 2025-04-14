import { aws_elasticache as elasticache } from 'aws-cdk-lib';
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import { SpeckleCacheProps } from "../props";
import { SpeckleStack } from '../speckle-stack';

export const getCache = (stack: SpeckleStack, cacheProps?: SpeckleCacheProps): {cache: CfnCacheCluster, securityGroup: SecurityGroup} => {

    const namespace = stack.namespace;
    const subnetGroupName = `speckle-cache-subnet-${namespace}`
    const cfnSubnetGroup = new elasticache.CfnSubnetGroup(stack, `speckle-cache-subnet-${namespace}`, {
        description: `subnetgroup-${namespace}`,
        subnetIds: stack.vpc.privateSubnets.map(subnet => subnet.subnetId),
        cacheSubnetGroupName: subnetGroupName,
    });

    const cacheSecurityGroup = new SecurityGroup(stack, `speckle-cache-security-group-${namespace}`, {
        vpc: stack.vpc,
        allowAllOutbound: true,
        description: `security-group-${namespace}`
    });

    const cfnCacheCluster = new elasticache.CfnCacheCluster(stack, `speckle-cache-${namespace}`, {
        cacheNodeType: cacheProps?.nodeType || "cache.t2.micro",
        engine: 'redis',
        numCacheNodes: cacheProps?.numCacheNodes || 1,
        cacheSubnetGroupName: cfnSubnetGroup.cacheSubnetGroupName,
        vpcSecurityGroupIds: [cacheSecurityGroup.securityGroupId]
    });

    cfnCacheCluster.addDependency(cfnSubnetGroup)

    return {cache: cfnCacheCluster, securityGroup: cacheSecurityGroup};

}
