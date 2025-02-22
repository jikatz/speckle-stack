import * as cdk from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { CfnCacheCluster } from 'aws-cdk-lib/aws-elasticache';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { getDb } from './primitives/db';
import { SpeckleStackProps } from './props';
import { getCache } from './primitives/cache';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { getWebService } from './primitives/services/web';
import { getServerService } from './primitives/services/server';


export class SpeckleStack extends cdk.Stack {
  
  vpc: Vpc;
  hostedZone: HostedZone;
  dbCluster: DatabaseCluster;
  cacheCluster: CfnCacheCluster;
  computeCluster: Cluster;
  secret: Secret;
  bucket: Bucket;
  namespace: string;
  webUrl: string;
  apiUrl: string  

  constructor(scope: Construct, id: string, props: SpeckleStackProps) {
    super(scope, id, props);

    this.namespace = props.namespace;

    this.vpc = Vpc.fromLookup(this, `speckle-vpc-${this.namespace}`, {
      vpcId: props.vpcId
    }) as Vpc;

    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, `speckle-hosted-zone-${this.namespace}`, {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domainName
    }) as HostedZone;

    this.secret = Secret.fromSecretAttributes(this, `speckle-secret-${this.namespace}`, {
      secretCompleteArn: props.secretArn
    }) as Secret;

    this.webUrl = `${props}.${props.domainName}`;

    this.bucket = new Bucket(this, `speckle-bucket-${this.namespace}`, {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    //setup the DB 
    this.dbCluster = getDb(this, props.db);
    
    //create the cache
    this.cacheCluster = getCache(this, props.cache);

    //setup the compute cluster
    this.computeCluster = new Cluster(this, `speckle-cluster-${props.namespace}`, {
      vpc: this.vpc,
      clusterName: `speckle-cluster-${this.namespace}`,
    });
    
    //add the services
    getWebService(this, props.web)
    getServerService(this, props.server)

    //profit?

  }
}
