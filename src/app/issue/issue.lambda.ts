import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ApiClient } from '@gemeentenijmegen/apiclient';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { Context } from 'aws-lambda';
import { BrpApi } from './BrpApi';
import { HaalCentraalBrpApi } from './HaalCentraalBrpApi';
import { IssueRequestHandler } from './issueRequestHandler';
import { YiviApi } from '../code/YiviApi';

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });

const yiviApi = new YiviApi();

const useHaalCentraal = process.env.USE_HAAL_CENTRAAL_BRP === 'yes';

let brpApi: BrpApi | HaalCentraalBrpApi;

async function init() {
  const promiseYiviApi = yiviApi.init();

  if (useHaalCentraal) {
    console.info('Using Haal Centraal BRP API');
    const brpClient = await ApiClient.fromParameterStore(
      process.env.HC_MTLS_CLIENT_CERT_NAME!,
      process.env.HC_MTLS_ROOT_CA_NAME!,
      process.env.HC_MTLS_PRIVATE_KEY_ARN!,
    );
    brpApi = new HaalCentraalBrpApi(brpClient);
  } else {
    const brpClient = new ApiClient();
    await brpClient.init();
    brpApi = new BrpApi(brpClient);
  }

  const promiseBrpApi = brpApi.init();
  return Promise.all([promiseBrpApi, promiseYiviApi]);
}

const initPromise = init();

function parseEvent(event: any, context: Context) {
  return {
    cookies: event?.cookies?.join(';'),
    requestId: context.awsRequestId,
  };
}

export async function handler(event: any, context: Context) {
  try {
    await initPromise;

    const params = parseEvent(event, context);
    const issueRequestHandler = new IssueRequestHandler({
      dynamoDBClient,
      logsClient,
      brpApi,
      yiviApi,
    });
    return await issueRequestHandler.handle(params);

  } catch (err) {
    console.error(err);
    return Response.error();
  }
}
