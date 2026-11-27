import { planBackfill, StatRecord } from '../../src/scripts/backfill-statistics';

const day = (date: string, value = 1): StatRecord => ({ type: 'day', date, value });
const allDays = (from: string, to: string) => {
  const days = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().substring(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(day(d.toISOString().substring(0, 10)));
  }
  return days;
};

test('rebuilds fully covered periods and never touches older or partially covered ones', () => {
  const days = allDays('2024-05-20', '2026-11-26'); // stats started mid-May 2024
  const existing: StatRecord[] = [
    { type: 'month', date: '2025-11', value: 29 }, // missed Nov 30
    { type: 'month', date: '2025-12', value: 31 }, // already right
    { type: 'year', date: '2022', value: 758 }, // history from before the daily records
    { type: 'year', date: '2024', value: 364, shiftFixed: true }, // already fixed, only covered from May 20 by daily records
  ];
  const plan = planBackfill(days, existing, '2026-11-27');

  expect(plan.skipped).toEqual([{ type: 'year', date: '2024', reason: 'daily data starts 2024-05-20, keeping 364' }]);
  expect(plan.writes).toContainEqual({ type: 'month', date: '2025-11', value: 30, old: 29 });
  expect(plan.writes).toContainEqual({ type: 'month', date: '2024-05', value: 12, old: undefined }); // partial, but nothing to overwrite
  expect(plan.writes).toContainEqual({ type: 'year', date: '2025', value: 365, old: undefined });
  expect(plan.writes.find(w => w.date == '2025-12')).toBeUndefined(); // unchanged, not rewritten
  expect(plan.writes.find(w => w.date == '2026-11' || w.date == '2026')).toBeUndefined(); // not finished yet
  expect(plan.writes.find(w => w.date == '2022' || w.date == '2024')).toBeUndefined();
});

test('skips a period with a missing day instead of writing a lower count', () => {
  const days = allDays('2025-01-01', '2025-12-31').filter(d => d.date != '2025-03-15');
  const plan = planBackfill(days, [{ type: 'month', date: '2025-03', value: 30 }], '2026-11-27');

  expect(plan.skipped).toHaveLength(2);
  expect(plan.skipped).toContainEqual({ type: 'month', date: '2025-03', reason: 'missing 1 day(s): 2025-03-15' });
  expect(plan.skipped).toContainEqual({ type: 'year', date: '2025', reason: 'missing 1 day(s): 2025-03-15' });
  expect(plan.writes.find(w => w.date == '2025-03' || w.date == '2025')).toBeUndefined();
});

describe('year shift', () => {
  const days = allDays('2024-05-20', '2026-11-26');
  const existing: StatRecord[] = [
    { type: 'year', date: '2021', value: 568 }, // from before the scheduled runs
    { type: 'year', date: '2022', value: 758 },
    { type: 'year', date: '2023', value: 322 }, // Jan 1 2025 run: holds 2024
    { type: 'year', date: '2024', value: 390 }, // Jan 1 2026 run: holds 2025
  ];
  const apply = (records: StatRecord[], plan: ReturnType<typeof planBackfill>) => {
    const result = new Map(records.map(r => [`${r.type}#${r.date}`, r]));
    plan.deletes.forEach(d => result.delete(`${d.type}#${d.date}`));
    plan.writes.forEach(w => result.set(`${w.type}#${w.date}`, { type: w.type, date: w.date, value: w.value, shiftFixed: w.type == 'year' }));
    return [...result.values()];
  };

  test('moves each shifted year up one key and leaves older years alone', () => {
    const plan = planBackfill(days, existing, '2026-11-27');
    const years = plan.writes.filter(w => w.type == 'year');

    expect(years).toEqual([
      // 322 + Dec 31 2024 (1); Dec 31 2023 has no daily record to subtract
      { type: 'year', date: '2024', value: 323, old: 390, note: 'moved from key 2023, no daily record for 2023-12-31 to correct with' },
      { type: 'year', date: '2025', value: 365, old: undefined }, // fully covered by daily records
    ]);
    expect(plan.deletes).toEqual([{ type: 'year', date: '2023', value: 322 }]);
    expect(plan.skipped.filter(s => s.type == 'year')).toEqual([]);
  });

  test('running again after --apply changes nothing', () => {
    const fixed = apply(existing, planBackfill(days, existing, '2026-11-27'));
    const again = planBackfill(days, fixed, '2026-11-27');

    expect(again.writes).toEqual([]);
    expect(again.deletes).toEqual([]);
    expect(fixed.filter(r => r.type == 'year').map(r => [r.date, r.value])).toEqual([['2021', 568], ['2022', 758], ['2024', 323], ['2025', 365]]);
  });

  test('a year written after the fix is not treated as shifted', () => {
    const fixed = apply(existing, planBackfill(days, existing, '2026-11-27'));
    const withNewRun = [...fixed, { type: 'year', date: '2026', value: 300 }]; // Jan 1 2027 run, fixed lambda
    const plan = planBackfill(days, withNewRun, '2027-01-02');

    expect(plan.deletes).toEqual([]);
    expect(plan.writes.find(w => w.date == '2027')).toBeUndefined();
  });
});

test('estimates the overwritten first shifted year from its month records', () => {
  const days = allDays('2024-05-20', '2026-11-26');
  const months: StatRecord[] = [260, 250, 270, 255, 265, 260].map((value, i) => ({ type: 'month', date: `2023-${String(i + 7).padStart(2, '0')}`, value }));
  const partialJune: StatRecord = { type: 'month', date: '2023-06', value: 40 }; // before July: not used
  const existing: StatRecord[] = [partialJune, ...months, { type: 'year', date: '2023', value: 322 }, { type: 'year', date: '2024', value: 390 }];
  const plan = planBackfill(days, existing, '2026-11-27');

  // average 260 x 12 = 3120 -> 3100
  expect(plan.writes).toContainEqual({ type: 'year', date: '2023', value: 3100, old: 322, note: 'estimated: average of 6 month record(s) 260.0 x 12, rounded to hundreds' });
  expect(plan.writes).toContainEqual(expect.objectContaining({ type: 'year', date: '2024', value: 323 })); // 322 still moves up
  expect(plan.deletes).toEqual([]);
  expect(plan.writes.filter(w => w.date.startsWith('2023-'))).toEqual([]); // month records untouched
});

test('rounds the estimate to the nearest hundred', () => {
  const estimate = (value: number) => planBackfill([], [{ type: 'month', date: '2023-12', value }, { type: 'year', date: '2023', value: 1 }], '2026-11-27').writes[0].value;
  expect(estimate(3123 / 12)).toBe(3100);
  expect(estimate(3561 / 12)).toBe(3600);
});
