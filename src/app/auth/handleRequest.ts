import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { Session } from '@gemeentenijmegen/session';
import { IdTokenClaims } from 'openid-client';
import { DigidLoa } from '../code/DigiDLoa';
import { logger } from '../code/Logger';
import { LogsUtil } from '../code/LogsUtil';
import { OpenIDConnect } from '../code/OpenIDConnect';

export interface HandlerParameters {
  cookies?: string;
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export async function handleRequest(
  params: HandlerParameters,
  dynamoDBClient: DynamoDBClient,
  OIDC: OpenIDConnect,
  logsClient: CloudWatchLogsClient,
) {
  if (params.error) {
    logger.info('Not starting authentication', { error: params.error, errorDescription: params.error_description });
    return Response.redirect('/login');
  }

  let session = new Session(params.cookies ?? '', dynamoDBClient);
  await session.init();

  if (session.sessionId === false) {
    logger.info('No session found');
    return Response.redirect('/login');
  }
  const state = session.getValue('state');

  try {
    if (!params.code || !params.state) {
      throw Error('Invalid request: code or state missing in request');
    }
    const claims = await OIDC.authorize(params.code, state, params.state);
    await LogsUtil.logToCloudWatch(logsClient, 'TICK: DigiD', process.env.TICKEN_LOG_GROUP_NAME, process.env.TICKEN_LOG_STREAM_NAME);
    return await authenticate(session, claims);
  } catch (error: any) {
    logger.error('Authentication failed', { error: error.message });
    return Response.redirect('/login');
  }
}

/**
 * Try to authenticate a user based on the OIDC claims, register
 * in the session and send a redirect to the main page.
 * @param session session object
 * @param claims the OIDC claims
 * @param logger logging
 * @returns
 */
async function authenticate(session: Session, claims: IdTokenClaims) {
  if (claims && claims.hasOwnProperty('acr')) {
    const loa = claims.acr;
    if (loa == DigidLoa.Basis) {
      logger.error('Authentication using DigiD loa Basis is used');
      return Response.redirect('/login?loa_error=true');
    }
    await session.createSession({
      loggedin: { BOOL: true },
      bsn: { S: claims.sub },
      loa: { S: loa },
    });
    logger.info('Authentication successful', { loa });
  } else {
    logger.error('Insufficient OIDC claims');
    return Response.redirect('/login');
  }
  return Response.redirect('/', 302, session.getCookie({ sameSite: 'lax' }));
}