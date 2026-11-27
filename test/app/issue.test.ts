import { randomUUID } from 'crypto';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ApiClient } from '@gemeentenijmegen/apiclient';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { DigidLoa } from '../../src/app/code/DigiDLoa';
import { YiviApi } from '../../src/app/code/YiviApi';
import { BrpApi } from '../../src/app/issue/BrpApi';
import { HaalCentraalBrpApi } from '../../src/app/issue/HaalCentraalBrpApi';
import { IssueRequestHandler } from '../../src/app/issue/issueRequestHandler';
import { TestUtils } from '../other/TestUtils';

const ddbMock = mockClient(DynamoDBClient);
mockClient(CloudWatchLogsClient);
const axiosMock = new MockAdapter(axios);

const brpApi = new BrpApi(new ApiClient('cert', 'key', 'ca'));
const yiviApi = new YiviApi();

// Mock SSM and Secrets manager utility (cannot be moved to TestUtils)
jest.mock('@gemeentenijmegen/utils/lib/AWS', () => ({
  AWS: {
    getParameter: jest.fn().mockImplementation((name) => `${name}`),
    getSecret: jest.fn().mockImplementation((arn) => `${arn}`),
  },
}));

beforeAll(async () => {
  // Mock the logging functions (can be used to check for precense of logging)
  // console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  console.error = jest.fn();
  console.time = jest.fn();

  process.env.STATISTICS_LOG_GROUP_NAME = 'statistics-group';
  process.env.STATISTICS_LOG_STREAM_NAME = 'statistics-stream',
  process.env.TICKEN_LOG_GROUP_NAME= 'ticken-group';
  process.env.TICKEN_LOG_STREAM_NAME = 'ticken-stream';

  // Setup BRP and Yivi client
  process.env.BRP_API_URL = 'https://example.com/brp/api/test';
  await brpApi.init();
  yiviApi.manualInit('yivi-server-test.nijmegen.nl', true, 'someid', 'somesecretkey', 'irma-autharizaiton-header');
});

beforeEach(() => {
  axiosMock.reset();
  ddbMock.reset();
});

test('Issue page loads successfull', async () => {

  // Mocks
  const dynamoDBClient = TestUtils.getSessionStoreMock(ddbMock);
  const logsClient = new CloudWatchLogsClient({});
  axiosMock.onPost('https://yivi-server-test.nijmegen.nl/session').reply(200, TestUtils.getYiviSessionExampleResponse());
  axiosMock.onPost('https://example.com/brp/api/test').reply(200, TestUtils.getBrpExampleData());

  // Call issue request handler
  const handler = new IssueRequestHandler({
    brpApi,
    yiviApi,
    logsClient,
    dynamoDBClient,
  });
  const response = await handler.handle({
    cookies: 'session=12345',
    requestId: randomUUID(),
  });

  // Check if the session resonse is encoded in the html
  const data = await brpApi.getBrpData('900026236');
  const manuallyObtainedSessionResponse = await yiviApi.startSession(data, DigidLoa.Midden);
  const base64SessionResponse = Buffer.from(JSON.stringify(manuallyObtainedSessionResponse), 'utf-8').toString('base64');
  expect(response.body).toContain(base64SessionResponse);
});

test('Issue page not logged in', async () => {
  // Session store not logged in
  const dynamoDBClient = TestUtils.getSessionStoreMock(ddbMock, false);
  const logsClient = new CloudWatchLogsClient({});

  const handler = new IssueRequestHandler({
    brpApi,
    yiviApi,
    logsClient,
    dynamoDBClient,
  });
  const response = await handler.handle({
    cookies: 'session=12345',
    requestId: randomUUID(),
  }); expect(response.statusCode).toBe(302);
  expect(response.headers?.Location).toBe('/login');
  expect(response.body).toBe('');
});

test('Yivi API timeout', async () => {
  // Mocks
  const dynamoDBClient = TestUtils.getSessionStoreMock(ddbMock);
  const logsClient = new CloudWatchLogsClient({});
  axiosMock.onPost('https://yivi-server-test.nijmegen.nl/session').timeout();
  axiosMock.onPost('https://example.com/brp/api/test').reply(200, TestUtils.getBrpExampleData());

  // Call issue request handler
  const handler = new IssueRequestHandler({
    brpApi,
    yiviApi,
    logsClient,
    dynamoDBClient,
  });
  const response = await handler.handle({
    cookies: 'session=12345',
    requestId: randomUUID(),
  }); expect(response.body).toContain('Er is iets mis gegaan bij het inladen van uw persoonsgegevens in Yivi. Probeer het later opnieuw');

});


test('BRP API timeout', async () => {
  // Mocks
  const dynamoDBClient = TestUtils.getSessionStoreMock(ddbMock);
  const logsClient = new CloudWatchLogsClient({});
  axiosMock.onPost('https://example.com/brp/api/test').timeout();

  // Call issue request handler
  const handler = new IssueRequestHandler({
    brpApi,
    yiviApi,
    logsClient,
    dynamoDBClient,
  });
  const response = await handler.handle({
    cookies: 'session=12345',
    requestId: randomUUID(),
  }); expect(console.error).toHaveBeenCalledWith('BRP API:', 'Het ophalen van gegevens duurt te lang.');
  expect(response.body).toContain('duurde te lang');
});

test.each([
  [{ error: 'Geboortedatum is onvolledig', incompleteBirthDate: true }, 'uw geboortedatum in de Basisregistratie Personen (BRP) niet volledig is'],
  [{ error: 'Het ophalen van gegevens duurt te lang.' }, 'duurde te lang'],
])('Haal Centraal BRP error shows a matching message: %o', async (brpResult, message) => {
  const dynamoDBClient = TestUtils.getSessionStoreMock(ddbMock);
  const logsClient = new CloudWatchLogsClient({});
  const haalCentraalBrpApi = new HaalCentraalBrpApi();
  jest.spyOn(haalCentraalBrpApi, 'getBrpData').mockResolvedValue(brpResult);

  const handler = new IssueRequestHandler({
    brpApi: haalCentraalBrpApi,
    yiviApi,
    logsClient,
    dynamoDBClient,
  });
  const response = await handler.handle({
    cookies: 'session=12345',
    requestId: randomUUID(),
  });
  expect(response.body).toContain(message);
});
