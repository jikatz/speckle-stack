import * as cdk from 'aws-cdk-lib';
import { Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
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
import { getFileImportService } from './primitives/services/file-import-service';
import { getPreviewService } from './primitives/services/preview-service';
import { getWebhookService } from './primitives/services/webhook-service';


export class SpeckleStack extends cdk.Stack {
  
  vpc: Vpc;
  hostedZone: HostedZone;
  dbCluster: DatabaseCluster;
  cacheCluster: CfnCacheCluster;
  cacheSecurityGroup: SecurityGroup;
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

    this.webUrl = `speckle.${props.domainName}`;
    this.apiUrl = `speckle-api.${props.domainName}`

    this.bucket = new Bucket(this, `speckle-bucket-${this.namespace}`, {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    //setup the DB 
    this.dbCluster = getDb(this, props.db);
    
    //create the cache
    const {cache, securityGroup} = getCache(this, props.cache);
    this.cacheCluster = cache;
    this.cacheSecurityGroup = securityGroup;

    //setup the compute cluster
    this.computeCluster = new Cluster(this, `speckle-cluster-${props.namespace}`, {
      vpc: this.vpc,
      clusterName: `speckle-cluster-${this.namespace}`,
    });

    this.computeCluster.connections.allowFrom(this.cacheSecurityGroup, Port.tcp(6379));
      
    //add the services
    getWebService(this, props.web)
    getServerService(this, props.server)
    getFileImportService(this, props.fileImport)
    getPreviewService(this, props.preview)
    getWebhookService(this, props.webhook)

    //profit?

  }
}
