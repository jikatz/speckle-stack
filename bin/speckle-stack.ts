#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SpeckleStack } from '../lib/speckle-stack';
import config = require('config');

const cdkProps = config.get<cdk.StackProps>('cdk');
const namespace = config.get<string>('namespace');
const { hostedZoneId, vpcId, domainName, secretArn} = config.get<Record<string, string>>('speckle');

console.log("Namespace:", namespace)

const app = new cdk.App();
new SpeckleStack(app, `SpeckleStack-${namespace}`, {
  ...cdkProps,
  namespace,
  vpcId,
  hostedZoneId,
  domainName,
  secretArn
});
