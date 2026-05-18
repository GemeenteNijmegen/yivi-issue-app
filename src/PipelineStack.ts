import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { getNodeVersion } from '@gemeentenijmegen/projen-project-type';
import { Aspects, Stack, StackProps, Tags, pipelines } from 'aws-cdk-lib';
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import { PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import { ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { ApiStage } from './ApiStage';
import { Configurable, Configuration } from './Configuration';
import { ParameterStage } from './ParameterStage';
import { Statics } from './statics';

export interface PipelineStackProps extends StackProps, Configurable { }

export class PipelineStack extends Stack {

  private readonly configuration: Configuration;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    Aspects.of(this).add(new PermissionsBoundaryAspect());

    this.configuration = props.configuration;

    const source = this.connectionSource(this.configuration.codeStarConnectionArn);
    const pipeline = this.pipeline(source);

    pipeline.addStage(new ParameterStage(this, 'yivi-issue-parameters', { env: this.configuration.deployToEnvironment }));

    const apiStage = pipeline.addStage(new ApiStage(this, 'yivi-issue-api', {
      env: this.configuration.deployToEnvironment,
      configuration: this.configuration,
    }));

    if (this.configuration.includePipelineValidationChecks) {
      this.runValidationChecks(apiStage, source);
    }

  }

  /**
   * Run validation checks on the finished deployment (for now this runs playwright e2e tests)
   *
   * @param stage stage after which to run
   * @param source the source repo in which to run
   */
  private runValidationChecks(stage: pipelines.StageDeployment, source: pipelines.CodePipelineSource) {
    stage.addPost(new ShellStep('validate', {
      input: source,
      env: {
        CI: 'true',
        ENVIRONMENT: this.configuration.branchName,
      },
      commands: [
        'npm ci',
        'npx playwright install',
        'npx playwright install-deps',
        'npx playwright test',
      ],
    }));
  }

  pipeline(source: pipelines.CodePipelineSource): pipelines.CodePipeline {
    const synthStep = new pipelines.ShellStep('Synth', {
      input: source,
      env: {
        BRANCH_NAME: this.configuration.branchName,
      },
      commands: [
        'node -v',
        'npm ci',
        'npm run build',
      ],
    });

    const pipeline = new pipelines.CodePipeline(this, `yivi-issue-app-${this.configuration.branchName}`, {
      pipelineName: `yivi-issue-app-${this.configuration.branchName}`,
      crossAccountKeys: true,
      synth: synthStep,
      pipelineType: PipelineType.V1,
      synthCodeBuildDefaults: {
        partialBuildSpec: BuildSpec.fromObject({
          phases: {
            install: {
              'runtime-versions': {
                nodejs: getNodeVersion(),
              },
            },
          },
        }),
      },
    });
    return pipeline;
  }

  private connectionSource(connectionArn: string): pipelines.CodePipelineSource {
    return pipelines.CodePipelineSource.connection('GemeenteNijmegen/yivi-issue-app', this.configuration.branchName, {
      connectionArn,
    });
  }
}