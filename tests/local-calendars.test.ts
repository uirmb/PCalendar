import assert from 'node:assert/strict';
import test from 'node:test';
import { getHolidays, getCalendarEventSource } from '../src/lib/holidays.ts';
import { DEFAULT_CALENDAR_LAYERS, getCalendarHolidays, getLocalCalendarCoverage, resolveCalendarLayers } from '../src/lib/local-calendars.ts';
import type { CalendarLocationSettings } from '../src/lib/local-calendars.ts';

const nyc: CalendarLocationSettings = { countryCode: 'US', subdivisionCode: 'US-NY', municipalityCode: 'US-NYC' };
const complete: CalendarLocationSettings = { ...nyc, calendarLayers: { usCultural: true, nycCivic: true, nycSchools: true, nycParking: true, commercial: true } };
const isLocal = (event: { category: string }) => ['local', 'school', 'parking'].includes(event.category);

test('NYC defaults opt into culture and civic dates but never into schools, parking or shopping', () => {
  assert.deepEqual(DEFAULT_CALENDAR_LAYERS, { usCultural: true, nycCivic: true, nycSchools: false, nycParking: false, commercial: false });
  const events = getCalendarHolidays(nyc, 2026);
  assert.ok(events.some((event) => event.date === '2026-11-03' && event.category === 'local'));
  assert.equal(events.some((event) => ['school', 'parking', 'commercial'].includes(event.category)), false);
  assert.equal(events.filter((event) => event.category === 'cultural').length, 8);
  assert.ok(events.some((event) => event.date === '2026-12-24' && event.name === '平安夜'));
  assert.ok(events.some((event) => event.date === '2026-12-31' && event.name === '跨年夜'));
  assert.equal(events.some((event) => event.observedFor === '2026-12-24' || event.observedFor === '2026-12-31'), false);
});

test('NYC requires the exact municipality and country, independent of timezone or US-NY subdivision', () => {
  const cases = [
    { ...complete, municipalityCode: 'US-LAX' },
    { ...complete, municipalityCode: undefined },
    { ...complete, municipalityCode: 'US-ALB' },
    { ...complete, countryCode: 'CA' },
    { ...complete, countryCode: 'CN' },
  ];
  for (const settings of cases) {
    assert.equal(getCalendarHolidays(settings, 2026).some(isLocal), false);
    assert.equal(getLocalCalendarCoverage(settings, 2026).some((coverage) => coverage.id.startsWith('nyc-')), false);
  }
  const easternLosAngeles = { ...complete, municipalityCode: 'US-LAX', timezoneId: 'America/New_York' };
  assert.equal(getCalendarHolidays(easternLosAngeles, 2026).some(isLocal), false);
});

test('turning off optional layers preserves every original federal and observed date and China schedule', () => {
  const none = { ...complete, calendarLayers: { usCultural: false, nycCivic: false, nycSchools: false, nycParking: false, commercial: false } };
  for (const year of [1971, 1977, 1978, 1986, 2021, 2026, 2027, 2028]) {
    const actual = getCalendarHolidays(none, year).map(({ id, date, category, observedFor }) => ({ id, date, category, observedFor }));
    const expected = getHolidays('US', year).filter((event) => event.category === 'federal' || event.category === 'observed').map(({ id, date, category, observedFor }) => ({ id, date, category, observedFor }));
    assert.deepEqual(actual, expected);
  }
  assert.deepEqual(getCalendarHolidays({ ...complete, countryCode: 'CN' }, 2026), getHolidays('CN', 2026));
  const coverage = getLocalCalendarCoverage(none, 2026);
  assert.deepEqual(coverage.map((layer) => layer.id), ['us-federal']);
  assert.equal(coverage[0]!.available, true);
  assert.equal(getLocalCalendarCoverage(none, 1970)[0]!.available, false);
  assert.deepEqual(resolveCalendarLayers({ nycSchools: true, usCultural: false }), { usCultural: false, nycCivic: true, nycSchools: true, nycParking: false, commercial: false });
});

test('2026 Election Day retains three distinct civic, remote-school and ASP effects', () => {
  const events = getCalendarHolidays(complete, 2026).filter((event) => event.date === '2026-11-03');
  assert.deepEqual(events.map((event) => event.category).sort(), ['local', 'parking', 'school']);
  const school = events.find((event) => event.category === 'school')!;
  assert.equal(school.status, 'remote');
  assert.match(school.name, /远程上课/);
  assert.match(school.effect!, /全体学生远程上课/);
  assert.deepEqual(school.audience, ['NYCPS 全体学生']);
  assert.equal(school.sourceId, 'nyc-schools-2026-27');
  assert.match(events.find((event) => event.category === 'local')!.effect!, /不代表全体居民放假/);
  assert.equal(new Set(events.map((event) => event.id)).size, 3);
});

test('December 8 ASP suspension is separate from meter relief, school closure and public leave', () => {
  const events = getCalendarHolidays(complete, 2026).filter((event) => event.date === '2026-12-08');
  assert.equal(events.length, 1);
  assert.equal(events[0]!.category, 'parking');
  assert.equal(events[0]!.status, 'asp-suspended');
  assert.match(events[0]!.name, /Immaculate Conception/);
  assert.match(events[0]!.effect!, /不等于免费停车/);
  assert.match(events[0]!.effect!, /计费.*仍须遵守/);
  const christmas = getCalendarHolidays(complete, 2026).find((event) => event.category === 'parking' && event.date === '2026-12-25')!;
  assert.match(christmas.effect!, /停车计费暂停/);
  assert.match(christmas.effect!, /全年七天生效/);
});

