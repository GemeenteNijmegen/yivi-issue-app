import { randomUUID } from 'crypto';
import { CloudWatchLogsClient, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient, GetItemCommand, GetItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommandOutput, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import { handleRequest } from '../../src/app/auth/handleRequest';
import { logger } from '../../src/app/code/Logger';
import { OpenIDConnect } from '../../src/app/code/OpenIDConnect';

jest.mock('@gemeentenijmegen/utils/lib/AWS', () => ({
  AWS: {
    getParameter: jest.fn().mockImplementation((name) => name),
    getSecret: jest.fn().mockImplementation((arn) => arn),
  },
}));

const OIDC = new OpenIDConnect();

beforeAll( async () => {

  jest.spyOn(logger, 'error'); // spied always: tests assert on it
  if (process.env.VERBOSETESTS!='True') {
    global.console.error = jest.fn();
    global.console.info = jest.fn();
    global.console.time = jest.fn();
    global.console.log = jest.fn();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
  }

  // Set env variables
  process.env.SESSION_TABLE = 'mijnuitkering-sessions';
  process.env.AUTH_URL_BASE_SSM = 'https://authenticatie-accp.nijmegen.nl';
  process.env.APPLICATION_URL_BASE = 'https://testing.example.com/';
  process.env.CLIENT_SECRET_ARN = '123';
  process.env.OIDC_CLIENT_ID_SSM = '1234';
  process.env.OIDC_SCOPE_SSM = 'openid';

  process.env.TICKEN_LOG_GROUP_NAME= 'ticken-group';
  process.env.TICKEN_LOG_STREAM_NAME = 'ticken-stream';

  await OIDC.init();

  const output: GetSecretValueCommandOutput = {
    $metadata: {},
    SecretString: 'ditiseennepgeheim',
  };
  secretsMock.on(GetSecretValueCommand).resolves(output);

});

const logsMock = mockClient(CloudWatchLogsClient);
const ddbMock = mockClient(DynamoDBClient);
const secretsMock = mockClient(SecretsManagerClient);


jest.mock('openid-client', () => {
  const originalClient = jest.requireActual('openid-client');
  return {
    ...originalClient,
    Issuer: jest.fn(() => {
      // If we do not comment this out tests fail. However not sure of the impact of it
      // See: https://jestjs.io/docs/jest-object#jestrequireactualmodulename
      //const originalIssuer = jest.requireActual('openid-client/lib/issuer');
      return {
        Client: jest.fn(() => {
          return {
            callback: jest.fn(() => {
              return {
                claims: jest.fn(() => {
                  return {
                    aud: '1234',
                    sub: '12345',
                    acr: 'urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract',
                  };
                }),
              };
            }),
            callbackParams: jest.fn(() => {}),
          };
        }),
        //...originalIssuer,
      };
    }),
  };
});

beforeEach(() => {
  ddbMock.reset();
  logsMock.reset();
});

test('Successful auth redirects to home', async () => {
  const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
  const logsClient = new CloudWatchLogsClient({ region: 'eu-west-1' });
  const sessionId = '12345';
  const getItemOutput: Partial<GetItemCommandOutput> = {
    Item: {
      data: {
        M: {
          loggedin: { BOOL: true },
          bsn: { S: '12345678' },
          state: { S: '12345' },
        },
      },
    },
  };
  ddbMock.on(GetItemCommand).resolves(getItemOutput);
  logsMock.on(PutLogEventsCommand).resolves({
    $metadata: {
      requestId: randomUUID(),
    },
  });

  const result = await handleRequest(params(`session=${sessionId}`, 'state', '12345'), dynamoDBClient, OIDC, logsClient);
  expect(result.statusCode).toBe(302);
  expect(result.headers?.Location).toBe('/');
});


test('Successful auth creates new session', async () => {
  const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
  const logsClient = new CloudWatchLogsClient({ region: 'eu-west-1' });

  const sessionId = '12345';
  const getItemOutput: Partial<GetItemCommandOutput> = {
    Item: {
      data: {
        M: {
          loggedin: { BOOL: false },
          state: { S: '12345' },
        },
      },
    },
  };
  ddbMock.on(GetItemCommand).resolves(getItemOutput);
  logsMock.on(PutLogEventsCommand).resolves({});

  const result = await handleRequest(params(`session=${sessionId}`, 'state', '12345'), dynamoDBClient, OIDC, logsClient);
  expect(result.statusCode).toBe(302);
  expect(result.headers?.Location).toBe('/');
  expect(result.cookies).toContainEqual(expect.stringContaining('session='));
});

test('No session redirects to login', async () => {
  const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
  const logsClient = new CloudWatchLogsClient({ region: 'eu-west-1' });
  logsMock.on(PutLogEventsCommand).resolves({});
  const result = await handleRequest(params('', 'state', 'state'), dynamoDBClient, OIDC, logsClient);
  expect(result.statusCode).toBe(302);
  expect(result.headers?.Location).toBe('/login');
});

test('Error does not start authentication', async () => {
  const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
  const logsClient = new CloudWatchLogsClient({ region: 'eu-west-1' });
  logsMock.on(PutLogEventsCommand).resolves({});
  const result = await handleRequest(params('', 'state', 'state', 'access_denied', 'User cancelled authentication'), dynamoDBClient, OIDC, logsClient);
  expect(result.statusCode).toBe(302);
  expect(result.headers?.Location).toBe('/login');
});


test('Incorrect state errors', async () => {
  const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
  const logsClient = new CloudWatchLogsClient({ region: 'eu-west-1' });
  const sessionId = '12345';
  const getItemOutput: Partial<GetItemCommandOutput> = {
    Item: {
      loggedin: {
        BOOL: false,
      },
      state: {
        S: '12345',
      },
    },
  };
  ddbMock.on(GetItemCommand).resolves(getItemOutput);
  mockClient(logsClient).resolves({});

  const result = await handleRequest(params(`session=${sessionId}`, '12345', 'returnedstate'), dynamoDBClient, OIDC, logsClient);
  expect(result.statusCode).toBe(302);
  expect(result.headers?.Location).toBe('/login');
  expect(logger.error).toHaveBeenCalledWith('Authentication failed', expect.anything());
});

function params(cookies: string, code: string, state: string, error?: string, error_description?: string) {
  return {
    cookies,
    code,
    state,
    error,
    error_description,
  };
}