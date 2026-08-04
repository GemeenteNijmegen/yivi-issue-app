import https from 'https';
import { AWS, Bsn } from '@gemeentenijmegen/utils';
import axios, { AxiosInstance } from 'axios';

const LANDCODE_NEDERLANDSE = '0001';

export class HaalCentraalBrpApi {

  private static hasNederlandseNationaliteit(nationaliteiten?: any[]): string {
    if (!nationaliteiten || nationaliteiten.length == 0) {
      return 'Nee';
    }
    let result = 'Nee';
    for (const nationaliteit of nationaliteiten) {
      if (nationaliteit.type == 'Nationaliteit'
        && nationaliteit.nationaliteit.code == LANDCODE_NEDERLANDSE) {
        return 'Ja';
      } else if (nationaliteit.type == 'BehandeldAlsNederlander') {
        result = 'Behandeld als Nederlander';
      } else if (nationaliteit.type == 'NationaliteitOnbekend') {
        result = 'Nee';
      }
    }
    return result;
  }

  private static convertGeboortedatum(input: string): string {
    const year = input.substring(0, 4);
    const month = input.substring(5, 7);
    const day = input.substring(8);
    return `${day}-${month}-${year}`;
  }

  private static achternaam(data: any): string {
    let achternaam = data.adressering.aanschrijfwijze.naam as string;
    achternaam = achternaam.replace(data.naam.voorletters, '');
    if (data.naam.adellijkeTitelPredicaat) {
      const searchMask = new RegExp(`\\s*${data.naam.adellijkeTitelPredicaat.omschrijving}\\s*`, 'ig');
      achternaam = achternaam.replace(searchMask, ' ');
    }
    return achternaam.trim();
  }

  private static naam(data: any): string {
    let naam = data.adressering.aanschrijfwijze.naam as string;
    if (data.naam.adellijkeTitelPredicaat) {
      const searchMask = new RegExp(`\\s*${data.naam.adellijkeTitelPredicaat.omschrijving}\\s*`, 'ig');
      naam = naam.replace(searchMask, ' ');
    }
    return naam.trim();
  }

  private static huisnummer(verblijfadres: any): string {
    const nummer = verblijfadres.huisnummer;
    const letter = verblijfadres.huisletter;
    const toevoeging = verblijfadres.huisnummertoevoeging;
    if (nummer && letter && toevoeging) {
      return `${nummer}-${letter}-${toevoeging}`;
    }
    if (nummer && letter) {
      return `${nummer}-${letter}`;
    }
    if (nummer && toevoeging) {
      return `${nummer}-${toevoeging}`;
    }
    return `${nummer}`;
  }

  private client: AxiosInstance;
  private endpoint: string;

  constructor() {
    this.client = axios.create();
    this.endpoint = '';
  }

  async init() {
    if (!process.env.HC_BRP_API_URL || !process.env.HC_MTLS_CLIENT_CERT_NAME || !process.env.HC_MTLS_PRIVATE_KEY_ARN) {
      throw new Error('Could not initialize Haal Centraal BRP api: missing required env vars');
    }

    const [endpoint, cert, key] = await Promise.all([
      AWS.getParameter(process.env.HC_BRP_API_URL),
      AWS.getParameter(process.env.HC_MTLS_CLIENT_CERT_NAME),
      AWS.getSecret(process.env.HC_MTLS_PRIVATE_KEY_ARN),
    ]);

    const apiKey = process.env.HC_BRP_API_KEY_ARN
      ? await AWS.getSecret(process.env.HC_BRP_API_KEY_ARN)
      : '';

    this.endpoint = endpoint;

    const headers: Record<string, string> = { 'Content-type': 'application/json' };
    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }

