import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { HandlerParameters, handleRequest } from './handleRequest';
import { logger } from '../code/Logger';
import { OpenIDConnect } from '../code/OpenIDConnect';

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });

function parseEvent(event: any) : HandlerParameters {
  return {
    cookies: event?.cookies?.join(';'),
    code: event?.queryStringParameters?.code,
    state: event?.queryStringParameters?.state,
    error: event?.queryStringParameters?.error,
    error_description: event?.queryStringParameters?.error_description,
  };
}

const OIDC = new OpenIDConnect();
const init = OIDC.init();

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  logger.addContext(context);
  try {
    await init;
    const params = parseEvent(event);
    return await handleRequest(params, dynamoDBClient, OIDC, logsClient);
  } catch (err) {
    logger.error('Unhandled error', err as Error);
    return Response.error();
  }
}