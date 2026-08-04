import * as crypto from 'crypto';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Response } from '@gemeentenijmegen/apigateway-http';
import { Session } from '@gemeentenijmegen/session';
import { BrpApi } from './BrpApi';
import { HaalCentraalBrpApi } from './HaalCentraalBrpApi';
import * as template from './issue.mustache';
import { loaToString } from '../code/DigiDLoa';
import { LogsUtil } from '../code/LogsUtil';
import render from '../code/Render';
import { YiviApi } from '../code/YiviApi';

export interface Params {
  cookies: string;
  requestId: string;
}

export interface IssueRequestHandlerProps {
  dynamoDBClient: DynamoDBClient;
  logsClient: CloudWatchLogsClient;
  brpApi: BrpApi | HaalCentraalBrpApi;
  yiviApi: YiviApi;
}

export class IssueRequestHandler {
  private readonly dynamoDBClient: DynamoDBClient;
  private readonly logsClient: CloudWatchLogsClient;
  private readonly brpApi: BrpApi | HaalCentraalBrpApi;
  private readonly yiviApi: YiviApi;

  constructor(props: IssueRequestHandlerProps) {
    this.dynamoDBClient = props.dynamoDBClient;
    this.logsClient = props.logsClient;
    this.brpApi = props.brpApi;
    this.yiviApi = props.yiviApi;
  }

  async handle(params: Params) {
    const session = new Session(params.cookies, this.dynamoDBClient);
    await session.init();
    if (session.isLoggedIn() == true) {
      return this.handleLoggedinRequest(session, params.requestId);
    }
    console.info('Redirecting to login...');
    return Response.redirect('/login');
  }


  /**
   * Request persoonsgegevens form BRP send them to the YIVI server
   * logs the issue event and passes the yivi sessionPtr to the render.
   * @param session
   * @param requestId
   * @returns
   */
  async handleLoggedinRequest(session: Session, requestId: string) {
    let error = undefined;

    // BRP request
    let naam = undefined;
    let brpData = undefined;
    if (!error) {
      const bsn = session.getValue('bsn');
      brpData = await this.brpApi.getBrpData(bsn);
      await LogsUtil.logToCloudWatch(this.logsClient, 'TICK: BRP', process.env.TICKEN_LOG_GROUP_NAME, process.env.TICKEN_LOG_STREAM_NAME);
      naam = brpData?.Persoon?.Persoonsgegevens?.Naam;
      if (brpData.error || !naam) {
        if (brpData.warning) {
          error = 'Het lukt nu niet om uw gegevens in Yivi te zetten. Dit komt omdat uw inschrijving in de Basisregistratie Personen (BRP) op \'Niet actief\' staat. Neem hierover contact op met de gemeente waar u ingeschreven bent.';
        } else if (brpData.error?.includes('duurt te lang')) {
          error = 'Het ophalen van uw persoonsgegevens duurde te lang. Probeer het later opnieuw.';
        } else {
          error = 'Het ophalen van uw persoonsgegevens is mis gegaan. Probeer het later opnieuw.';
        }
      }
    }

    // Start YIVI session
    let yiviFullSessionEncoded = undefined;
    let yiviSessionToken = undefined;
    if (!error) {
      const loa = session.getValue('loa');
      const yiviResponse = await this.yiviApi.startSession(brpData, loa);
      if (!yiviResponse.error) {
        yiviSessionToken = yiviResponse?.token;
        yiviFullSessionEncoded = Buffer.from(JSON.stringify(yiviResponse), 'utf-8').toString('base64');
      } else {
        error = 'Er is iets mis gegaan bij het inladen van uw persoonsgegevens in Yivi. Probeer het later opnieuw.';
      }
    }

    await this.storeIssueEventInSession(session);
    await this.logIssueEvent(session, brpData, requestId, yiviSessionToken, error);

    // Render the page
    const data = {
      title: 'opladen',
      yiviServer: `https://${this.yiviApi.getHost()}`,
      error: error,
      yiviFullSession: yiviFullSessionEncoded,
    };
    const html = await render(data, template.default);
    return Response.html(html, 200, session.getCookie());
  }

  /**
   * Add the required issue event data to the session for
   * collecting statistics one usage of the yivi-issue-app later on
   * @param session the user session to store data in
   */
  async storeIssueEventInSession(session: Session) {
    const loggedin = session.getValue('loggedin', 'BOOL') ?? false;
    const loa = session.getValue('loa');
    const bsn = session.getValue('bsn');
    let issueAttempt = session.getValue('issueAttempt', 'N') ?? '0';
    const incrementedIssueAttempt = parseInt(issueAttempt) + 1;

    try {
      await session.updateSession({
        loggedin: { BOOL: loggedin },
        bsn: { S: bsn },
        loa: { S: loa },
        issueAttempt: { N: incrementedIssueAttempt.toString() },
      });
    } catch (err) {
      console.log('Could not add issue statistics to session', err);
    }
  }

  /**
   * Log the issue event to a separate log group
   */
  async logIssueEvent(session: Session, brpData: any, requestId: string, yiviSessionToken: string, error?: string) {

    // Setup statistics data
    const loa = loaToString(session.getValue('loa'));
    const issueAttempt = session.getValue('issueAttempt', 'N') ?? 0;
    const gemeente = brpData?.Persoon?.Adres?.Gemeente;
    const timestamp = Date.now();

    // Construct the subject and make it as specific as possible so it cannot be bruteforced
    const brpDataAsJson = JSON.stringify(brpData ?? { unknown: 'faild to get brp data' });
    const diversify = `${brpDataAsJson}/${process.env.DIVERSIFYER}`;
    const subject = crypto.createHash('sha256').update(diversify).digest('hex');

    // Constuct the message
    let message = JSON.stringify({ timestamp, gemeente, subject, loa, issueAttempt, requestId, yiviSessionToken });
    if (error) {
      message = JSON.stringify({ timestamp, loa, issueAttempt, error, requestId, yiviSessionToken });
    }

    // Log the message
    const group = process.env.STATISTICS_LOG_GROUP_NAME;
    const stream = process.env.STATISTICS_LOG_STREAM_NAME;
    await LogsUtil.logToCloudWatch(this.logsClient, message, group, stream);

  }

}


