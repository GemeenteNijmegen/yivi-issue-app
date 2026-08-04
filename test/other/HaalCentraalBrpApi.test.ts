import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { HaalCentraalBrpApi } from '../../src/app/issue/HaalCentraalBrpApi';

const axiosMock = new MockAdapter(axios);

jest.mock('@gemeentenijmegen/utils/lib/AWS', () => ({
  AWS: {
    getParameter: jest.fn().mockImplementation((name) => name),
    getSecret: jest.fn().mockImplementation((arn) => arn),
  },
}));

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  console.error = jest.fn();
  console.time = jest.fn();

  process.env.HC_BRP_API_URL = 'hc-brp-endpoint';
  process.env.HC_MTLS_CLIENT_CERT_NAME = 'hc-cert';
  process.env.HC_MTLS_PRIVATE_KEY_ARN = 'hc-key-arn';
});

beforeEach(() => {
  axiosMock.reset();
});

/**
 * Helper to create and initialize the HaalCentraalBrpApi
 */
async function getHaalCentraalBrpApi() {
  const api = new HaalCentraalBrpApi();
  await api.init();
  return api;
}

/**
 * Demo response from the Haal Centraal BRP Personen Bevragen API
 * Based on the fields requested in HaalCentraalBrpApi.getBrpData
 */
function getHaalCentraalExampleResponse(): any {
  return {
    type: 'RaadpleegMetBurgerservicenummer',
    personen: [
      {
        naam: {
          voorletters: 'H.',
          voornamen: 'Hans',
          voorvoegsel: 'de',
          geslachtsnaam: 'Jong',
        },
        adressering: {
          aanschrijfwijze: {
            naam: 'H. de Jong',
          },
        },
        geboorte: {
          datum: { datum: '1956-01-01' },
          plaats: { omschrijving: 'Nijmegen' },
          land: { omschrijving: 'Nederland', code: '6030' },
        },
        leeftijd: 70,
        geslacht: { code: 'M' },
        nationaliteiten: [
          {
            type: 'Nationaliteit',
            nationaliteit: { code: '0001', omschrijving: 'Nederlandse' },
          },
        ],
        verblijfplaats: {
          type: 'Adres',
          verblijfadres: {
            officieleStraatnaam: 'Kelfkensbos',
            huisnummer: 80,
            postcode: '6511 RN',
            woonplaats: 'Nijmegen',
          },
        },
        gemeenteVanInschrijving: {
          code: '0268',
          omschrijving: 'Nijmegen',
        },
      },
    ],
  };
}

/**
 * Expected internal format after transformation
 */
function getExpectedTransformedData() {
  return {
    Persoon: {
      BSN: { BSN: '900026236' },
      Persoonsgegevens: {
        Voorletters: 'H.',
        Voornamen: 'Hans',
        Voorvoegsel: 'de',
        Geslachtsnaam: 'Jong',
        Achternaam: 'de Jong',
        Naam: 'H. de Jong',
        Geboortedatum: '01-01-1956',
        Geslacht: 'M',
        NederlandseNationaliteit: 'Ja',
        Geboorteplaats: 'Nijmegen',
        Geboorteland: 'Nederland',
      },
      Adres: {
        Straat: 'Kelfkensbos',
        Huisnummer: '80',
        Gemeente: 'Nijmegen',
        Postcode: '6511 RN',
        Woonplaats: 'Nijmegen',
      },
      ageLimits: {
        over12: 'Yes',
        over16: 'Yes',
        over18: 'Yes',
        over21: 'Yes',
        over65: 'Yes',
      },
      overleden: false,
    },
  };
}

