export const STAGING_ACCOUNT = '425805163493';
export const STAGING_REGION = 'eu-north-1';
export const STAGING_ENVIRONMENT = 'staging';

export const RELEASE = Object.freeze({
  sourceRevision: '5b346ea8e9fb43d6f7cc4403b73016e7fd1011d4',
  buildIdentifier: 'adaptive-stage-m1-secure-5b346ea',
  manifestVersion: 'adaptive-stage-v2.0.0-m1',
  resolverVersion: 'layout-plan-v2.0.0-m1',
  localImageDigest: 'sha256:f8864e66b34b69fd3e2903bd21400c7fe206c0eb64a0340a4c135cd39a9511d9',
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
