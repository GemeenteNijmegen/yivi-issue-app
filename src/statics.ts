export abstract class Statics {
  static readonly projectName: string = 'yivi-issue-app';
  static readonly sessionTableName: string = 'yivi-issue-sessions';

  // Statistics
  static readonly ssmStatisticsLogGroup: string =
    '/cdk/yivi-issue-app/statistics/logs/log-group-name';
  static readonly ssmTickenLogGroup: string =
    '/cdk/yivi-issue-app/ticken/logs/log-group-name';

  /**
   * IAM params
   */
  static readonly iamAccountId: string = '098799052470';
  static readonly ssmReadOnlyRoleArn: string =
    '/cdk/yivi-issue-app/role-readonly-arn';

  /**
   * Authentication URL base, used in auth and login lambda
   */
  static readonly ssmAuthUrlBaseParameter: string =
    '/cdk/yivi-issue-app/authUrlBase';
  /**
   * OpenID Connect client ID (sent in URL as querystring-param, not secret)
   */
  static readonly ssmOIDCClientID: string = '/cdk/yivi-issue-app/authClientID';
  /**
   * OpenID Connect scope
   */
  static readonly ssmOIDCScope: string = '/cdk/yivi-issue-app/authScope';

  /**
   * OpenID Connect secret name
   */
  static readonly secretOIDCClientSecret: string =
    '/cdk/yivi-issue-app/oidc-clientsecret';

  /**
   * Certificate private key for mTLS
   */
  static readonly secretMTLSPrivateKey: string =
    '/cdk/yivi-issue-app/mtls-privatekey';

  /**
   * Certificate for mTLS
   */
  static readonly ssmMTLSClientCert: string =
    '/cdk/yivi-issue-app/mtls-clientcert';

  /**
   * Root CA for mTLS (PKIO root)
   */
  static readonly ssmMTLSRootCA: string = '/cdk/yivi-issue-app/mtls-rootca';

  /**
   * BRP API endpoint
   */
  static readonly ssmBrpApiEndpointUrl: string =
    '/cdk/yivi-issue-app/brp-api-url';

  /**
   * Haal Centraal BRP API endpoint
   */
  static readonly ssmHaalCentraalBrpApiEndpointUrl: string =
    '/cdk/yivi-issue-app/hc-brp-api-url';

  /**
   * Haal Centraal BRP API key
   */
  static readonly secretHaalCentraalBrpApiKey: string =
    '/cdk/yivi-issue-app/hc-brp-api-key';

  /**
   * Route53 Zone ID and name for csp-nijmegen.nl in this account.
   * NB: This depends on the eform-project existing and having set this parameter!
   * We need to use this zone for domain validation purposes. We need to be able to
   * set CNAME DNS-records on the main domain.
   *
   * We need both because a lookup using fromHostedZoneId fails when adding new records,
   * this returns an incomplete iHostedZone (without name).
   */
  static readonly cspRootZoneId: string =
    '/gemeente-nijmegen/formio/hostedzone/id';
  static readonly cspRootZoneName: string =
    '/gemeente-nijmegen/formFio/hostedzone/name';

  // Managed in dns-managment project:
  // Below references the new hosted zone separeted from webformulieren
  static readonly accountRootHostedZonePath: string =
    '/gemeente-nijmegen/account/hostedzone';
  static readonly accountRootHostedZoneId: string =
    '/gemeente-nijmegen/account/hostedzone/id';
  static readonly accountRootHostedZoneName: string =
    '/gemeente-nijmegen/account/hostedzone/name';
  // The KSM key parameters for each account
  static readonly ssmAccountDnsSecKmsKey: string =
    '/gemeente-nijmegen/account/dnssec/kmskey/arn';

  /**
   * Route53 Zone ID and name for the zone for YIVI issue app. decouples stacks to not pass
   * the actual zone between stacks. This param is set by DNSStack and should not be modified after.
   */
  static readonly ssmZonePath: string = '/cdk/yivi-issue-app/zone';
  static readonly ssmZoneId: string = '/cdk/yivi-issue-app/zone/id';
  static readonly ssmZoneName: string = '/cdk/yivi-issue-app/zone/name';

  static readonly certificatePath: string = '/cdk/yivi-issue-app/certificates';
  static readonly certificateArn: string =
    '/cdk/yivi-issue-app/certificates/certificate-arn';

  static readonly ssmApiGatewayId: string = '/cdk/yivi-issue-app/apigateway-id';

  static readonly ssmSessionsTableArn: string =
    '/cdk/yivi-issue-app/sessionstable-arn';

  static readonly ssmDataKeyArn: string = '/cdk/yivi-issue-app/kms-datakey-arn';

  static readonly wafPath: string = '/cdk/yivi-issue-app/waf';
  static readonly ssmWafAclArn: string = '/cdk/yivi-issue-app/waf/acl-arn';

  static readonly ssmMonitoringLambdaArn: string =
    '/cdk/yivi-issue-app/monitoring-lambda-arn';

  static readonly ssmSubjectHashDiversifier: string =
    '/cdk/yivi-issue-app/subject/diversifier';

  /**
   * Access to the yivi issue server
   */
  static readonly ssmYiviApiHost: string = '/cdk/yivi-issue-app/yivi-api-host';
  static readonly ssmYiviApiRegion: string =
    '/cdk/yivi-issue-app/yivi-api-region';
  static readonly ssmYiviApiDemo: string = '/cdk/yivi-issue-app/yivi-api-demo';
  static readonly secretYiviApiAccessKeyId: string =
    '/cdk/yivi-issue-app/yivi-api-access-key-id';
  static readonly secretYiviApiSecretKey: string =
    '/cdk/yivi-issue-app/yivi-api-secret-key';
  static readonly secretYiviApiKey: string = '/cdk/yivi-issue-app/yivi-api-key';

  static readonly codeStarConnectionArn: string =
    'arn:aws:codestar-connections:eu-central-1:836443378780:connection/9d20671d-91bc-49e2-8680-59ff96e2ab11';

  /**
   * Environments (in new lz)
   */
  static readonly gnBuildEnvironment = {
    account: '836443378780',
    region: 'eu-central-1',
  };

  static readonly gnYiviAccpEnvironment = {
    account: '699363516011',
    region: 'eu-central-1',
  };

  static readonly gnYiviProdEnvironment = {
    account: '185512167111',
    region: 'eu-central-1',
  };
}
