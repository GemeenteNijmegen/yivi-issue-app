import * as path from 'path';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { aws_secretsmanager, Stack, StackProps, aws_ssm as SSM, aws_lambda as Lambda } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { AccountPrincipal, PrincipalWithConditions, Role } from 'aws-cdk-lib/aws-iam';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ApiFunction } from './ApiFunction';
import { DynamoDbReadOnlyPolicy } from './iam/dynamodb-readonly-policy';
import { SessionsTable } from './SessionsTable';
import { Statics } from './statics';

export interface ApiStackProps extends StackProps {
  sessionsTable: SessionsTable;
  branch: string;
}

/**
 * The API Stack creates the API Gateway and related
 * lambda's. It requires supporting resources (such as the
 * DynamoDB sessions table to be provided and thus created first)
 */
export class ApiStack extends Stack {
  private sessionsTable: Table;
  api: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id);
    this.sessionsTable = props.sessionsTable.table;
    this.api = new apigatewayv2.HttpApi(this, 'irma-issue-api', {
      description: 'IRMA issue webapplicatie',
    });

    // Store apigateway ID to be used in other stacks
    new SSM.StringParameter(this, 'ssm_api_1', {
      stringValue: this.api.httpApiId,
      parameterName: Statics.ssmApiGatewayId,
    });

    const subdomain = Statics.subDomain(props.branch);
    const appDomain = `${subdomain}.nijmegen.nl`;
    var baseUrl = `https://${appDomain}/`;

    if (props.branch == 'development') {
      const cspSubdomain = Statics.cspSubDomain(props.branch);
      const cspDomain = `${cspSubdomain}.csp-nijmegen.nl`;
      var baseUrl = `https://${cspDomain}/`;
    }

    this.monitoringLambda();
    const readOnlyRole = this.readOnlyRole();
    this.setFunctions(baseUrl, readOnlyRole);
    this.allowReadAccessToTable(readOnlyRole, this.sessionsTable);
  }


  /**
   * Create a lambda function to monitor cloudwatch logs
   *
   * @returns {Lambda.Function} a lambda responsible for monitoring cloudwatch logs
   */
  private monitoringLambda(): Lambda.Function {
    let webhookUrl = SSM.StringParameter.valueForStringParameter(this, Statics.ssmSlackWebhookUrl);
    const lambda = new Lambda.Function(this, 'lambda', {
      runtime: Lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      description: 'Monitor IRMA issue app cloudwatch logs',
      code: Lambda.Code.fromAsset(path.join(__dirname, 'monitoring', 'lambda')),
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        SLACK_WEBHOOK_URL: webhookUrl,
      },
    });

    new SSM.StringParameter(this, 'ssm_slack_1', {
      stringValue: lambda.functionArn,
      parameterName: Statics.ssmMonitoringLambdaArn,
    });
    return lambda;
  }

  /**
   * Create and configure lambda's for all api routes, and
   * add routes to the gateway.
   * @param {string} baseUrl the application url
   */
  setFunctions(baseUrl: string, readOnlyRole: Role) {
    const loginFunction = new ApiFunction(this, 'irma-issue-login-function', {
      description: 'Login-pagina voor de IRMA issue-applicatie.',
      codePath: 'app/login',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      readOnlyRole,
    });

    const logoutFunction = new ApiFunction(this, 'irma-issue-logout-function', {
      description: 'Uitlog-pagina voor de IRMA issue-applicatie.',
      codePath: 'app/logout',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      readOnlyRole,
    });

    const oidcSecret = aws_secretsmanager.Secret.fromSecretNameV2(this, 'oidc-secret', Statics.secretOIDCClientSecret);
    const authFunction = new ApiFunction(this, 'irma-issue-auth-function', {
      description: 'Authenticatie-lambd voor de IRMA issue-applicatie.',
      codePath: 'app/auth',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      readOnlyRole,
      environment: {
        CLIENT_SECRET_ARN: oidcSecret.secretArn,
      },
    });
    oidcSecret.grantRead(authFunction.lambda);

    const secretMTLSPrivateKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'tls-key-secret', Statics.secretMTLSPrivateKey);
    const tlskeyParam = SSM.StringParameter.fromStringParameterName(this, 'tlskey', Statics.ssmMTLSClientCert);
    const tlsRootCAParam = SSM.StringParameter.fromStringParameterName(this, 'tlsrootca', Statics.ssmMTLSRootCA);
    const irmaApiHost = SSM.StringParameter.valueForStringParameter(this, Statics.ssmIrmaApiHost);
    const irmaApiDemo = SSM.StringParameter.valueForStringParameter(this, Statics.ssmIrmaApiDemo);
    const secretIrmaApiAccessKeyId = aws_secretsmanager.Secret.fromSecretNameV2(this, 'irma-api-access-key', Statics.secretIrmaApiAccessKeyId);
    const secretIrmaApiSecretKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'irma-api-secret-key', Statics.secretIrmaApiSecretKey);
    const secretIrmaApiKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'irma-api-key', Statics.secretIrmaApiKey);
    const homeFunction = new ApiFunction(this, 'irma-issue-home-function', {
      description: 'Home-lambda voor de IRMA issue-applicatie.',
      codePath: 'app/home',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      readOnlyRole,
      environment: {
        MTLS_PRIVATE_KEY_ARN: secretMTLSPrivateKey.secretArn,
        MTLS_CLIENT_CERT_NAME: Statics.ssmMTLSClientCert,
        MTLS_ROOT_CA_NAME: Statics.ssmMTLSRootCA,
        BRP_API_URL: SSM.StringParameter.valueForStringParameter(this, Statics.ssmBrpApiEndpointUrl),
        IRMA_API_HOST: irmaApiHost,
        IRMA_API_DEMO: irmaApiDemo,
        IRMA_API_ACCESS_KEY_ID_ARN: secretIrmaApiAccessKeyId.secretArn,
        IRMA_API_SECRET_KEY_ARN: secretIrmaApiSecretKey.secretArn,
        IRMA_API_KEY_ARN: secretIrmaApiKey.secretArn,
      },
    });
    secretMTLSPrivateKey.grantRead(homeFunction.lambda);
    tlskeyParam.grantRead(homeFunction.lambda);
    tlsRootCAParam.grantRead(homeFunction.lambda);
    secretIrmaApiAccessKeyId.grantRead(homeFunction.lambda);
    secretIrmaApiSecretKey.grantRead(homeFunction.lambda);
    secretIrmaApiKey.grantRead(homeFunction.lambda);

    const resultFunction = new ApiFunction(this, 'irma-issue-result-function', {
      description: 'Result endpoint voor de IRMA issue-applicatie.',
      codePath: 'app/result',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      readOnlyRole,
      environment: {
        IRMA_API_HOST: irmaApiHost,
        IRMA_API_DEMO: irmaApiDemo,
        IRMA_API_ACCESS_KEY_ID_ARN: secretIrmaApiAccessKeyId.secretArn,
        IRMA_API_SECRET_KEY_ARN: secretIrmaApiSecretKey.secretArn,
        IRMA_API_KEY_ARN: secretIrmaApiKey.secretArn,
      },
    });
    secretIrmaApiAccessKeyId.grantRead(resultFunction.lambda);
    secretIrmaApiSecretKey.grantRead(resultFunction.lambda);
    secretIrmaApiKey.grantRead(resultFunction.lambda);


    this.api.addRoutes({
      integration: new HttpLambdaIntegration('irma-issue-login', loginFunction.lambda),
      path: '/login',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('irma-issue-logout', logoutFunction.lambda),
      path: '/logout',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('irma-issue-auth', authFunction.lambda),
      path: '/auth',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({ // Endpoint for relaying signed request to IRMA issue server (secured with AWS credentials)
      integration: new HttpLambdaIntegration('irma-issue-result', resultFunction.lambda),
      path: '/result',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({ // Also availabel at / due to CloudFront defaultRootObject
      integration: new HttpLambdaIntegration('irma-issue-home', homeFunction.lambda),
      path: '/home',
      methods: [apigatewayv2.HttpMethod.GET],
    });
  }

  /**
   * Clean and return the apigateway subdomain placeholder
   * https://${Token[TOKEN.246]}.execute-api.eu-west-1.${Token[AWS.URLSuffix.3]}/
   * which can't be parsed by the URL class.
   *
   * @returns a domain-like string cleaned of protocol and trailing slash
   */
  domain(): string {
    const url = this.api.url;
    if (!url) { return ''; }
    let cleanedUrl = url
      .replace(/^https?:\/\//, '') //protocol
      .replace(/\/$/, ''); //optional trailing slash
    return cleanedUrl;
  }

  /**
   * Create a role with read-only access to the application
   *
   * @returns Role
   */
  readOnlyRole(): Role {
    const readOnlyRole = new Role(this, 'read-only-role', {
      roleName: 'irma-issue-full-read',
      description: 'Read-only role for IRMA issue app with access to lambdas, logging, session store',
      assumedBy: new PrincipalWithConditions(
        new AccountPrincipal(Statics.iamAccountId), //IAM account
        {
          Bool: {
            'aws:MultiFactorAuthPresent': true,
          },
        },
      ),
    });

    new SSM.StringParameter(this, 'ssm_readonly', {
      stringValue: readOnlyRole.roleArn,
      parameterName: Statics.ssmReadOnlyRoleArn,
    });
    return readOnlyRole;
  }

  allowReadAccessToTable(role: Role, table: Table) {
    role.addManagedPolicy(
      new DynamoDbReadOnlyPolicy(this, 'read-policy', {
        tableArn: table.tableArn,
      }),
    );
  }
}