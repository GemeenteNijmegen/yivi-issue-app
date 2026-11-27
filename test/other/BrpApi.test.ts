import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { TestUtils } from './TestUtils';
import { logger } from '../../src/app/code/Logger';

const axiosMock = new MockAdapter(axios);
jest.mock('@gemeentenijmegen/utils/lib/AWS', () => ({
    AWS: {
        getParameter: jest.fn().mockImplementation((name) => name),
        getSecret: jest.fn().mockImplementation((arn) => arn),
    }
}));

beforeAll(() => {
    console.log = jest.fn();
    console.info = jest.fn();
    console.debug = jest.fn();
    console.error = jest.fn();
    console.time = jest.fn();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
});

beforeEach(() => {
    axiosMock.reset();
});


test('Initialization', async () => {
    TestUtils.getBrpApi();
});

test('Initialization and get data', async () => {
    const brpApi = await TestUtils.getBrpApi();
    axiosMock.onPost('https://example.com/brp/api/test').reply(200, TestUtils.getBrpExampleData());
    const brpData = await brpApi.getBrpData('900026236');
    expect(brpData).toMatchObject(TestUtils.getBrpExampleData());
});

test('Initialization and invalid bsn', async () => {
    const brpApi = await TestUtils.getBrpApi();
    axiosMock.onPost('https://example.com/brp/api/test').reply(200, TestUtils.getBrpExampleData());
    await brpApi.getBrpData('123456789');
    expect(logger.error).toHaveBeenCalledWith('BRP API request failed', { error: 'provided BSN does not satisfy elfproef' });
});

test('404 response', async () => {
    const brpApi = await TestUtils.getBrpApi();
    axiosMock.onPost('https://example.com/brp/api/test').reply(404);
    const r = await brpApi.getBrpData('900026236');
    console.log(r);
    expect(console.log).toHaveBeenCalledWith('http status for https://example.com/brp/api/test: 404');
});