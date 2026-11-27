import { AWS } from '@gemeentenijmegen/utils';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { TestUtils } from './TestUtils';
import { DigidLoa, loaToString } from '../../src/app/code/DigiDLoa';
import { logger } from '../../src/app/code/Logger';
import { YiviApi } from '../../src/app/code/YiviApi';

const axiosMock = new MockAdapter(axios);
jest.mock('@gemeentenijmegen/utils/lib/AWS', () => ({
  AWS: {
    getParameter: jest.fn().mockImplementation((name) => `param-${name}`),
    getSecret: jest.fn().mockImplementation((arn) => `secret-${arn}`),
  },
}));

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  console.error = jest.fn();
  console.time = jest.fn();
  jest.spyOn(logger, 'info').mockImplementation();
  jest.spyOn(logger, 'error').mockImplementation();
});

beforeEach(() => {
  axiosMock.reset();
});


test('Initialization', async () => {
  process.env.YIVI_API_ACCESS_KEY_ID_ARN = 'key-id-arn';
  process.env.YIVI_API_SECRET_KEY_ARN = 'secret-arn';
  process.env.YIVI_API_KEY_ARN = 'key-arn';
  process.env.YIVI_API_HOST = 'https://localhost/yivi';
  process.env.YIVI_API_REGION = '/yivi/api/region';
  process.env.YIVI_API_DEMO = 'demo';

  const api = new YiviApi();
  await api.init();
  expect(api.getHost()).toBe('https://localhost/yivi');
  expect(AWS.getSecret).toHaveBeenCalledTimes(3);
});

test('Initialization and check intialization', async () => {
  process.env.YIVI_API_ACCESS_KEY_ID_ARN = 'key-id-arn';
  process.env.YIVI_API_SECRET_KEY_ARN = 'secret-arn';
  process.env.YIVI_API_KEY_ARN = 'key-arn';
  process.env.YIVI_API_HOST = 'gw-test.nijmegen.nl';
  process.env.YIVI_API_REGION = 'eu-central-1';
  process.env.YIVI_API_DEMO = 'demo';

  axiosMock.onPost('/session').reply(200, TestUtils.getYiviSessionExampleResponse());

  const api = new YiviApi();
  await api.init();

  const yiviResp = await api.startSession(TestUtils.getBrpExampleData(), DigidLoa.Hoog);

  // Check if the response is correct
  expect(yiviResp).toStrictEqual(TestUtils.getYiviSessionExampleResponse());
  // Check request config in history
  const request = axiosMock.history.post[0];
  expect(request).not.toBe(undefined);
  // Validate if the headers are set
  expect(request.headers).not.toBe(undefined);
  if (request.headers) {
    expect(request.headers['irma-authorization']).toBe('secret-key-arn');
    expect(request.headers.Authorization).not.toBeUndefined();
    expect(request.headers['X-Amz-Date']).not.toBeUndefined();
  }

});

test('Check if yivi api adds aws4-singature and irma-authorization header and right LOA', async () => {
  axiosMock.onPost('/session').reply(200, TestUtils.getYiviSessionExampleResponse());

  const client = new YiviApi();
  client.manualInit('gw-test.nijmegen.nl', true, 'someid', 'somesecretkey', 'irma-autharizaiton-header');
  const imraResp = await client.startSession(TestUtils.getBrpExampleData(), DigidLoa.Substantieel);

  // Check if the response is correct
  expect(imraResp).toStrictEqual(TestUtils.getYiviSessionExampleResponse());
  // Check request config in history
  const request = axiosMock.history.post[0];
  expect(request).not.toBe(undefined);
  // Validate if the headers are set
  expect(request.headers).not.toBe(undefined);
  if (request.headers) {
    expect(request.headers['irma-authorization']).toBe('irma-autharizaiton-header');
    expect(request.headers.Authorization).not.toBeUndefined();
    expect(request.headers['X-Amz-Date']).not.toBeUndefined();
  }

  const data = JSON.parse(request.data);
  const loa = `${loaToString(DigidLoa.Substantieel)}`;
  expect(data?.credentials[1]?.attributes?.digidlevel).toBe(loa);
});

