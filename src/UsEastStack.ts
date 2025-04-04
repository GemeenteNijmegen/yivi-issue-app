import { createHash } from 'crypto';
import { EndpointHealthCheck } from '@pepperize/cdk-route53-health-check';
import {
  aws_certificatemanager as CertificateManager,
  aws_ssm as SSM, Stack,
  StackProps,
} from 'aws-cdk-lib';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { Configurable, Configuration } from './Configuration';
import { Statics } from './statics';
import { AppDomainUtil, importProjectHostedZone } from './Util';

export interface UsEastCertificateStackProps extends StackProps, Configurable {}

export class UsEastCertificateStack extends Stack {

  constructor(scope: Construct, id: string, props: UsEastCertificateStackProps) {
    super(scope, id, props);
    this.createCertificate(props.configuration);
    this.monitorLoginPage(props.configuration);
  }

  createCertificate(configuration: Configuration) {

    const hostedZone = importProjectHostedZone(this, configuration.deployToEnvironment.region);
    const subjectAlternativeNames = AppDomainUtil.getAlternativeDomainNames(configuration);

    /**
     * When using alternative domain names we cannot use auto-creation of the validation
     * records in the hosted zone.
     */
    let validation = CertificateManager.CertificateValidation.fromDns(hostedZone);
    if (subjectAlternativeNames) {
      validation = CertificateManager.CertificateValidation.fromDns();
    }

    const certificate = new CertificateManager.Certificate(this, 'certificate', {
      domainName: hostedZone.zoneName,
      subjectAlternativeNames,
      validation: validation,
    });

    new SSM.StringParameter(this, 'cert-arn', {
      stringValue: certificate.certificateArn,
      parameterName: Statics.certificateArn,
    });

  }

  /**
   * Setup route53 health checks
   *
   * This method sets a health check on the login page, checking for a valid
   * http response, and the presence of a specific string on the page.
   *
   * @param configuration used to determine domains to monitor
   */
  monitorLoginPage(configuration: Configuration) {
    const domains = AppDomainUtil.getAlternativeDomainNames(configuration) ?? [];
    for (const domain of domains) {
      const hash = createHash('md5').update(domain).digest('base64').substring(0, 5);
      const healthCheck = new EndpointHealthCheck(this, `healthcheck-${hash}`, {
        domainName: domain,
        resourcePath: '/login',
        searchString: 'Voeg gegevens toe',
      });

      new Alarm(this, `healthcheck-alarm-${hash}`, {
        alarmName: `yivi-issue-app-healthcheck-${hash}${configuration.criticality.increase().alarmSuffix()}`,
        metric: healthCheck.metricHealthCheckStatus(),
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        threshold: 1,
        evaluationPeriods: 1,
      });
    }
  }

}