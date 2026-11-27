import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { handleLoginRequest } from './loginRequestHandler';
import { logger } from '../code/Logger';
import { OpenIDConnect } from '../code/OpenIDConnect';

const dynamoDBClient = new DynamoDBClient({});

function parseEvent(event: APIGatewayProxyEventV2) {
  return {
    loaerror: event?.queryStringParameters?.loa_error,
    cookies: event?.cookies?.join(';'),
  };
}

const OIDC = new OpenIDConnect();
const init = OIDC.init();

export async function handler (event: APIGatewayProxyEventV2, context: Context) {
  logger.addContext(context);
  await init;
  try {
    const params = parseEvent(event);
    const response = await handleLoginRequest(params, dynamoDBClient, OIDC);
    return response;
  } catch (err) {
    logger.error('Unhandled error', err as Error);
    return Response.error();
  }
};