describe('HaalCentraalBrpApi', () => {

  describe('Initialization', () => {
    test('initializes successfully with required env vars', async () => {
      const api = await getHaalCentraalBrpApi();
      expect(api).toBeDefined();
    });

    test('throws when missing required env vars', async () => {
      const originalUrl = process.env.HC_BRP_API_URL;
      delete process.env.HC_BRP_API_URL;

      const api = new HaalCentraalBrpApi();
      await expect(api.init()).rejects.toThrow('Could not initialize Haal Centraal BRP api: missing required env vars');

      process.env.HC_BRP_API_URL = originalUrl;
    });

    test('initializes with optional API key', async () => {
      process.env.HC_BRP_API_KEY_ARN = 'some-api-key-arn';
      const api = await getHaalCentraalBrpApi();
      expect(api).toBeDefined();
      delete process.env.HC_BRP_API_KEY_ARN;
    });
  });

  describe('getBrpData - successful responses', () => {
    test('returns transformed BRP data for a valid BSN', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, getHaalCentraalExampleResponse());

      const result: any = await api.getBrpData('900026236');
      expect(result).toEqual(getExpectedTransformedData());
    });

    test('correctly transforms date format from YYYY-MM-DD to DD-MM-YYYY', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].geboorte.datum.datum = '2000-12-25';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.Geboortedatum).toBe('25-12-2000');
    });

    test('handles huisnummer with letter', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].verblijfplaats.verblijfadres.huisletter = 'A';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Adres.Huisnummer).toBe('80-A');
    });

    test('handles huisnummer with toevoeging', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].verblijfplaats.verblijfadres.huisnummertoevoeging = 'bis';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Adres.Huisnummer).toBe('80-bis');
    });

    test('handles huisnummer with letter and toevoeging', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].verblijfplaats.verblijfadres.huisletter = 'B';
      response.personen[0].verblijfplaats.verblijfadres.huisnummertoevoeging = 'II';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Adres.Huisnummer).toBe('80-B-II');
    });
  });

  describe('getBrpData - nationaliteit', () => {
    test('returns Ja for Nederlandse nationaliteit', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, getHaalCentraalExampleResponse());

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Ja');
    });

    test('returns Nee when no nationaliteiten', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].nationaliteiten = [];

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Nee');
    });

    test('returns Nee when nationaliteiten is undefined', async () => {
      const response = getHaalCentraalExampleResponse();
      delete response.personen[0].nationaliteiten;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Nee');
    });

    test('returns Behandeld als Nederlander', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].nationaliteiten = [
        { type: 'BehandeldAlsNederlander' },
      ];

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Behandeld als Nederlander');
    });

    test('returns Nee for NationaliteitOnbekend', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].nationaliteiten = [
        { type: 'NationaliteitOnbekend' },
      ];

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Nee');
    });

    test('Nederlandse nationaliteit takes precedence over other types', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].nationaliteiten = [
        { type: 'BehandeldAlsNederlander' },
        { type: 'Nationaliteit', nationaliteit: { code: '0001', omschrijving: 'Nederlandse' } },
      ];

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Ja');
    });

    test('returns Nee for non-Dutch nationaliteit', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].nationaliteiten = [
        { type: 'Nationaliteit', nationaliteit: { code: '0002', omschrijving: 'Duitse' } },
      ];

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.NederlandseNationaliteit).toBe('Nee');
    });
  });

  describe('getBrpData - age limits', () => {
    test('all age limits Yes for person aged 70', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, getHaalCentraalExampleResponse());

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.ageLimits).toEqual({
        over12: 'Yes',
        over16: 'Yes',
        over18: 'Yes',
        over21: 'Yes',
        over65: 'Yes',
      });
    });

    test('age limits for person aged 10', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].leeftijd = 10;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.ageLimits).toEqual({
        over12: 'No',
        over16: 'No',
        over18: 'No',
        over21: 'No',
        over65: 'No',
      });
    });

    test('age limits for person aged 17', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].leeftijd = 17;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.ageLimits).toEqual({
        over12: 'Yes',
        over16: 'Yes',
        over18: 'No',
        over21: 'No',
        over65: 'No',
      });
    });
  });

  describe('getBrpData - naam with adellijke titel', () => {
    test('strips adellijke titel from achternaam and naam', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].naam.adellijkeTitelPredicaat = {
        code: 'B',
        omschrijving: 'Baron',
      };
      response.personen[0].adressering.aanschrijfwijze.naam = 'H. Baron de Jong';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.Achternaam).toBe('de Jong');
      expect(result.Persoon.Persoonsgegevens.Naam).toBe('H. de Jong');
    });
  });

  describe('getBrpData - error scenarios', () => {
    test('returns error for invalid BSN', async () => {
      const api = await getHaalCentraalBrpApi();

      const result: any = await api.getBrpData('123456789');
      expect(result).toHaveProperty('error');
    });

    test('returns error when API returns empty personen array', async () => {
      const response = { type: 'RaadpleegMetBurgerservicenummer', personen: [] };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('misgegaan');
    });

    test('returns error when API returns no personen field', async () => {
      const response = { type: 'RaadpleegMetBurgerservicenummer' };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
    });

    test('returns error when person is deceased (overlijden.datum)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].overlijden = { datum: '2024-01-01' };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('overleden');
    });

    test('returns error when opschortingBijhouding with reason O (overleden)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = { reden: { code: 'O', omschrijving: 'Overlijden' } };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('overleden');
    });

    test('returns error when opschortingBijhouding with reason E (emigratie)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = { reden: { code: 'E', omschrijving: 'Emigratie' } };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.warning).toBe(true);
      expect(result.error).toContain('opgeschort');
      expect(result.error).toContain('E');
    });

    test('returns error when opschortingBijhouding with reason M (ministerieel besluit)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = { reden: { code: 'M', omschrijving: 'Ministerieel besluit' } };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.warning).toBe(true);
      expect(result.error).toContain('opgeschort');
      expect(result.error).toContain('M');
    });

    test('returns error when opschortingBijhouding with reason R (research/fout)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = { reden: { code: 'R', omschrijving: 'Research' } };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.warning).toBe(true);
      expect(result.error).toContain('opgeschort');
      expect(result.error).toContain('R');
    });

    test('returns error when opschortingBijhouding has no reden object', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = {};

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.warning).toBe(true);
      expect(result.error).toContain('onbekend');
    });

    test('returns error when opschortingBijhouding.reden has no code', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].opschortingBijhouding = { reden: {} };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.warning).toBe(true);
      expect(result.error).toContain('onbekend');
    });

    test('succeeds when overlijden key is present but without datum', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].overlijden = {};

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).not.toHaveProperty('error');
      expect(result.Persoon).toBeDefined();
    });

    test('succeeds when neither overlijden nor opschortingBijhouding is present', async () => {
      const response = getHaalCentraalExampleResponse();
      delete response.personen[0].overlijden;
      delete response.personen[0].opschortingBijhouding;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).not.toHaveProperty('error');
      expect(result.Persoon).toBeDefined();
    });

    test('returns error when verblijfplaats is not Adres', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].verblijfplaats = { type: 'Locatie' };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('geen adres');
    });

    test('returns error on API timeout', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').timeout();

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
    });

    test('returns error on network error', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').networkError();

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
    });

    test('returns error on 500 response', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(500);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
    });

    test('returns error on 404 response', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(404);

      const result: any = await api.getBrpData('900026236');
      expect(result).toHaveProperty('error');
    });
  });

  describe('getBrpData - optional/missing fields', () => {
    test('handles missing voorvoegsel', async () => {
      const response = getHaalCentraalExampleResponse();
      delete response.personen[0].naam.voorvoegsel;
      response.personen[0].naam.geslachtsnaam = 'Jong';
      response.personen[0].adressering.aanschrijfwijze.naam = 'H. Jong';

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.Voorvoegsel).toBe('');
      expect(result.Persoon.Persoonsgegevens.Achternaam).toBe('Jong');
    });

    test('handles missing geboorteplaats', async () => {
      const response = getHaalCentraalExampleResponse();
      delete response.personen[0].geboorte.plaats;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.Geboorteplaats).toBe('');
    });

    test('handles geboorteland with only code (no omschrijving)', async () => {
      const response = getHaalCentraalExampleResponse();
      response.personen[0].geboorte.land = { code: '6030' };

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Persoonsgegevens.Geboorteland).toBe('6030');
    });

    test('handles missing gemeenteVanInschrijving', async () => {
      const response = getHaalCentraalExampleResponse();
      delete response.personen[0].gemeenteVanInschrijving;

      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply(200, response);

      const result: any = await api.getBrpData('900026236');
      expect(result.Persoon.Adres.Gemeente).toBe('');
    });
  });

  describe('getBrpData - request format', () => {
    test('sends correct request body to API', async () => {
      const api = await getHaalCentraalBrpApi();
      axiosMock.onPost('hc-brp-endpoint').reply((config) => {
        const body = JSON.parse(config.data);
        expect(body.type).toBe('RaadpleegMetBurgerservicenummer');
        expect(body.burgerservicenummer).toEqual(['900026236']);
        expect(body.fields).toContain('naam');
        expect(body.fields).toContain('geboorte');
        expect(body.fields).toContain('adressering');
        expect(body.fields).toContain('leeftijd');
        expect(body.fields).toContain('verblijfplaats');
        expect(body.fields).toContain('nationaliteiten');
        expect(body.fields).toContain('geslacht');
        expect(body.fields).toContain('gemeenteVanInschrijving');
        expect(body.fields).toContain('overlijden');
        return [200, getHaalCentraalExampleResponse()];
      });

      await api.getBrpData('900026236');
    });
  });
});
