import { Duration } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { CalculateStatisticsFunction } from './lambdas/statistics/CalculateStatistics-function';

interface StatisticsProps {
  logGroup: LogGroup;
}
export class Statistics extends Construct {
  public readonly table: Table;
  constructor(scope: Construct, id: string, props: StatisticsProps) {
    super(scope, id);
    this.table = this.createTable();
    this.setupStatisticsPublication(props.logGroup, this.table);
  }

  createTable() {
    const table = new Table(this, 'statistics', {
      partitionKey: { name: 'type', type: AttributeType.STRING },
      sortKey: { name: 'date', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    return table;
  }
  setupStatisticsPublication(logGroup: LogGroup, table: ITable) {
    const calculateStatistics = new CalculateStatisticsFunction(this, 'calculate-statistics', {
      environment: {
        TABLE_NAME: table.tableName,
        LOG_GROUP: logGroup.logGroupName,
        POWERTOOLS_SERVICE_NAME: 'calculate-statistics',
      },
      timeout: Duration.minutes(5),
    });
    logGroup.grantRead(calculateStatistics);
    table.grantReadWriteData(calculateStatistics);
    calculateStatistics.addToRolePolicy(new PolicyStatement({
      actions: ['logs:StartQuery'],
      resources: [
        logGroup.logGroupArn,
      ],
    }));
    calculateStatistics.addToRolePolicy(new PolicyStatement({
      actions: ['logs:GetQueryResults'],
      resources: ['*'],
    }));

    new Rule(this, 'calculate-statistics-day', {
      schedule: Schedule.cron({
        hour: '3',
        minute: '0',
      }),
      targets: [new LambdaFunction(calculateStatistics, {
        event: RuleTargetInput.fromObject({
          scope: 'day',
        }),
      })],
    });

    new Rule(this, 'calculate-statistics-month', {
      schedule: Schedule.cron({
        day: '1',
        hour: '3',
        minute: '0',
      }),
      targets: [new LambdaFunction(calculateStatistics, {
        event: RuleTargetInput.fromObject({
          scope: 'month',
        }),
      })],
    });

    new Rule(this, 'calculate-statistics-year', {
      schedule: Schedule.cron({
        month: '1', // Jan 1 03.00 every year
        day: '1',
        hour: '3',
        minute: '0',
      }),
      targets: [new LambdaFunction(calculateStatistics, {
        event: RuleTargetInput.fromObject({
          scope: 'year',
        }),
      })],
    });

    return table;
  }
}
