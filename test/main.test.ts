import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Node } from 'constructs';
import * as Dotenv from 'dotenv';
import { ApiStack } from '../src/ApiStack';
import { ApiStage } from '../src/ApiStage';
import { Configuration } from '../src/Configuration';
import { Criticality } from '../src/Criticality';
import { DNSStack } from '../src/DNSStack';
import { KeyStack } from '../src/keystack';
import { ParameterStack } from '../src/ParameterStage';
import { PipelineStack } from '../src/PipelineStack';
import { SessionsStack } from '../src/SessionsStack';

/**
 * Checks all snapshots in a stage
 */
function checkStackSnapshotsInStage(app: App, node: Node) {
  const stackIds = node.children.map(c => (c.node as any).host.artifactId);
  stackIds.forEach(stackId => {
    expect(app.synth().getStackArtifact(stackId).template).toMatchSnapshot();
  });
}

const snapshotEnv = {
  account: '123456789012',
  region: 'eu-central-1',
};

const config: Configuration = {
  branchName: 'snapshot-tests',
  pipelineStackName: 'unit-test-pipeline-stack',
  codeStarConnectionArn: 'arn:CodeStarConnection:12124253124:blablab',
  deployFromEnvironment: snapshotEnv,
  deployToEnvironment: snapshotEnv,
  includePipelineValidationChecks: false,
  setWafRatelimit: false,
  useDemoScheme: true,
  nijmegenSubdomain: 'snapshot-tests',
  useLambdaRoleForYiviServer: true,
  criticality: new Criticality('low'),
  useHaalCentraalBrp: false,
};

beforeAll(() => {
  Dotenv.config();
});

test('Snapshot pipeline', () => {
  const app = new App();
  const stack = new PipelineStack(app, 'test', {
    env: { account: 'test', region: 'eu-west-1' },
    configuration: config,
  });
  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});

test('MainPipelineExists', () => {
  const app = new App();
  const stack = new PipelineStack(app, 'test', {
    env: { account: 'test', region: 'eu-west-1' },
    configuration: config,
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
});

test('StackHasSessionsTable', () => {
  const app = new App();
  const keyStack = new KeyStack(app, 'keystack');
  const stack = new SessionsStack(app, 'test', { key: keyStack.key });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    AttributeDefinitions: [
      {
        AttributeName: 'sessionid',
        AttributeType: 'S',
      },
    ],
  });
});

test('StackHasApiGateway', () => {
  const app = new App();
  const keyStack = new KeyStack(app, 'keystack');
  const sessionsStack = new SessionsStack(app, 'test', { key: keyStack.key });
  new DNSStack(app, 'dns', {
    configuration: config,
  });
  const stack = new ApiStack(app, 'api', {
    sessionsTable: sessionsStack.sessionsTable,
    configuration: config,
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
});


test('StackHasLambdas', () => {
  const app = new App();
  const keyStack = new KeyStack(app, 'keystack');
  const sessionsStack = new SessionsStack(app, 'test', { key: keyStack.key });
  new DNSStack(app, 'dns', {
    configuration: config,
  });
  const stack = new ApiStack(app, 'api', {
    sessionsTable: sessionsStack.sessionsTable,
    configuration: config,
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Lambda::Function', 7);
});

test('StackHasParameters', () => {
  const app = new App();
  const stack = new ParameterStack(app, 'test');
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::SSM::Parameter', 11);
});

test('StackHasSecrets', () => {
  const app = new App();
  const stack = new ParameterStack(app, 'test');
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::SecretsManager::Secret', 7);
});


test('ApiStage snapshot', () => {
  const app = new App();
  const stage = new ApiStage(app, 'api-stage-snapshot', {
    configuration: config,
  });
  checkStackSnapshotsInStage(app, stage.node);
});