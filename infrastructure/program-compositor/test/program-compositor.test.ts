import assert from 'node:assert/strict';
import { test } from 'node:test';

import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { RELEASE, RESOURCE_NAMES } from '../lib/configuration.js';
import { ProgramCompositorRegistryStack } from '../lib/registry-stack.js';
import { ProgramCompositorRuntimeStack } from '../lib/runtime-stack.js';

const environment = { account: '425805163493', region: 'eu-north-1' };

void test('registry is immutable, scanned, encrypted, and staging named', () => {
  const app = new App();
  const stack = new ProgramCompositorRegistryStack(app, 'Registry', { env: environment });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ECR::Repository', {
    RepositoryName: RESOURCE_NAMES.repository,
    ImageTagMutability: 'IMMUTABLE',
    ImageScanningConfiguration: { ScanOnPush: true },
  });
});

void test('runtime defaults to zero, uses one immutable AMD64 task, and permits no inbound traffic', () => {
  const app = new App();
  const parent = new Stack(app, 'Network', { env: environment });
  const vpc = new ec2.Vpc(parent, 'Vpc', {
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [{ name: 'Public', subnetType: ec2.SubnetType.PUBLIC }],
  });
  const stack = new ProgramCompositorRuntimeStack(app, 'Runtime', {
    env: environment,
    vpc,
  });
  const template = Template.fromStack(stack);

  template.hasParameter('DesiredCount', { Default: 0, MinValue: 0, MaxValue: 1 });
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Cpu: '4096',
    Memory: '8192',
    EphemeralStorage: { SizeInGiB: 40 },
    NetworkMode: 'awsvpc',
    RequiresCompatibilities: ['FARGATE'],
    RuntimePlatform: {
      CpuArchitecture: 'X86_64',
      OperatingSystemFamily: 'LINUX',
    },
    ContainerDefinitions: [
      Match.objectLike({
        Name: 'program-compositor',
        Essential: true,
        StopTimeout: 60,
        HealthCheck: Match.objectLike({
          Interval: 15,
          Timeout: 3,
          Retries: 3,
          StartPeriod: 90,
        }),
        Environment: Match.arrayWith([
          { Name: 'SUPABASE_URL', Value: 'https://xsgzxadwuxuziubglvps.supabase.co' },
          { Name: 'BROADCAST_COMPOSITOR_MAX_SESSIONS', Value: '1' },
          { Name: 'BETWEENER_SOURCE_REVISION', Value: RELEASE.sourceRevision },
        ]),
        Secrets: Match.arrayWith([Match.objectLike({ Name: 'BROADCAST_COMPOSITOR_WORKER_TOKEN' })]),
      }),
    ],
  });
  template.hasResourceProperties('AWS::ECS::Service', {
    ServiceName: RESOURCE_NAMES.service,
    DesiredCount: { Ref: 'DesiredCount' },
    EnableExecuteCommand: false,
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      MinimumHealthyPercent: 0,
      MaximumPercent: 100,
    }),
    NetworkConfiguration: {
      AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: 'ENABLED' }),
    },
  });
  template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Name: RESOURCE_NAMES.workerTokenSecret,
  });

  const rendered = JSON.stringify(template.toJSON());
  assert.doesNotMatch(rendered, /STREAM_VIDEO_API_(?:KEY|SECRET)/);
  assert.doesNotMatch(
    rendered,
    /broadcast_(?:hls|recording|captions|translation|clips|highlights)_enabled/i,
  );
});
