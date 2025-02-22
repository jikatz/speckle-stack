import { aws_elasticache as elasticache } from 'aws-cdk-lib';
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import { Construct } from "constructs";
import { SpeckleCacheProps } from "../props";
import { SpeckleStack } from '../speckle-stack';

export const getCache = (stack: SpeckleStack, cacheProps?: SpeckleCacheProps): CfnCacheCluster => {

    const namespace = stack.namespace;
    const subnetGroupName = `speckle-cache-subnet-${namespace}`
    const cfnSubnetGroup = new elasticache.CfnSubnetGroup(stack, `speckle-cache-subnet-${namespace}`, {
        description: `subnetgroup-${namespace}`,
        subnetIds: stack.vpc.isolatedSubnets.map(subnet => subnet.subnetId),
        cacheSubnetGroupName: subnetGroupName,
    });

    const cfnCacheCluster = new elasticache.CfnCacheCluster(stack, `speckle-cache-${namespace}`, {
        cacheNodeType: cacheProps?.nodeType || "cacheProps.t2.micro",
        engine: 'redis',
        numCacheNodes: cacheProps?.numCacheNodes || 1,
        cacheSubnetGroupName: cfnSubnetGroup.cacheSubnetGroupName,
        vpcSecurityGroupIds: [stack.vpc.vpcDefaultSecurityGroup]
    });

    cfnCacheCluster.addDependency(cfnSubnetGroup)

    return cfnCacheCluster;

}
