import { PermissionsBoundaryAspect } from '@gemeentenijmegen/aws-constructs';
import { Stack, Tags, Stage, aws_ssm as SSM, aws_secretsmanager as SecretsManager, StageProps, Aspects } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Statics } from './statics';

/**
 * Stage for creating SSM parameters. This needs to run
 * before stages that use them.
 */

export class ParameterStage extends Stage {
  constructor(scope: Construct, id: string, props: StageProps) {
    super(scope, id, props);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);
    Aspects.of(this).add(new PermissionsBoundaryAspect());


    new ParameterStack(this, 'params');
  }
}
/**
 * Stack that creates ssm parameters for the application.
 * These need to be present before stack that use them.
 */

export class ParameterStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    new ssmParamsConstruct(this, 'plain');
  }
}
/**
 * All SSM parameters needed for the application.
 * Some are created with a sensible default, others are
 * empty and need to be filled or changed via the console.
 */

export class ssmParamsConstruct extends Construct {

  constructor(scope: Construct, id: string) {
    super(scope, id);
    Tags.of(this).add('cdkManaged', 'yes');
    Tags.of(this).add('Project', Statics.projectName);

    /**
     * authentication parameters
     */
    new SSM.StringParameter(this, 'ssm_auth_1', {
      stringValue: 'https://authenticatie-accp.nijmegen.nl',
      parameterName: Statics.ssmAuthUrlBaseParameter,
    });

    new SSM.StringParameter(this, 'ssm_auth_2', {
      stringValue: 'eQLZc8Wl0luIr5PZoajjFUt3tMPMAKHf',
      parameterName: Statics.ssmOIDCClientID,
    });

    new SSM.StringParameter(this, 'ssm_auth_3', {
      stringValue: 'openid idp_scoping:simulator service:DigiD_Midden idp_scoping:digid',
      parameterName: Statics.ssmOIDCScope,
    });

    new SSM.StringParameter(this, 'ssm_uitkering_2', {
      stringValue: '-',
      parameterName: Statics.ssmMTLSClientCert,
    });

    new SSM.StringParameter(this, 'ssm_uitkering_3', {
      stringValue: '-',
      parameterName: Statics.ssmMTLSRootCA,
    });

    new SecretsManager.Secret(this, 'secret_1', {
      secretName: Statics.secretOIDCClientSecret,
      description: 'OpenIDConnect client secret',
    });

    new SecretsManager.Secret(this, 'secret_2', {
      secretName: Statics.secretMTLSPrivateKey,
      description: 'mTLS certificate private key',
    });

    new SSM.StringParameter(this, 'ssm_brp_1', {
      stringValue: '-',
      parameterName: Statics.ssmBrpApiEndpointUrl,
    });

    new SSM.StringParameter(this, 'ssm_api_1', {
      stringValue: '-',
      parameterName: Statics.ssmYiviApiHost,
    });

    new SSM.StringParameter(this, 'ssm_api_2', {
      stringValue: 'eu-central-1',
      parameterName: Statics.ssmYiviApiRegion,
    });

    new SecretsManager.Secret(this, 'secret_api_1', {
      secretName: Statics.secretYiviApiAccessKeyId,
      description: 'YIVI API Access Key ID (AWS sign)',
    });

    new SecretsManager.Secret(this, 'secret_api_2', {
      secretName: Statics.secretYiviApiSecretKey,
      description: 'YIVI API Secret Key (AWS sign)',
    });

    new SecretsManager.Secret(this, 'secret_api_3', {
      secretName: Statics.secretYiviApiKey,
      description: 'YIVI API key',
    });

    new SSM.StringParameter(this, 'ssm_statistics_2', {
      stringValue: '-',
      parameterName: Statics.ssmSubjectHashDiversifier,
    });

    /**
     * Haal Centraal BRP parameters
     */
    new SSM.StringParameter(this, 'ssm_hc_brp_1', {
      stringValue: '-',
      parameterName: Statics.ssmHaalCentraalBrpApiEndpointUrl,
    });

    new SSM.StringParameter(this, 'ssm_hc_mtls_cert', {
      stringValue: '-',
      parameterName: Statics.ssmHaalCentraalMTLSClientCert,
    });

    new SSM.StringParameter(this, 'ssm_hc_mtls_ca', {
      stringValue: '-',
      parameterName: Statics.ssmHaalCentraalMTLSRootCA,
    });

    new SecretsManager.Secret(this, 'secret_hc_mtls_key', {
      secretName: Statics.secretHaalCentraalMTLSPrivateKey,
      description: 'Haal Centraal mTLS certificate private key',
    });

    new SecretsManager.Secret(this, 'secret_hc_brp_api_key', {
      secretName: Statics.secretHaalCentraalBrpApiKey,
      description: 'Haal Centraal BRP API key',
    });
  }
}
