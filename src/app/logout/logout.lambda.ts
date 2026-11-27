import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { Context } from 'aws-lambda';
import { handleLogoutRequest } from './handleLogoutRequest';
import { logger } from '../code/Logger';

const dynamoDBClient = new DynamoDBClient({});

function parseEvent(event: any) {
  return {
    cookies: event?.cookies?.join(';'),
  };
}

exports.handler = async (event: any, context: Context) => {
  logger.addContext(context);
  try {
    const params = parseEvent(event);
    return await handleLogoutRequest(params.cookies, dynamoDBClient);
  } catch (err) {
    logger.error('Unhandled error', err as Error);
    return Response.error();
  }
};