    this.client = axios.create({
      headers,
      httpsAgent: new https.Agent({ cert, key }),
      timeout: 2000,
    });
  }

  async getBrpData(bsn: string) {
    try {
      const aBsn = new Bsn(bsn);
      const response = await this.client.post(this.endpoint, {
        type: 'RaadpleegMetBurgerservicenummer',
        burgerservicenummer: [aBsn.bsn],
        fields: [
          'naam', 'geboorte', 'adressering', 'leeftijd',
          'verblijfplaats', 'nationaliteiten', 'geslacht',
          'gemeenteVanInschrijving', 'overlijden',
        ],
      });

      const data = response.data;
      if (!data?.personen || data.personen.length === 0) {
        throw new Error('Het ophalen van persoonsgegevens is misgegaan.');
      }

      const persoon = data.personen[0];

      if (persoon.overlijden?.datum) {
        console.warn('Persoon lijkt overleden');
        return { error: 'Persoon lijkt overleden', warning: true };
      }
      if (persoon.opschortingBijhouding) {
        // Opschorting redencodes (https://developer.rvig.nl/lo-brp/LO-BRP/#e6720):
        // O = Overlijden
        // E = Emigratie (adresgegevens niet meer actueel)
        // M = Ministerieel besluit
        // R = Research/fout (foutieve inschrijving)
        // Bij alle codes blokkeren we uitgifte: de persoonsgegevens zijn niet betrouwbaar genoeg.
        const code = persoon.opschortingBijhouding?.reden?.code;
        if (code == 'O') {
          console.warn('Persoon lijkt overleden');
          return { error: 'Persoon lijkt overleden', warning: true };
        }
        const message = `Bijhouding opgeschort met reden ${code ?? 'onbekend'}`; // Zie https://developer.rvig.nl/lo-brp/LO-BRP/#e6720
        console.warn(message);
        return { error: message, warning: true };
      }
      if (persoon.verblijfplaats?.type != 'Adres') {
        console.warn('Verblijfplaats is geen adres');
        return { error: 'Verblijfplaats is geen adres', warning: true };
      }

      return this.transformToInternalFormat(persoon, aBsn.bsn);
    } catch (error: any) {
      return { error: error.message };
    }
  }

  private transformToInternalFormat(persoon: any, bsn: string) {
    const leeftijd = persoon.leeftijd;
    const verblijfadres = persoon.verblijfplaats.verblijfadres;

    return {
      Persoon: {
        BSN: { BSN: bsn },
        Persoonsgegevens: {
          Voorletters: persoon.naam.voorletters ?? '',
          Voornamen: persoon.naam.voornamen?.trim() ?? '',
          Voorvoegsel: persoon.naam.voorvoegsel ?? '',
          Geslachtsnaam: persoon.naam.geslachtsnaam ?? '',
          Achternaam: HaalCentraalBrpApi.achternaam(persoon),
          Naam: HaalCentraalBrpApi.naam(persoon),
          Geboortedatum: HaalCentraalBrpApi.convertGeboortedatum(persoon.geboorte.datum.datum),
          Geslacht: persoon.geslacht.code ?? '',
          NederlandseNationaliteit: HaalCentraalBrpApi.hasNederlandseNationaliteit(persoon.nationaliteiten),
          Geboorteplaats: persoon.geboorte.plaats?.omschrijving ?? '',
          Geboorteland: persoon.geboorte.land?.omschrijving ?? persoon.geboorte.land?.code ?? '',
        },
        Adres: {
          Straat: verblijfadres.officieleStraatnaam ?? '',
          Huisnummer: HaalCentraalBrpApi.huisnummer(verblijfadres),
          Gemeente: persoon.gemeenteVanInschrijving?.omschrijving ?? '',
          Postcode: verblijfadres.postcode ?? '',
          Woonplaats: verblijfadres.woonplaats ?? '',
        },
        ageLimits: {
          over12: leeftijd >= 12 ? 'Yes' : 'No',
          over16: leeftijd >= 16 ? 'Yes' : 'No',
          over18: leeftijd >= 18 ? 'Yes' : 'No',
          over21: leeftijd >= 21 ? 'Yes' : 'No',
          over65: leeftijd >= 65 ? 'Yes' : 'No',
        },
        overleden: false,
      },
    };
  }
}
