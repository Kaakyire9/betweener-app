#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { assertStagingTarget, STAGING_ACCOUNT, STAGING_REGION } from '../lib/configuration.js';
import { ProgramCompositorRegistryStack } from '../lib/registry-stack.js';
import { ProgramCompositorRuntimeStack } from '../lib/runtime-stack.js';

assertStagingTarget();

const app = new App();
const environment = { account: STAGING_ACCOUNT, region: STAGING_REGION };

const registry = new ProgramCompositorRegistryStack(
  app,
  'BetweenerStagingProgramCompositorRegistry',
  {
    env: environment,
    stackName: 'betweener-staging-program-compositor-registry',
    terminationProtection: true,
  },
);

const runtime = new ProgramCompositorRuntimeStack(app, 'BetweenerStagingProgramCompositorRuntime', {
  env: environment,
  stackName: 'betweener-staging-program-compositor-runtime',
  terminationProtection: true,
});
runtime.addStackDependency(registry, 'The immutable ECR repository must exist before runtime.');

app.synth();
