import {
  Duration,
  CustomResource,
  aws_route53 as route53,
  aws_iam as iam,
  custom_resources as customresource,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DnssecRecordFunction } from './dnssec-record-function';


export interface DnssecRecordStructProps {
  hostedZone: route53.IHostedZone;
  parentHostedZone: route53.IHostedZone;
}

export class DnssecRecordStruct extends Construct {


  constructor(scope: Construct, id: string, props: DnssecRecordStructProps) {
    super(scope, id);

    const lambda = new DnssecRecordFunction(this, 'lambda', {
      timeout: Duration.seconds(60),
    });

    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:GetDNSSEC', // Get KSK using DNSSEC
        'route53:ChangeResourceRecordSets', // Create / delete records
        'route53:GetChange', // Wait for change
      ],
      resources: [
        props.hostedZone.hostedZoneArn,
        props.parentHostedZone.hostedZoneArn,
      ],
    }));

    const customResourceProvider = new customresource.Provider(this, 'provider', {
      onEventHandler: lambda,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    new CustomResource(this, 'custom-resource', {
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        hostedZoneId: props.hostedZone.hostedZoneId,
        hostedZoneName: props.hostedZone.zoneName,
        parentHostedZoneId: props.parentHostedZone.hostedZoneId,
      },
    });

  }


}