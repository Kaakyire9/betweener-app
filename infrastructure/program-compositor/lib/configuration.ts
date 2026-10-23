export const STAGING_ACCOUNT = '425805163493';
export const STAGING_REGION = 'eu-north-1';
export const STAGING_ENVIRONMENT = 'staging';

export const RELEASE = Object.freeze({
  sourceRevision: '5812bc9e6b93733e9f543c5e2003e1660f17a0d8',
  buildIdentifier: 'adaptive-stage-m1-5812bc9',
  manifestVersion: 'adaptive-stage-v2.0.0-m1',
  resolverVersion: 'layout-plan-v2.0.0-m1',
  localImageDigest: 'sha256:373029b26a8d851c761c8aaa725fb2db9bcbd713621630b9f8033eb7b76e180d',
});

export const RESOURCE_NAMES = Object.freeze({
  repository: 'betweener/program-compositor',
  cluster: 'betweener-staging',
  service: 'program-compositor',
  taskFamily: 'betweener-staging-program-compositor',
  applicationLogGroup: '/aws/ecs/betweener-staging/program-compositor',
  operationsLogGroup: '/aws/events/ecs/betweener-staging/program-compositor',
  workerTokenSecret: 'betweener/staging/program-compositor/worker-token',
});

export const assertStagingTarget = (): void => {
  const account = process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.CDK_DEFAULT_REGION;

  if (account && account !== STAGING_ACCOUNT) {
    throw new Error(`Refusing non-staging AWS account: ${account}`);
  }
  if (region && region !== STAGING_REGION) {
    throw new Error(`Refusing non-staging AWS region: ${region}`);
  }
};
