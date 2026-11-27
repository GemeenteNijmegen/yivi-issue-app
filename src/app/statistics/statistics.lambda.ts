import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { StatisticsRequestHandler } from './StatisticsRequestHandler';
import { logger } from '../code/Logger';

const dynamoDBClient = new DynamoDBClient({});
const handler = new StatisticsRequestHandler(dynamoDBClient);

function parseEvent(event: APIGatewayProxyEventV2) {
  return {
    scope: event.queryStringParameters?.scope,
  };
}

exports.handler = async (event: APIGatewayProxyEventV2, context: Context) => {
  logger.addContext(context);
  try {
    const params = parseEvent(event);
    if (params.scope) {
      return await handler.handleStatisticsDataRequest(params.scope);
    }
    return await handler.handleStatisticsRequest();
  } catch (err) {
    logger.error('Unhandled error', err as Error);
    return Response.error();
  }
};