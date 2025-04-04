import {
  aws_secretsmanager,
  Stack,
  StackProps,
  aws_ssm as SSM,
  aws_logs as logs,
  aws_ssm as ssm,
  aws_iam as iam,
  aws_apigatewayv2 as apigatewayv2,
} from 'aws-cdk-lib';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { AccountPrincipal, PrincipalWithConditions, Role } from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ApiFunction } from './ApiFunction';
import { AuthFunction } from './app/auth/auth-function';
import { IssueFunction } from './app/issue/issue-function';
import { LoginFunction } from './app/login/login-function';
import { LogoutFunction } from './app/logout/logout-function';
import { StatisticsFunction } from './app/statistics/statistics-function';
import { Configurable } from './Configuration';
import { DynamoDbReadOnlyPolicy } from './iam/dynamodb-readonly-policy';
import { SessionsTable } from './SessionsTable';
import { Statics } from './statics';
import { Statistics } from './Statistics';
import { AppDomainUtil } from './Util';

export interface ApiStackProps extends StackProps, Configurable {
  sessionsTable: SessionsTable;
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

    this.api = new apigatewayv2.HttpApi(this, 'yivi-issue-api', {
      description: 'YIVI issue webapplicatie',
    });

    // Store apigateway ID to be used in other stacks
    new SSM.StringParameter(this, 'ssm_api_1', {
      stringValue: this.api.httpApiId,
      parameterName: Statics.ssmApiGatewayId,
    });

    // Get the base url
    const zoneName = SSM.StringParameter.valueForStringParameter(this, Statics.ssmZoneName);
    const baseUrl = AppDomainUtil.getBaseUrl(props.configuration, zoneName);

