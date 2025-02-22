import { StackProps } from "aws-cdk-lib";

export interface SpeckleComputeProps {
    memoryLimitMiB?: number;
    cpu?: number;
    minCapacity?: number;
    maxCapacity?: number;
    desiredCount?: number;
    repoName?: string;
    tagOverride?: string;
}

export interface SpeckleDbProps {
    minCapacity?: number
    maxCapacity?: number
}

export interface SpeckleCacheProps {
    nodeType?: string;
    numCacheNodes?: number;
}
export interface SpecklePublicProps {
    domainName: string
    hostedZoneId: string
    uiPrefix?: string
    apiPrefix?: string
}

export interface SpeckleStackProps extends StackProps {
    vpcId:string,
    hostedZoneId:string,
    namespace: string
    secretArn: string
    domainName:string
    db?: SpeckleDbProps
    web?: SpeckleComputeProps,
    server?: SpeckleComputeProps,
    fileImport?: SpeckleComputeProps,
    preview?: SpeckleComputeProps,
    webhook?: SpeckleComputeProps,
    cache?: SpeckleCacheProps
}