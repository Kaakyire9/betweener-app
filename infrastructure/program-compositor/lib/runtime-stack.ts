import {
  ArnFormat,
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Size,
  Stack,
  Tags,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

import { RELEASE, RESOURCE_NAMES, STAGING_ENVIRONMENT } from './configuration.js';

export interface ProgramCompositorRuntimeStackProps extends StackProps {
  readonly vpc?: ec2.IVpc;
}

const ecsTasksPrincipal = (stack: Stack): iam.ServicePrincipal =>
  new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
    conditions: {
      ArnLike: {
        'aws:SourceArn': stack.formatArn({
          service: 'ecs',
          resource: '*',
          arnFormat: ArnFormat.NO_RESOURCE_NAME,
        }),
      },
      StringEquals: {
        'aws:SourceAccount': stack.account,
      },
    },
  });

export class ProgramCompositorRuntimeStack extends Stack {
  public constructor(scope: Construct, id: string, props: ProgramCompositorRuntimeStackProps) {
    super(scope, id, props);

    this.templateOptions.description =
      'Staging-only ECS Fargate runtime for one Betweener Program Compositor canary.';

    const desiredCount = new CfnParameter(this, 'DesiredCount', {
      type: 'Number',
      default: 0,
      minValue: 0,
      maxValue: 1,
      description: 'Zero when idle; one only during an approved Milestone 1A canary.',
    });
    const vpc =
      props.vpc ??
      ec2.Vpc.fromLookup(this, 'DefaultVpc', {
        isDefault: true,
      });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'Repository',
      RESOURCE_NAMES.repository,
    );

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: RESOURCE_NAMES.cluster,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const applicationLogs = new logs.LogGroup(this, 'ApplicationLogs', {
      logGroupName: RESOURCE_NAMES.applicationLogGroup,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const operationsLogs = new logs.LogGroup(this, 'OperationsLogs', {
      logGroupName: RESOURCE_NAMES.operationsLogGroup,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const workerToken = new secretsmanager.Secret(this, 'WorkerToken', {
      secretName: RESOURCE_NAMES.workerTokenSecret,
      description: 'Staging-only shared token for compositor-to-orchestrator authentication.',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      roleName: 'betweener-staging-program-compositor-execution',
      assumedBy: ecsTasksPrincipal(this),
      description: 'Pulls the compositor image, writes logs, and injects its staging token.',
    });
    repository.grantPull(executionRole);
    workerToken.grantRead(executionRole);
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteApplicationLogs',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`${applicationLogs.logGroupArn}:*`],
      }),
    );

    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: 'betweener-staging-program-compositor-task',
      assumedBy: ecsTasksPrincipal(this),
      description: 'Runtime identity for the compositor; no application AWS API access.',
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: RESOURCE_NAMES.taskFamily,
      cpu: 4096,
      memoryLimitMiB: 8192,
      ephemeralStorageGiB: 40,
      executionRole,
      taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDefinition.addVolume({ name: 'runtime-tmp' });

    const linuxParameters = new ecs.LinuxParameters(this, 'LinuxParameters', {
      initProcessEnabled: true,
    });
    linuxParameters.dropCapabilities(ecs.Capability.ALL);

    const compositorImage = ecs.ContainerImage.fromRegistry(
      `${repository.repositoryUri}@${RELEASE.localImageDigest}`,
    );
    const runtimeVolumeInitializer = taskDefinition.addContainer('RuntimeVolumeInitializer', {
      containerName: 'runtime-volume-initializer',
      image: compositorImage,
      essential: false,
      user: '0:0',
      readonlyRootFilesystem: true,
      linuxParameters,
      command: ['sh', '-c', 'chmod 1777 /tmp'],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: applicationLogs,
        streamPrefix: 'runtime-volume-initializer',
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: Size.mebibytes(1),
      }),
    });
    runtimeVolumeInitializer.addMountPoints({
      sourceVolume: 'runtime-tmp',
      containerPath: '/tmp',
      readOnly: false,
    });

    const container = taskDefinition.addContainer('ProgramCompositor', {
      containerName: 'program-compositor',
      image: compositorImage,
      essential: true,
      user: '1000:1000',
      readonlyRootFilesystem: true,
      linuxParameters,
      environment: {
        HOME: '/tmp/home',
        XDG_CACHE_HOME: '/tmp/cache',
        XDG_CONFIG_HOME: '/tmp/config',
        SUPABASE_URL: 'https://xsgzxadwuxuziubglvps.supabase.co',
        BROADCAST_COMPOSITOR_MAX_SESSIONS: '1',
        BETWEENER_SOURCE_REVISION: RELEASE.sourceRevision,
        BETWEENER_BUILD_IDENTIFIER: RELEASE.buildIdentifier,
        ADAPTIVE_STAGE_MANIFEST_VERSION: RELEASE.manifestVersion,
        ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION: RELEASE.resolverVersion,
      },
      secrets: {
        BROADCAST_COMPOSITOR_WORKER_TOKEN: ecs.Secret.fromSecretsManager(workerToken),
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: applicationLogs,
        streamPrefix: 'program-compositor',
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: Size.mebibytes(25),
      }),
      healthCheck: {
        command: [
          'CMD-SHELL',
          'node -e "fetch(\'http://127.0.0.1:8080/healthz\').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"',
        ],
        interval: Duration.seconds(15),
        timeout: Duration.seconds(3),
        retries: 3,
        startPeriod: Duration.seconds(90),
      },
      stopTimeout: Duration.seconds(60),
    });
    container.addPortMappings({ containerPort: 8080, protocol: ecs.Protocol.TCP });
    container.addMountPoints({
      sourceVolume: 'runtime-tmp',
      containerPath: '/tmp',
      readOnly: false,
    });
    container.addContainerDependencies({
      container: runtimeVolumeInitializer,
      condition: ecs.ContainerDependencyCondition.SUCCESS,
    });

    const securityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc,
      securityGroupName: 'betweener-staging-program-compositor',
      description: 'Outbound-only access for the staging Program Compositor.',
      allowAllOutbound: true,
      disableInlineRules: true,
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      serviceName: RESOURCE_NAMES.service,
      taskDefinition,
      desiredCount: desiredCount.valueAsNumber,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [securityGroup],
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      enableExecuteCommand: false,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
    });

    const stoppedTaskRule = new events.Rule(this, 'StoppedTaskRule', {
      description: 'Records stopped compositor tasks for staging diagnosis.',
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Task State Change'],
        detail: {
          clusterArn: [cluster.clusterArn],
          group: [`service:${RESOURCE_NAMES.service}`],
          lastStatus: ['STOPPED'],
        },
      },
    });
    stoppedTaskRule.addTarget(new targets.CloudWatchLogGroup(operationsLogs));

    const serviceActionRule = new events.Rule(this, 'ServiceActionRule', {
      description: 'Records warning and error service actions for the compositor.',
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Service Action'],
        resources: [service.serviceArn],
        detail: {
          eventType: ['WARN', 'ERROR'],
        },
      },
    });
    serviceActionRule.addTarget(new targets.CloudWatchLogGroup(operationsLogs));

    const operationalFailureMetric = new logs.MetricFilter(this, 'OperationalFailureMetric', {
      logGroup: operationsLogs,
      filterPattern: logs.FilterPattern.literal(
        '{ ($.detail.eventType = "WARN") || ($.detail.eventType = "ERROR") }',
      ),
      metricNamespace: 'Betweener/Staging/ProgramCompositor',
      metricName: 'ServiceOperationalFailures',
      metricValue: '1',
      defaultValue: 0,
    });
    const operationalAlarm = new cloudwatch.Alarm(this, 'OperationalAlarm', {
      alarmName: 'betweener-staging-program-compositor-operational-failure',
      alarmDescription: 'The staging compositor service emitted an ECS warning or error action.',
      metric: operationalFailureMetric.metric({
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    Tags.of(this).add('Environment', STAGING_ENVIRONMENT);
    Tags.of(this).add('Application', 'betweener');
    Tags.of(this).add('Component', 'program-compositor');

    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new CfnOutput(this, 'TaskDefinitionArn', { value: taskDefinition.taskDefinitionArn });
    new CfnOutput(this, 'CompositorImageDigest', { value: RELEASE.localImageDigest });
    new CfnOutput(this, 'ApplicationLogGroup', { value: applicationLogs.logGroupName });
    new CfnOutput(this, 'OperationsLogGroup', { value: operationsLogs.logGroupName });
    new CfnOutput(this, 'WorkerTokenSecretName', { value: workerToken.secretName });
    new CfnOutput(this, 'OperationalAlarmName', { value: operationalAlarm.alarmName });
    new CfnOutput(this, 'NetworkDecision', {
      value: 'Default VPC public subnets; public task IP; zero inbound security-group rules',
    });
  }
}