    // this.monitoringLambda();
    this.setFunctions(props, baseUrl);
  }

  /**
   * Create and configure lambda's for all api routes, and
   * add routes to the gateway.
   * @param {string} baseUrl the application url
   */
  setFunctions(props: ApiStackProps, baseUrl: string) {

    const diversifiyer = SSM.StringParameter.valueForStringParameter(this, Statics.ssmSubjectHashDiversifier);

    const statisticsLogGroup = this.setupStatisticsLogGroup();
    const statisticsLogStream = this.setupStatisticsLogGroupStream(statisticsLogGroup);

    const tickenLogGroup = this.setupTickenLogGroup();
    const tickenLogStream = this.setupTickenLogGroupStream(tickenLogGroup);

    // See https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Lambda-Insights-extension-versionsx86-64.html
    const insightsArn = `arn:aws:lambda:${this.region}:580247275435:layer:LambdaInsightsExtension:16`;

    const statistics = new Statistics(this, 'stats', { logGroup: statisticsLogGroup });

    const loginFunction = new ApiFunction(this, 'yivi-issue-login-function', {
      description: 'Login-pagina voor de YIVI issue-applicatie.',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      lambdaInsightsExtensionArn: insightsArn,
      criticality: props.configuration.criticality,
      environment: {
        AUTH_URL_BASE_SSM: StringParameter.valueForStringParameter(this, Statics.ssmAuthUrlBaseParameter),
        OIDC_CLIENT_ID_SSM: StringParameter.valueForStringParameter(this, Statics.ssmOIDCClientID),
        OIDC_SCOPE_SSM: StringParameter.valueForStringParameter(this, Statics.ssmOIDCScope),
      },
    }, LoginFunction);

    const logoutFunction = new ApiFunction(this, 'yivi-issue-logout-function', {
      description: 'Uitlog-pagina voor de YIVI issue-applicatie.',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      lambdaInsightsExtensionArn: insightsArn,
      criticality: props.configuration.criticality,
    }, LogoutFunction);

    const oidcSecret = aws_secretsmanager.Secret.fromSecretNameV2(this, 'oidc-secret', Statics.secretOIDCClientSecret);
    const authFunction = new ApiFunction(this, 'yivi-issue-auth-function', {
      description: 'Authenticatie-lambd voor de YIVI issue-applicatie.',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      criticality: props.configuration.criticality,
      environment: {
        CLIENT_SECRET_ARN: oidcSecret.secretArn,
        AUTH_URL_BASE_SSM: StringParameter.valueForStringParameter(this, Statics.ssmAuthUrlBaseParameter),
        OIDC_CLIENT_ID_SSM: StringParameter.valueForStringParameter(this, Statics.ssmOIDCClientID),
        OIDC_SCOPE_SSM: StringParameter.valueForStringParameter(this, Statics.ssmOIDCScope),
        TICKEN_LOG_GROUP_NAME: tickenLogGroup.logGroupName,
        TICKEN_LOG_STREAM_NAME: tickenLogStream.logStreamName,
      },
      lambdaInsightsExtensionArn: insightsArn,
    }, AuthFunction);
    oidcSecret.grantRead(authFunction.lambda);
    tickenLogGroup.grantWrite(loginFunction.lambda);


    const secretMTLSPrivateKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'tls-key-secret', Statics.secretMTLSPrivateKey);
    const tlskeyParam = SSM.StringParameter.fromStringParameterName(this, 'tlskey', Statics.ssmMTLSClientCert);
    const tlsRootCAParam = SSM.StringParameter.fromStringParameterName(this, 'tlsrootca', Statics.ssmMTLSRootCA);
    const secretYiviApiAccessKeyId = aws_secretsmanager.Secret.fromSecretNameV2(this, 'yivi-api-access-key', Statics.secretYiviApiAccessKeyId);
    const secretYiviApiSecretKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'yivi-api-secret-key', Statics.secretYiviApiSecretKey);
    const secretYiviApiKey = aws_secretsmanager.Secret.fromSecretNameV2(this, 'yivi-api-key', Statics.secretYiviApiKey);


    const issueFunction = new ApiFunction(this, 'yivi-issue-issue-function', {
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      description: 'Home-lambda voor de YIVI issue-applicatie.',
      criticality: props.configuration.criticality,
      environment: {
        MTLS_PRIVATE_KEY_ARN: secretMTLSPrivateKey.secretArn,
        MTLS_CLIENT_CERT_NAME: Statics.ssmMTLSClientCert,
        MTLS_ROOT_CA_NAME: Statics.ssmMTLSRootCA,
        BRP_API_URL: StringParameter.valueForStringParameter(this, Statics.ssmBrpApiEndpointUrl),
        YIVI_API_HOST: StringParameter.valueForStringParameter(this, Statics.ssmYiviApiHost),
        YIVI_API_REGION: StringParameter.valueForStringParameter(this, Statics.ssmYiviApiRegion),
        YIVI_API_DEMO: props.configuration.useDemoScheme ? 'demo' : '',
        YIVI_API_ACCESS_KEY_ID_ARN: secretYiviApiAccessKeyId.secretArn,
        YIVI_API_SECRET_KEY_ARN: secretYiviApiSecretKey.secretArn,
        YIVI_API_KEY_ARN: secretYiviApiKey.secretArn,
        STATISTICS_LOG_GROUP_NAME: statisticsLogGroup.logGroupName,
        STATISTICS_LOG_STREAM_NAME: statisticsLogStream.logStreamName,
        TICKEN_LOG_GROUP_NAME: tickenLogGroup.logGroupName,
        TICKEN_LOG_STREAM_NAME: tickenLogStream.logStreamName,
        DIVERSIFYER: diversifiyer,
        USE_LAMBDA_ROLE_FOR_YIVI_SERVER: props.configuration.useLambdaRoleForYiviServer ? 'yes' : 'no',
      },
      lambdaInsightsExtensionArn: insightsArn,
    }, IssueFunction);
    secretMTLSPrivateKey.grantRead(issueFunction.lambda);
    tlskeyParam.grantRead(issueFunction.lambda);
    tlsRootCAParam.grantRead(issueFunction.lambda);
    secretYiviApiAccessKeyId.grantRead(issueFunction.lambda);
    secretYiviApiSecretKey.grantRead(issueFunction.lambda);
    secretYiviApiKey.grantRead(issueFunction.lambda);
    statisticsLogGroup.grantWrite(issueFunction.lambda);
    tickenLogGroup.grantWrite(issueFunction.lambda);

    const statisticsFunction = new ApiFunction(this, 'yivi-issue-statistics-function', {
      description: 'Statistics-lambd voor de YIVI issue-applicatie.',
      table: this.sessionsTable,
      tablePermissions: 'ReadWrite',
      applicationUrlBase: baseUrl,
      criticality: props.configuration.criticality,
      environment: {
        TABLE_NAME: statistics.table.tableName,
      },
      lambdaInsightsExtensionArn: insightsArn,
    }, StatisticsFunction);
    statistics.table.grantReadData(statisticsFunction.lambda);

    // Allow lambda role to invoke the API in a different account
    if (props.configuration.useLambdaRoleForYiviServer) {
      const yiviServerAccount = props.configuration.yiviServerAccount;
      issueFunction.lambda.addToRolePolicy(new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:execute-api:eu-central-1:${yiviServerAccount}:*/*/POST/session`,
        ],
      }));
    }

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('yivi-issue-login', loginFunction.lambda),
      path: '/login',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('yivi-issue-logout', logoutFunction.lambda),
      path: '/logout',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('yivi-issue-auth', authFunction.lambda),
      path: '/auth',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({ // Also availabel at / due to CloudFront defaultRootObject
      integration: new HttpLambdaIntegration('yivi-issue-issue', issueFunction.lambda),
      path: '/issue',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.api.addRoutes({
      integration: new HttpLambdaIntegration('yivi-issue-statistics', statisticsFunction.lambda),
      path: '/statistics',
      methods: [apigatewayv2.HttpMethod.GET],
    });

    this.createCloudWatchInsightsQueries([
      loginFunction.lambda.logGroup,
      logoutFunction.lambda.logGroup,
      authFunction.lambda.logGroup,
      issueFunction.lambda.logGroup,
      statisticsFunction.lambda.logGroup,
    ]);


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
      roleName: 'yivi-issue-full-read',
      description: 'Read-only role for YIVI issue app with access to lambdas, logging, session store',
      assumedBy: new PrincipalWithConditions(
        new AccountPrincipal(''), //IAM account ID in statics file.
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

  setupStatisticsLogGroup() {
    const group = new logs.LogGroup(this, 'statistics-logs', {
      logGroupName: 'yivi-statistics-logs',
      retention: logs.RetentionDays.EIGHTEEN_MONTHS,
    });

    new ssm.StringParameter(this, 'statistics-logs-ssm', {
      parameterName: Statics.ssmStatisticsLogGroup,
      stringValue: group.logGroupName,
    });

    return group;
  }

  setupStatisticsLogGroupStream(group: logs.LogGroup) {
    return new logs.LogStream(this, 'statistics-log-stream', {
      logGroup: group,
      logStreamName: 'yivi-statistics-logs-stream',
    });
  }

  setupTickenLogGroup() {
    const group = new logs.LogGroup(this, 'ticken-logs', {
      logGroupName: 'yivi-ticken-logs',
      retention: logs.RetentionDays.EIGHTEEN_MONTHS,
    });

    new ssm.StringParameter(this, 'ticken-logs-ssm', {
      parameterName: Statics.ssmTickenLogGroup,
      stringValue: group.logGroupName,
    });

    return group;
  }

  setupTickenLogGroupStream(group: logs.LogGroup) {
    return new logs.LogStream(this, 'ticken-log-stream', {
      logGroup: group,
      logStreamName: 'yivi-ticken-logs-stream',
    });
  }

  createCloudWatchInsightsQueries(logGroups: logs.ILogGroup[]) {

    new logs.QueryDefinition(this, 'error-logs-query', {
      queryDefinitionName: 'Yivi/Erros in issue app',
      logGroups,
      queryString: new logs.QueryString({
        fields: ['@timestamp', '@message'],
        filterStatements: ['@message like /ERROR/'],
        sort: '@timestamp desc',
      }),
    });

    new logs.QueryDefinition(this, 'all-logs-query', {
      queryDefinitionName: 'Yivi/Logging in issue app',
      logGroups,
      queryString: new logs.QueryString({
        fields: ['@timestamp', '@message'],
        sort: '@timestamp desc',
      }),
    });

  }
}
