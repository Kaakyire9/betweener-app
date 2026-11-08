export const STAGING_ACCOUNT = '425805163493';
export const STAGING_REGION = 'eu-north-1';
export const STAGING_ENVIRONMENT = 'staging';

export const RELEASE = Object.freeze({
  sourceRevision: '98c3013781113ff4b95a580b090f3358eb9deb70',
  buildIdentifier: 'adaptive-stage-m1-secure-98c3013',
  manifestVersion: 'adaptive-stage-v2.0.0-m1',
  resolverVersion: 'layout-plan-v2.0.0-m1',
  localImageDigest: 'sha256:d358cec4887f030b6735fab9f9c90e48146b46d2716e84ec8dbf81aa88aa4736',
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
