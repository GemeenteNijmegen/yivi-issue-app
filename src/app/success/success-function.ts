// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * Props for SuccessFunction
 */
export interface SuccessFunctionProps extends lambda.FunctionOptions {
}

/**
 * An AWS Lambda function which executes src/app/success/success.
 */
export class SuccessFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props?: SuccessFunctionProps) {
    super(scope, id, {
      description: 'src/app/success/success.lambda.ts',
      ...props,
      runtime: new lambda.Runtime('nodejs14.x', lambda.RuntimeFamily.NODEJS),
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../assets/app/success/success.lambda')),
    });
    this.addEnvironment('AWS_NODEJS_CONNECTION_REUSE_ENABLED', '1', { removeInEdge: true });
  }
}