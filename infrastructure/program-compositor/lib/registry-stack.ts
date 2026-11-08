import { CfnOutput, Duration, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';

import { RESOURCE_NAMES, STAGING_ENVIRONMENT } from './configuration.js';

export class ProgramCompositorRegistryStack extends Stack {
  public constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.templateOptions.description =
      'Staging-only immutable ECR registry for the Betweener Program Compositor.';

    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: RESOURCE_NAMES.repository,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.RETAIN,
      emptyOnDelete: false,
      lifecycleRules: [
        {
          description: 'Remove untagged staging artifacts after seven days',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: Duration.days(7),
        },
      ],
    });

    Tags.of(this).add('Environment', STAGING_ENVIRONMENT);
    Tags.of(this).add('Application', 'betweener');
    Tags.of(this).add('Component', 'program-compositor');

    new CfnOutput(this, 'RepositoryName', { value: repository.repositoryName });
    new CfnOutput(this, 'RepositoryUri', { value: repository.repositoryUri });
  }
}
