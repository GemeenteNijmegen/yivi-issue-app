/**
 * One-off repair: rebuild the month and year statistics from the daily records.
 * Before the fix in CalculateStatistics.lambda.ts, months missed their last day and
 * years were stored one year too early. Logs older than 18 months are gone, so the
 * daily records are the only full source.
 *
 * Dry run (default):  TABLE_NAME=<table> npx ts-node src/scripts/backfill-statistics.ts
 * Write changes:      TABLE_NAME=<table> npx ts-node src/scripts/backfill-statistics.ts --apply
 */
import { AttributeValue, DeleteItemCommand, DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

export interface StatRecord { type: string; date: string; value: number; shiftFixed?: boolean }
export interface Plan {
  writes: (StatRecord & { old?: number; note?: string })[];
  skipped: { type: string; date: string; reason: string }[];
  deletes: StatRecord[];
}

// The calculate-statistics-year rule (deployed 2024-05-22) first ran on Jan 1 2025. Until the fix it
// stored each year under the key of the year before, so its first record was '2023'. Year records
// before that came from elsewhere and are left alone. Rewritten years get `shiftFixed`, so a rerun
// does not shift them again.
const FIRST_SHIFTED_YEAR = 2023;

/** All YYYY-MM-DD dates from `from` to `to` inclusive (UTC, so no timezone shifts). */
function daysBetween(from: string, to: string): string[] {
  const result = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().substring(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    result.push(d.toISOString().substring(0, 10));
  }
  return result;
}

/**
 * Only periods that ended before `today` are rebuilt. A period is skipped when daily records are
 * missing, or when the daily data starts mid-period and a record already exists: a partial sum must
 * never overwrite a fuller count.
 */
export function planBackfill(days: StatRecord[], existing: StatRecord[], today: string): Plan {
  const plan: Plan = { writes: [], skipped: [], deletes: [] };
  const dayValue = new Map(days.map(d => [d.date, d.value]));
  const firstDay = days.map(d => d.date).sort()[0] ?? today;
  const old = new Map(existing.map(r => [`${r.type}#${r.date}`, r]));
  const thisYear = Number(today.substring(0, 4));

  // Sum of the daily records for a finished period, plus which days are missing.
  const fromDays = (type: string, date: string) => {
    const start = type == 'month' ? `${date}-01` : `${date}-01-01`;
    const end = type == 'month'
      ? new Date(Date.UTC(Number(date.substring(0, 4)), Number(date.substring(5, 7)), 0)).toISOString().substring(0, 10)
      : `${date}-12-31`;
    const covered = daysBetween(start > firstDay ? start : firstDay, end);
    return {
      value: covered.reduce((sum, d) => sum + (dayValue.get(d) ?? 0), 0),
      missing: covered.filter(d => !dayValue.has(d)),
      partial: start < firstDay,
    };
  };
  const write = (type: string, date: string, value: number, note?: string) => {
    plan.writes.push({ type, date, value, old: old.get(`${type}#${date}`)?.value, ...(note ? { note } : {}) });
  };
  // Usable when complete, or when it is partial but there is no record a partial sum could overwrite.
  const tryDays = (type: string, date: string) => {
    const sum = fromDays(type, date);
    const current = old.get(`${type}#${date}`);
    if (sum.missing.length > 0) {
      plan.skipped.push({ type, date, reason: `missing ${sum.missing.length} day(s): ${sum.missing.join(', ')}` });
    } else if (sum.partial && current) {
      plan.skipped.push({ type, date, reason: `daily data starts ${firstDay}, keeping ${current.value}` });
    } else if (current?.value !== sum.value || (type == 'year' && !current.shiftFixed)) {
      write(type, date, sum.value);
    }
  };

  const months = new Set(days.map(d => d.date.substring(0, 7)).filter(m => m < today.substring(0, 7)));
  for (const month of months) tryDays('month', month);

  // True if the record under this key holds the count of the next year. The old lambda's newest key is
  // thisYear - 2 (the fixed one writes thisYear - 1); already corrected records carry shiftFixed.
  // In 2026: 2023 (holds 2024) and 2024 (holds 2025). A 2027 run before the fix is deployed would add 2025.
  const isShifted = (year: number) => {
    const record = old.get(`year#${year}`);
    return !!record && !record.shiftFixed && year >= FIRST_SHIFTED_YEAR && year <= thisYear - 2;
  };
  const years = new Set([
    ...days.map(d => Number(d.date.substring(0, 4))),
    ...existing.filter(r => r.type == 'year').map(r => Number(r.date)),
  ]);
  for (const year of [...years].sort()) {
    if (year >= thisYear) continue;
    const hasDays = days.some(d => d.date.startsWith(`${year}-`));
    const sum = hasDays ? fromDays('year', String(year)) : undefined;
    if (sum && sum.missing.length == 0 && !sum.partial) {
      write('year', String(year), sum.value);
    } else if (isShifted(year - 1)) {
      // The record one key lower holds this year, counted from Dec 31 of last year up to (but not) Dec 31.
      const value = old.get(`year#${year - 1}`)!.value + (dayValue.get(`${year}-12-31`) ?? 0) - (dayValue.get(`${year - 1}-12-31`) ?? 0);
      const unknown = [`${year}-12-31`, `${year - 1}-12-31`].filter(d => !dayValue.has(d));
      write('year', String(year), value, `moved from key ${year - 1}` + (unknown.length ? `, no daily record for ${unknown.join(' and ')} to correct with` : ''));
    } else if (isShifted(year)) {
      // Its value was moved up one key and the real count was overwritten (only 2023 in practice).
      // Estimate it from July-December of that year (the full months on record for 2023): average x 12, rounded to hundreds.
      const months = existing.filter(r => r.type == 'month' && r.date >= `${year}-07` && r.date <= `${year}-12`);
      if (months.length > 0) {
        const average = months.reduce((sum, m) => sum + m.value, 0) / months.length;
        write('year', String(year), Math.round(average * 12 / 100) * 100,
          `estimated: average of ${months.length} month record(s) ${average.toFixed(1)} x 12, rounded to hundreds`);
      } else {
        plan.deletes.push(old.get(`year#${year}`)!);
      }
    } else if (hasDays) {
      tryDays('year', String(year));
    }
  }
  // Only years written now end up with shiftFixed; drop no-op writes of already fixed records.
  plan.writes = plan.writes.filter(w => w.type == 'month' || w.old !== w.value || !old.get(`year#${w.date}`)?.shiftFixed);
  return plan;
}

async function queryAll(client: DynamoDBClient, table: string, type: string): Promise<StatRecord[]> {
  const records: StatRecord[] = [];
  let startKey: Record<string, AttributeValue> | undefined;
  do {
    const page = await client.send(new QueryCommand({
      TableName: table,
      KeyConditionExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': { S: type } },
      ExclusiveStartKey: startKey,
    }));
    for (const item of page.Items ?? []) {
      records.push({ type, date: item.date.S!, value: Number(item.value.N), shiftFixed: item.shiftFixed?.BOOL });
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return records;
}

async function main() {
  const table = process.env.TABLE_NAME;
  if (!table) throw Error('Set TABLE_NAME');
  const apply = process.argv.includes('--apply');
  const client = new DynamoDBClient({});

  const days = await queryAll(client, table, 'day');
  const existing = [...await queryAll(client, table, 'month'), ...await queryAll(client, table, 'year')];
  const plan = planBackfill(days, existing, new Date().toISOString().substring(0, 10));

  console.log(`${days.length} daily records, ${existing.length} month/year records`);
  for (const s of plan.skipped) console.log(`SKIP   ${s.type} ${s.date}: ${s.reason}`);
  for (const w of plan.writes) console.log(`WRITE  ${w.type} ${w.date}: ${w.old ?? '(none)'} -> ${w.value}${w.note ? ` (${w.note})` : ''}`);
  for (const d of plan.deletes) console.log(`DELETE ${d.type} ${d.date} (value ${d.value} moved to ${Number(d.date) + 1}, real count unknown)`);

  if (!apply) {
    console.log('Dry run, nothing changed. Run again with --apply to write.');
    return;
  }
  for (const w of plan.writes) {
    await client.send(new PutItemCommand({
      TableName: table,
      Item: {
        type: { S: w.type }, date: { S: w.date }, value: { N: String(w.value) },
        ...(w.type == 'year' ? { shiftFixed: { BOOL: true } } : {}),
      },
    }));
  }
  for (const d of plan.deletes) {
    await client.send(new DeleteItemCommand({ TableName: table, Key: { type: { S: d.type }, date: { S: d.date } } }));
  }
  console.log(`Wrote ${plan.writes.length}, deleted ${plan.deletes.length}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
