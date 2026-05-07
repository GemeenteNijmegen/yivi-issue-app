import { ApiClient } from '@gemeentenijmegen/apiclient';
import { AWS, Bsn } from '@gemeentenijmegen/utils';

const LANDCODE_NEDERLANDSE = '0001';

/**
 * Haal Centraal BRP API implementatie.
 *
 * Bevraagt de Haal Centraal BRP Personen Bevragen API en
 * transformeert het antwoord naar het interne BRP data formaat
 * dat door YiviApi wordt verwacht.
 */
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

  private endpoint: string;
  private client: ApiClient;
  private apiKey: string;

  constructor(client: ApiClient) {
    this.client = client;
    this.endpoint = '';
    this.apiKey = '';
  }

  async init() {
    if (!process.env.HC_BRP_API_URL) {
      throw new Error('Could not initialize Haal Centraal BRP api: HC_BRP_API_URL is not set');
    }
    this.endpoint = await AWS.getParameter(process.env.HC_BRP_API_URL);
    if (process.env.HC_BRP_API_KEY_ARN) {
      this.apiKey = await AWS.getSecret(process.env.HC_BRP_API_KEY_ARN);
    }
  }

  async getBrpData(bsn: string) {
    try {
      const aBsn = new Bsn(bsn);
      const requestBody = {
        type: 'RaadpleegMetBurgerservicenummer',
        burgerservicenummer: [aBsn.bsn],
        fields: [
          'naam',
          'geboorte',
          'adressering',
          'leeftijd',
          'verblijfplaats',
          'nationaliteiten',
          'geslacht',
          'gemeenteVanInschrijving',
          'overlijden',
        ],
      };

      const headers: Record<string, string> = {
        'Content-type': 'application/json',
      };
      if (this.apiKey) {
        headers['X-API-KEY'] = this.apiKey;
      }

      const data = await this.client.postData(this.endpoint, requestBody, headers);

      if (!data?.personen || data.personen.length === 0) {
        throw new Error('Het ophalen van persoonsgegevens is misgegaan.');
      }

      const persoon = data.personen[0];

      // Overleden check (zit in de API response als overlijden.datum)
      if (persoon.overlijden?.datum) {
        throw new Error('Persoon lijkt overleden');
      }

      // opschortingBijhouding komt automatisch mee indien van toepassing
      // https://developer.rvig.nl/brp-api/personen/features/opschorting-bijhouding/fields/
      if (persoon.opschortingBijhouding) {
        const code = persoon.opschortingBijhouding.reden.code;
        if (code == 'O') {
          throw new Error('Persoon lijkt overleden');
        }
        throw new Error('Bijhouding opgeschort');
      }

      if (persoon.verblijfplaats?.type != 'Adres') {
        throw new Error('Verblijfplaats is geen adres');
      }

      return this.transformToInternalFormat(persoon, aBsn.bsn);
    } catch (error: any) {
      console.error('Haal Centraal BRP API:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Transformeer Haal Centraal response naar het interne IRMA BRP formaat.
   */
  private transformToInternalFormat(persoon: any, bsn: string) {
    const leeftijd = persoon.leeftijd;
    const verblijfplaats = persoon.verblijfplaats;
    const verblijfadres = verblijfplaats.verblijfadres;

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
