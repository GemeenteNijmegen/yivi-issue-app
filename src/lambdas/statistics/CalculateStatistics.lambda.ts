import { CloudWatchLogsClient, GetQueryResultsCommand, QueryStatus, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Context } from 'aws-lambda';
import { logger } from '../../app/code/Logger';

const dynamoDBClient = new DynamoDBClient({});
const logsClient = new CloudWatchLogsClient();

export async function handler(event: any, context: Context) {
  logger.addContext(context);
  const scope = event.scope;
  const beginDate = event.beginDate;
  const endDate = event.endDate ?? new Date();
  logger.info('Calculating statistics', { event });

  // Triggerd by EventBridge rule
  if (!beginDate) {
    await startCalculation(scope, new Date());
    return;
  }

  logger.info('Calculating for multiple days', { beginDate, endDate });
  const dates = getDates(scope, new Date(Date.parse(beginDate)), new Date(Date.parse(endDate)));
  for (const date of dates) {
    logger.info('Calculating for date', { date: date.toISOString() });
    await startCalculation(scope, date);
  }
}

async function startCalculation(scope: string, date: Date) {
  try {
    if (scope == 'month') {
      logger.info('Monthly calculations');
      await calculateMonlthyStatistics(date);
    } else if (scope == 'year') {
      logger.info('Annual calculations');
      await calculateAnnualStatistics(date);
    } else {
      logger.info('Daily calculations');
      await calculateDailyStatistics(date);
    }
  } catch (error) {
    logger.error('Statistics calculation failed', error as Error);
  }
}

async function calculateAnnualStatistics(date: Date) {
  const start = new Date(date.getFullYear()-1, 0, 1, 0, 0, 0, 0); // Jan 1 last year
  const end = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0); // Jan 1 this year
  const dateStamp = localDateStamp(start).substring(0, 4);
  logger.info('Storing statistics', { dateStamp });
  const count = await getStatistics(start.getTime(), end.getTime());
  await storeInDynamodb(dateStamp, count, 'year');
}


async function calculateMonlthyStatistics(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth()-1, 1, 0, 0, 0, 0); // First of last month
  const end = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0); // First of this month
  const dateStamp = localDateStamp(start).substring(0, 7);
  logger.info('Storing statistics', { dateStamp });
  const count = await getStatistics(start.getTime(), end.getTime());
  await storeInDynamodb(dateStamp, count, 'month');
}

async function calculateDailyStatistics(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()-1, 0, 0, 0, 0); // 00.00 yesterday
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0); // 00.00 today
  const dateStamp = localDateStamp(start).substring(0, 10);
  logger.info('Storing statistics', { dateStamp });
  const count = await getStatistics(start.getTime(), end.getTime());
  await storeInDynamodb(dateStamp, count, 'day');
}

// YYYY-MM-DD in local time: toISOString() is UTC and shifts local midnight to the previous day outside UTC
function localDateStamp(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function storeInDynamodb(dateStemp: string, value: string, type: string) {
  await dynamoDBClient.send(new PutItemCommand({
    Item: {
      type: { S: type },
      date: { S: dateStemp },
      value: { N: value },
    },
    TableName: process.env.TABLE_NAME!,
  }));
}

async function getStatistics(startTime: number, endTime: number) {
  // Start a query
  const query = await logsClient.send(new StartQueryCommand({
    logGroupName: process.env.LOG_GROUP,
    queryString: 'filter not isempty(subject) and issueAttempt == 1 \
                | stats count(subject) as issued',
    startTime: startTime,
    endTime: endTime,
  }));

  // Wait for query to be done
  let results = undefined;
  let count = 0;
  do {
    if (count > 60) {
      throw Error('Cannot get query results');
    }
    await sleep(1000);

    const response = await logsClient.send(new GetQueryResultsCommand({
      queryId: query.queryId,
    }));
    if (response.status == QueryStatus.Complete) {
      results = response.results;
    }
  } while (results == undefined);

  if (!results || results.length == 0) {
    return '0';
  }
  return results[0][0].value ?? '-1';
}

async function sleep(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}

function getDates(stepsize: 'day'| 'month' | 'year', startDate: Date, stopDate: Date): Date[] {
  var dateArray = new Array();
  var currentDate = startDate;
  while (currentDate <= stopDate) {
    dateArray.push(new Date (currentDate));
    if (stepsize=='day') {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (stepsize=='month') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    }
  }
  return dateArray;
}