test('Check timeout Yivi API', async () => {
  axiosMock.onPost('/session').timeout();
  const client = new YiviApi();
  client.manualInit('gw-test.nijmegen.nl', true, 'someid', 'somesecretkey', 'irma-autharizaiton-header');
  await client.startSession(TestUtils.getBrpExampleData(), DigidLoa.Substantieel);
  expect(logger.error).toHaveBeenCalledWith('Error while doing signed post request', expect.objectContaining({ path: 'session', code: 'ECONNABORTED', error: 'timeout of 2000ms exceeded' }));
});

test('Mapping BRP data', () => {
  const brpData = TestUtils.getBrpExampleData();

  const client = new YiviApi();
  client.manualInit('gw-test.nijmegen.nl', true, 'someid', 'somesecretkey', 'irma-autharizaiton-header');
  const yiviRequest = client.constructYiviIssueRequest(brpData, DigidLoa.Midden);

  // Check date calculation (valid until)
  const currentYear = new Date().getFullYear();
  // Date timestamp 5 years in the future in seconds
  const date5ytd = Math.floor(new Date().setFullYear(currentYear + 5) / 1000);
  // Date timestamp 1 year in the future in seconds
  const date1ytd = Math.floor(new Date().setFullYear(currentYear + 1) / 1000);
  console.info('Dates logged', date1ytd, date5ytd);

  // Check request buildup and LOA
  expect(yiviRequest.type).toBe('issuing');
  expect(yiviRequest.credentials[1].attributes.digidlevel).toBe(loaToString(DigidLoa.Midden));
  expect(yiviRequest.credentials[0].credential).toBe('irma-demo.gemeente.address');
  expect(yiviRequest.credentials[1].credential).toBe('irma-demo.gemeente.personalData');

  // Check dates allow for a 20 second window
  expect(yiviRequest.credentials[0].validity).toBeGreaterThan(date1ytd - 10);
  expect(yiviRequest.credentials[0].validity).toBeLessThan(date1ytd + 10);
  expect(yiviRequest.credentials[1].validity).toBeGreaterThan(date5ytd - 10);
  expect(yiviRequest.credentials[1].validity).toBeLessThan(date5ytd + 10);

  // Check address brp data
  const addressCard = yiviRequest.credentials[0].attributes;
  expect(addressCard.street).toBe(brpData.Persoon.Adres.Straat);
  expect(addressCard.houseNumber).toBe(brpData.Persoon.Adres.Huisnummer);
  expect(addressCard.zipcode).toBe(brpData.Persoon.Adres.Postcode);
  expect(addressCard.municipality).toBe(brpData.Persoon.Adres.Gemeente);
  expect(addressCard.city).toBe(brpData.Persoon.Adres.Woonplaats);

  // Check personal brp data
  const personCard = yiviRequest.credentials[1].attributes;
  const gegevens = brpData.Persoon.Persoonsgegevens;
  expect(personCard.initials).toBe(gegevens.Voorletters);
  expect(personCard.firstnames).toBe(gegevens.Voornamen);
  expect(personCard.prefix).toBe(gegevens.Voorvoegsel);
  expect(personCard.familyname).toBe(gegevens.Geslachtsnaam);
  expect(personCard.fullname).toBe(gegevens.Naam);
  expect(personCard.dateofbirth).toBe(gegevens.Geboortedatum);
  expect(personCard.gender).toBe(gegevens.Geslacht);
  expect(personCard.nationality).toBe('yes');
  expect(personCard.surname).toBe(gegevens.Achternaam);
  expect(personCard.cityofbirth).toBe(gegevens.Geboorteplaats);
  expect(personCard.countryofbirth).toBe(gegevens.Geboorteland);
  expect(personCard.bsn).toBe(brpData.Persoon.BSN.BSN);
  expect(brpData.Persoon.ageLimits.over12).toBe(brpData.Persoon.ageLimits.over12);
  expect(brpData.Persoon.ageLimits.over16).toBe(brpData.Persoon.ageLimits.over16);
  expect(brpData.Persoon.ageLimits.over18).toBe(brpData.Persoon.ageLimits.over18);
  expect(brpData.Persoon.ageLimits.over21).toBe(brpData.Persoon.ageLimits.over21);
  expect(brpData.Persoon.ageLimits.over65).toBe(brpData.Persoon.ageLimits.over65);

});
