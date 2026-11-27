import { CloudWatchLogsClient, GetQueryResultsCommand, QueryStatus, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { logger } from '../../src/app/code/Logger';
import { handler } from '../../src/lambdas/statistics/CalculateStatistics.lambda';

const logsMock = mockClient(CloudWatchLogsClient);
const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  logsMock.reset();
  ddbMock.reset();
  jest.spyOn(logger, 'info').mockImplementation();
  jest.spyOn(logger, 'error').mockImplementation();
  logsMock.on(StartQueryCommand).resolves({ queryId: 'q1' });
  logsMock.on(GetQueryResultsCommand).resolves({ status: QueryStatus.Complete, results: [[{ field: 'issued', value: '42' }]] });
});

async function run(scope: string, day: string) {
  await handler({ scope, beginDate: day, endDate: day }, {} as any);
  return {
    query: logsMock.commandCalls(StartQueryCommand)[0].args[0].input,
    item: ddbMock.commandCalls(PutItemCommand)[0].args[0].input.Item!,
  };
}

test('yearly run on Jan 1 2026 counts all of 2025 and stores it under 2025', async () => {
  const { query, item } = await run('year', '2026-01-01T12:00:00');
  expect(query.startTime).toBe(new Date(2025, 0, 1).getTime());
  expect(query.endTime).toBe(new Date(2026, 0, 1).getTime());
  expect(item.date.S).toBe('2025');
  expect(item.type.S).toBe('year');
  expect(item.value.N).toBe('42');
});

test('monthly run on Dec 1 2025 includes the last day of November', async () => {
  const { query, item } = await run('month', '2025-12-01T12:00:00');
  expect(query.startTime).toBe(new Date(2025, 10, 1).getTime());
  expect(query.endTime).toBe(new Date(2025, 11, 1).getTime());
  expect(item.date.S).toBe('2025-11');
});

test('daily run on Mar 1 2025 counts Feb 28 and stores it under 2025-02-28', async () => {
  const { query, item } = await run('day', '2025-03-01T12:00:00');
  expect(query.startTime).toBe(new Date(2025, 1, 28).getTime());
  expect(query.endTime).toBe(new Date(2025, 2, 1).getTime());
  expect(item.date.S).toBe('2025-02-28');
  expect(item.type.S).toBe('day');
});
