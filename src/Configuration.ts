import { Environment as CdkEnvironment } from 'aws-cdk-lib';
import { Criticality } from './Criticality';
import { Statics } from './statics';

export interface Configurable {
  readonly configuration: Configuration;
}

/**
 * Make account and region required
 */
export interface Environment extends CdkEnvironment {
  account: string;
  region: string;
}

export interface Configuration {
  readonly deployFromEnvironment: Environment;
  readonly deployToEnvironment: Environment;
  readonly codeStarConnectionArn: string;
  readonly pipelineStackName: string;

  /**
   * The branch name this configuration is used for
   */
  readonly branchName: string;

  /**
   * If set a certificate for <value>.nijmegen.nl will be
   * generated in acm. This domain is also used in the
   * cloudfront domain names.
   * Note: enabling required adding cname records to nijmegen.nl
   */
  readonly nijmegenSubdomain?: string;

  /**
   * includePipelineValidationChcks
   */
  readonly includePipelineValidationChecks: boolean;

  /**
   * Flag to indicate the waf ratelimit should be
   * blocked or counted
   */
  readonly setWafRatelimit: boolean;

  /**
   * A list of CNAME records to register in the hosted zone
   * Note: key should be withou domain suffix (only subdomain).
   */
  readonly cnameRecords?: { [key: string]: string };

  /**
   * Set no mail records in DNS hostedzone
   * When true, add txt with spf (sender policy framework) en mx 0 records signaling no mail
   */
  readonly noMailRecords?: boolean;

  /**
   * If the issue lambda uses the demo scheme or the production scheme.
   * Note: shoud never be false except in prod.
   */
  readonly useDemoScheme: boolean;

  /**
   * Flag to indicate if the issue server should be accessed
   * using the lambda role or other IAM credentials configured in the secretsmanager.
   */
  readonly useLambdaRoleForYiviServer: boolean;

  /**
   * The account ID of the Yivi server, it is used in the IAM policy to allow
   * access to the session endpoint on the yivi server.
   */
  readonly yiviServerAccount?: string;

  /**
   * Denotes the average level of criticality used by the application
   */
  readonly criticality: Criticality;

  /**
   * Flag om Haal Centraal BRP API te gebruiken i.p.v. de standaard IRMA BRP API.
   * Wanneer true wordt de Haal Centraal API gebruikt voor het ophalen van persoonsgegevens.
   */
  readonly useHaalCentraalBrp: boolean;

  /**
   * The batch size for SD-JWT VC issuance. When set, the sdJwtBatchSize field
   * is added to each credential in the issuance request, enabling SD-JWT VC
   * issuance alongside Idemix. When undefined, no SD-JWT VCs are issued.
   *
   * @see https://docs.yivi.app/sdjwtvc-issuance/#step-4-update-issuance-session-request
   */
  readonly sdJwtBatchSize?: number;
}

export function getConfiguration(branchName: string): Configuration {
  if (Object.keys(configurations).includes(branchName)) {
    return configurations[branchName];
  }
  throw Error(`No configuration found for branch name ${branchName}`);
}

const configurations: { [name: string]: Configuration } = {
  acceptance: {
    branchName: 'acceptance',
    pipelineStackName: 'yivi-issue-pipeline-acceptance',
    deployFromEnvironment: Statics.gnBuildEnvironment,
    deployToEnvironment: Statics.gnYiviAccpEnvironment,
    codeStarConnectionArn: Statics.codeStarConnectionArn,
    includePipelineValidationChecks: false,
    setWafRatelimit: false, // False for pentesting?
    useDemoScheme: true,
    nijmegenSubdomain: 'yivi.accp', // yivi.accp.nijmegen.nl
    useLambdaRoleForYiviServer: true,
    yiviServerAccount: '528030426040',
    cnameRecords: {
      _9699982ccd3555be4d8f02a487a0287e: '_1d0dce24777d3d1257367aa28e6816c7.fgsdscwdjl.acm-validations.aws',
    },
    noMailRecords: true,
    criticality: new Criticality('medium'),
    useHaalCentraalBrp: true, // Haal Centraal BRP API aan op acceptance
    sdJwtBatchSize: 50, // Yivi default value
  },
  production: {
    branchName: 'production',
    pipelineStackName: 'yivi-issue-pipeline-production',
    deployFromEnvironment: Statics.gnBuildEnvironment,
    deployToEnvironment: Statics.gnYiviProdEnvironment,
    codeStarConnectionArn: Statics.codeStarConnectionArn,
    includePipelineValidationChecks: false,
    setWafRatelimit: true,
    useDemoScheme: false,
    nijmegenSubdomain: 'yivi', // yivi.nijmegen.nl
    useLambdaRoleForYiviServer: true,
    yiviServerAccount: '079163754011',
    cnameRecords: {
      _e573bcd00b0f468178ff502aeb92eae3: '_df939a5caaba3eef9055e611864019d2.yghrkwvzvz.acm-validations.aws.',
    },
    criticality: new Criticality('high'),
    useHaalCentraalBrp: true,
    sdJwtBatchSize: 50, // Yivi default value
  },
};