test('parking combines same-day suspension reasons without erasing distinct sources of impact', () => {
  const events = getCalendarHolidays(complete, 2026);
  const february16 = events.filter((event) => event.date === '2026-02-16');
  const parking = february16.filter((event) => event.category === 'parking');
  assert.equal(parking.length, 1);
  assert.match(parking[0]!.effect!, /华盛顿.*农历除夕/);
  assert.ok(february16.some((event) => event.category === 'federal'));
  assert.ok(february16.some((event) => event.category === 'school'));
  assert.equal(events.filter((event) => event.category === 'parking').length, 42);
});

test('school data respects school-year changes and boundaries instead of copying prior-year election rules', () => {
  const earlier = getCalendarHolidays(complete, 2025).find((event) => event.category === 'school' && event.date === '2025-11-04')!;
  assert.equal(earlier.status, 'no-students');
  const january = getCalendarHolidays(complete, 2026).filter((event) => event.category === 'school' && ['2026-01-01', '2026-01-02'].includes(event.date));
  assert.equal(january.length, 2);
  assert.ok(january.every((event) => event.sourceId === 'nyc-schools-2025-26' && event.status === 'closed'));
  const december = getCalendarHolidays(complete, 2026).filter((event) => event.category === 'school' && event.date >= '2026-12-24');
  assert.equal(december.length, 8);
  assert.ok(december.every((event) => event.sourceId === 'nyc-schools-2026-27'));
  const next = getCalendarHolidays(complete, 2027).filter((event) => event.category === 'school' && event.date <= '2027-01-02');
  assert.deepEqual(next.map((event) => event.date), ['2027-01-01']);
});

test('school early dismissals and selected-grade no-class days keep their exact audience', () => {
  const events = getCalendarHolidays(complete, 2026);
  const elementary = events.find((event) => event.category === 'school' && event.date === '2026-11-05')!;
  const middle = events.find((event) => event.category === 'school' && event.date === '2026-11-12')!;
  assert.equal(elementary.status, 'early-dismissal');
  assert.match(elementary.effect!, /提前三小时/);
  assert.deepEqual(elementary.audience, ['小学', 'Pre-K 中心']);
  assert.deepEqual(middle.audience, ['初中', 'D75 学校']);
  const development = events.find((event) => event.category === 'school' && event.date === '2026-01-26')!;
  assert.equal(development.status, 'no-students');
  assert.deepEqual(development.audience, ['高中', '6–12 学校']);
  assert.match(development.effect!, /不表示学校建筑关闭/);
  assert.equal(events.some((event) => event.date === '2026-06-19' && event.status === 'examination'), false);
  assert.equal(events.some((event) => event.date === '2026-06-20' && event.status === 'examination'), false);
});

test('commercial dates are optional, independent of culture, and allow Cyber Monday to fall in December', () => {
  const settings = { ...nyc, calendarLayers: { usCultural: false, commercial: true } };
  assert.deepEqual(getCalendarHolidays(settings, 2026).filter((event) => event.category === 'commercial').map((event) => event.date), ['2026-11-27', '2026-11-30']);
  assert.deepEqual(getCalendarHolidays(settings, 2025).filter((event) => event.category === 'commercial').map((event) => event.date), ['2025-11-28', '2025-12-01']);
  assert.equal(getCalendarHolidays(settings, 2026).some((event) => event.category === 'cultural'), false);
  assert.equal(getCalendarHolidays(settings, 2004).some((event) => event.category === 'commercial'), false);
  assert.equal(getLocalCalendarCoverage(settings, 2004).find((item) => item.id === 'commercial')!.available, false);
});

test('finite local schedules report missing or partial coverage instead of extrapolating annual dates', () => {
  const coverage = getLocalCalendarCoverage(complete, 2027);
  assert.equal(coverage.find((item) => item.id === 'nyc-civic')!.available, false);
  assert.equal(coverage.find((item) => item.id === 'nyc-parking')!.available, false);
  assert.equal(coverage.find((item) => item.id === 'nyc-schools')!.partial, true);
  assert.equal(getLocalCalendarCoverage(complete, 2025).find((item) => item.id === 'nyc-schools')!.partial, true);
  assert.equal(getLocalCalendarCoverage(complete, 2026).find((item) => item.id === 'nyc-schools')!.partial, false);
  for (const year of [2024, 2028]) {
    assert.equal(getCalendarHolidays(complete, year).some(isLocal), false);
    assert.ok(getLocalCalendarCoverage(complete, year).filter((item) => item.id.startsWith('nyc-')).every((item) => !item.available));
  }
  for (const invalid of [NaN, Infinity, 2026.5, -4713, 10000]) assert.deepEqual(getCalendarHolidays(complete, invalid), []);
});

test('all enriched events expose source, scope and coverage and remain civil dates under arbitrary timezones', () => {
  const events = getCalendarHolidays(complete, 2026);
  for (const event of events) {
    assert.equal(event.year, 2026);
    assert.equal(event.date, `${event.year}-${String(event.month).padStart(2, '0')}-${String(event.day).padStart(2, '0')}`);
    assert.ok(event.scope && event.effect && event.coverageLabel);
    assert.match(getCalendarEventSource(event)!.url, /^https:\/\//);
  }
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  const foreignOffset = { ...complete, timezone: 14, timezoneId: 'Pacific/Kiritimati' };
  assert.deepEqual(getCalendarHolidays(foreignOffset, 2026), events);
  assert.ok(events.some((event) => event.date === '2026-12-25' && event.category === 'federal'));
  assert.equal(events.some((event) => event.date === '2026-12-24' && event.category === 'federal'), false);
});
