import assert from 'node:assert/strict';
import test from 'node:test';
import { getChinaDayHolidays, getHolidayCoverage, getHolidays, HOLIDAY_METADATA } from '../src/lib/holidays.ts';
import { getMonthCalendar } from '../src/engine/facade.ts';

// 独立核对日期来源：OPM Federal Holidays 2026–2028；国务院国办发明电〔2025〕7号。
// 全天节日使用民用日期，测试不把它们当成 UTC 时间戳或依赖执行机器的时区。
test('US 2026 contains all eleven actual federal dates and a separate Independence Day observed date', () => {
  const holidays = getHolidays('US', 2026);
  assert.deepEqual(holidays.filter((item) => item.category === 'federal').map((item) => item.date), [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
    '2026-07-04', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  ]);
  assert.deepEqual(holidays.filter((item) => item.category === 'observed').map((item) => [item.date, item.observedFor]), [['2026-07-03', '2026-07-04']]);
  assert.match(holidays.find((item) => item.date === '2026-11-26')!.name, /感恩/);
  assert.match(holidays.find((item) => item.date === '2026-12-25')!.name, /圣诞/);
});

test('observed holidays cross the civil year only when the actual date falls on a weekend', () => {
  const before = getHolidays('US', 2026), next = getHolidays('US', 2027), after = getHolidays('US', 2028);
  assert.equal(before.some((item) => item.date === '2026-12-31'), false, '2027-01-01 is Friday, so there is no prior-day observed date');
  assert.deepEqual(next.filter((item) => item.date === '2027-12-31').map((item) => [item.category, item.observedFor]), [['observed', '2028-01-01']]);
  assert.equal(after.filter((item) => item.date === '2028-01-01' && item.category === 'federal').length, 1);
  assert.equal(after.some((item) => item.observedFor === '2028-01-01'), false);
  assert.ok(next.some((item) => item.date === '2027-07-05' && item.observedFor === '2027-07-04'));
  for (const year of [2026, 2027, 2028]) {
    const events = getHolidays('US', year);
    assert.equal(new Set(events.map((item) => item.id)).size, events.length);
    assert.ok(events.every((item) => item.year === year && item.date.startsWith(`${year}-`)));
  }
});

test('US statutory effective years and the historical Veterans Day rule are respected', () => {
  const find = (year: number, id: string) => getHolidays('US', year).filter((item) => item.id.startsWith(`US:${id}:`));
  assert.equal(find(1985, 'mlk').length, 0);
  assert.equal(find(1986, 'mlk')[0]!.date, '1986-01-20');
  assert.equal(find(2020, 'juneteenth').length, 0);
  assert.equal(find(2021, 'juneteenth')[0]!.date, '2021-06-19');
  assert.ok(getHolidays('US', 2021).some((item) => item.date === '2021-06-18' && item.observedFor === '2021-06-19'));
  assert.equal(find(1977, 'veterans')[0]!.date, '1977-10-24');
  assert.equal(find(1978, 'veterans')[0]!.date, '1978-11-11');
  assert.equal(getHolidayCoverage('US', 1970).supported, false);
  assert.deepEqual(getHolidays('US', 1970), []);
  assert.equal(getHolidayCoverage('US', 1971).supported, true);
});

test('cultural dates are explicitly separate from federal holidays and observed leave', () => {
  const holidays = getHolidays('US', 2026);
  const culture = holidays.filter((item) => item.category === 'cultural');
  assert.deepEqual(culture.map((item) => item.date), ['2026-02-14', '2026-03-17', '2026-04-05', '2026-05-10', '2026-06-21', '2026-10-31']);
  const halloween = holidays.filter((item) => item.date === '2026-10-31');
  assert.equal(halloween.length, 1);
  assert.equal(halloween[0]!.category, 'cultural');
  assert.equal(halloween[0]!.observedFor, undefined);
  assert.ok(culture.every((item) => /不属于/.test(item.description)));
});

test('China 2026 official schedule contains exactly the announced 33 rest days and six make-up workdays', () => {
  const holidays = getHolidays('CN', 2026);
  // 期望值独立于生产表生成，避免用同一份范围表验证自身。
  const rest = [
    '01-01', '01-02', '01-03', '02-15', '02-16', '02-17', '02-18', '02-19', '02-20', '02-21', '02-22', '02-23',
    '04-04', '04-05', '04-06', '05-01', '05-02', '05-03', '05-04', '05-05', '06-19', '06-20', '06-21',
    '09-25', '09-26', '09-27', '10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07',
  ].map((date) => `2026-${date}`);
  const work = ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10'].map((date) => `2026-${date}`);
  assert.deepEqual(holidays.filter((item) => item.category === 'rest').map((item) => item.date), rest);
  assert.deepEqual(holidays.filter((item) => item.category === 'workday').map((item) => item.date), work);
  assert.equal(holidays.length, 39);
  assert.ok(holidays.every((item) => item.sourceId === 'cn-2026'));
  assert.equal(getHolidayCoverage('CN', 2026).scheduleAvailable, true);
  assert.equal(getHolidayCoverage('CN', 2027).scheduleAvailable, false);
  assert.deepEqual(getHolidays('CN', 2027), []);
});

test('Chinese lunar festivals survive while obsolete holiday strings and Fjia do not define official leave', () => {
  const february = getMonthCalendar(2026, 2);
  const spring = february.days.find((day) => day.d === 17)!;
  const holidays = getChinaDayHolidays(spring);
  assert.ok(holidays.some((item) => item.name === '春节' && item.category === 'traditional'));
  assert.ok(holidays.some((item) => item.category === 'rest'));
  const october = getMonthCalendar(2026, 10).days;
  for (const day of october) assert.equal(getChinaDayHolidays(day).some((item) => /国庆(?:节)?假日/.test(item.name)), false);
  const unrelated = { ...october.find((day) => day.d === 8)!, A: '国庆节假日', B: '国庆假日', C: '', Fjia: 1 };
  assert.deepEqual(getChinaDayHolidays(unrelated), []);
  assert.equal(unrelated.Fjia, 1, 'display filtering does not mutate original engine data');
});

test('unsupported countries and years disclose missing coverage without importing Chinese holidays', () => {
  for (const country of ['GB', 'AU', 'JP', 'ZZ']) {
    assert.deepEqual(getHolidays(country, 2026), []);
    const coverage = getHolidayCoverage(country, 2026);
    assert.equal(coverage.supported, false);
    assert.equal(coverage.scheduleAvailable, false);
    assert.match(coverage.summary, /未覆盖/);
  }
  for (const invalid of [NaN, Infinity, 2026.5, -4713, 10000]) assert.deepEqual(getHolidays('US', invalid), []);
  assert.equal(HOLIDAY_METADATA.CN.officialScheduleYears.includes(2026), true);
  assert.match(HOLIDAY_METADATA.sources['cn-2026'].url, /^https:\/\//);
  assert.match(HOLIDAY_METADATA.sources['us-opm'].url, /^https:\/\//);
});
