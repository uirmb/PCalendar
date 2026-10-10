import assert from 'node:assert/strict';
import test from 'node:test';
import { getMonthCalendar } from '../src/engine/facade.ts';
import { getSeasonEvents, getTimezoneTransitions } from '../src/lib/astronomy-events.ts';
import { offsetAtUT } from '../src/lib/time.ts';
import type { TimezoneSettings } from '../src/lib/time.ts';
import { defaultSettings } from '../src/lib/state.ts';
import { renderYearCalendar } from '../src/year-view.ts';

const ny: TimezoneSettings = { timezoneMode: 'region', timezoneId: 'America/New_York', timezoneRegion: '美国东部', timezone: -5 };
const ut = (iso: string): number => Date.parse(iso) / 86400000 - 10957.5;

test('four seasons preserve original precise solar-term instants across supported year boundaries', () => {
  const terms = ['春分', '夏至', '秋分', '冬至'];
  for (const year of [-4712, 0, 1582, 2026, 2033, 9999]) {
    const old = Array.from({ length: 12 }, (_, index) => getMonthCalendar(year, index + 1).days).flat();
    const events = getSeasonEvents(year, () => 8);
    assert.equal(events.length, 4);
    events.forEach((event) => {
      const term = terms[['春季开始', '夏季开始', '秋季开始', '冬季开始'].indexOf(event.name)];
      const source = old.find((day) => day.jqmc === term);
      assert.ok(source && typeof source.jqjd === 'number', `${year} ${term} original event exists`);
      assert.ok(Math.abs(event.utcJ2000 - (source.jqjd - 8 / 24)) < 1e-6, `${year} ${term} retains the engine instant`);
      assert.equal(event.year, year);
      assert.equal(event.type, 'season');
      assert.match(event.description, /北半球/);
    });
  }
});

test('2026 season times agree with USNO minute table and use each New York event offset', () => {
  // Official USNO API: https://aa.usno.navy.mil/api/seasons?year=2026&tz=0&dst=false
  const reference = ['2026-03-20T14:46:00Z', '2026-06-21T08:24:00Z', '2026-09-23T00:05:00Z', '2026-12-21T20:50:00Z'];
  const events = getSeasonEvents(2026, (instant) => offsetAtUT(ny, instant));
  events.forEach((event, index) => assert.ok(Math.abs(event.utcJ2000 - ut(reference[index])) * 86400 < 90));
  assert.deepEqual(events.map((event) => event.offset), [-4, -4, -4, -5]);
  assert.deepEqual(events.map((event) => `${event.month}-${event.day}`), ['3-20', '6-21', '9-22', '12-21']);
  assert.deepEqual(events.map((event) => event.name), ['春季开始', '夏季开始', '秋季开始', '冬季开始']);
});

test('New York 2026 DST transitions are actual instants with explicit skipped and repeated hours', () => {
  const events = getTimezoneTransitions(2026, ny);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(({ name, month, day, time, offset }) => ({ name, month, day, time, offset })), [
    { name: '夏令时开始', month: 3, day: 8, time: '03:00:00', offset: -4 },
    { name: '夏令时结束', month: 11, day: 1, time: '01:00:00', offset: -5 },
  ]);
  assert.ok(Math.abs(events[0].utcJ2000 - ut('2026-03-08T07:00:00Z')) * 86400 < 0.01);
  assert.ok(Math.abs(events[1].utcJ2000 - ut('2026-11-01T06:00:00Z')) * 86400 < 0.01);
  assert.match(events[0].description, /02:00:00.*UTC−05:00.*03:00:00.*UTC−04:00.*拨快 1 小时/);
  assert.match(events[1].description, /02:00:00.*01:00:00.*拨慢 1 小时.*重复/);
  assert.match(events[0].description, /未来日期按当前规则推算/);
});

test('historical New York dates use IANA rules instead of applying the post-2007 rule to all years', () => {
  const dates = (year: number): string[] => getTimezoneTransitions(year, ny).map((event) => `${event.month}-${event.day}`);
  assert.deepEqual(dates(2006), ['4-2', '10-29']);
  assert.deepEqual(dates(2007), ['3-11', '11-4']);
});

test('fixed offsets and non-DST cities do not manufacture clock-change events', () => {
  assert.deepEqual(getTimezoneTransitions(2026, { ...ny, timezoneMode: 'fixed' }), []);
  for (const timezoneId of ['Asia/Shanghai', 'America/Phoenix', 'Pacific/Honolulu']) {
    assert.deepEqual(getTimezoneTransitions(2026, { ...ny, timezoneId }), []);
  }
});

test('half-hour DST and political date-line shifts retain their distinct clock changes', () => {
  const lordHowe = getTimezoneTransitions(2026, { ...ny, timezoneId: 'Australia/Lord_Howe' });
  assert.equal(lordHowe.length, 2);
  assert.ok(lordHowe.every((event) => /30 分钟/.test(event.description)));
  const apia = getTimezoneTransitions(2011, { ...ny, timezoneId: 'Pacific/Apia' });
  const dateLine = apia.find((event) => event.month === 12)!;
  assert.ok(dateLine);
  assert.equal(dateLine.name, '时区偏移调整');
  assert.match(dateLine.description, /2011年12月30日.*2011年12月31日.*拨快 24 小时/);
  assert.doesNotMatch(dateLine.description, /夏令时开始/);
  for (const event of [...lordHowe, ...apia]) {
    const settings = { ...ny, timezoneId: event.year === 2011 ? 'Pacific/Apia' : 'Australia/Lord_Howe' };
    assert.equal(event.offset, offsetAtUT(settings, event.utcJ2000));
    assert.notEqual(event.offset, offsetAtUT(settings, event.utcJ2000 - 1 / 86400));
  }
});

test('cached events stay immutable to callers and invalid years are rejected', () => {
  const altered = getTimezoneTransitions(2026, ny);
  altered[0].name = 'modified';
  assert.equal(getTimezoneTransitions(2026, ny)[0].name, '夏令时开始');
  const original = getSeasonEvents(2026, () => 0);
  original[0].name = 'modified';
  assert.equal(getSeasonEvents(2026, () => 0)[0].name, '春季开始');
  for (const year of [-4713, 10000, NaN, 2026.5]) {
    assert.throws(() => getSeasonEvents(year, () => 0), RangeError);
    assert.throws(() => getTimezoneTransitions(year, ny), RangeError);
  }
});

test('Gregorian year navigation keeps every actual civil day including the original 1582 cutover', () => {
  const settings = { ...defaultSettings('US'), timezoneMode: 'fixed' as const, timezone: 0 };
  for (const [year, count] of [[1582, 355], [2026, 365], [2028, 366]]) {
    const markup = renderYearCalendar({ year, month: 10, selectedDay: 4, page: 2, followToday: false, settings });
    const cells = [...markup.matchAll(/class="year-day(?: [^"]*)?" data-calendar-date="([^"]+)" data-open-calendar/g)].map((match) => match[1]);
    assert.equal(cells.length, count);
    assert.equal(new Set(cells).size, count);
    assert.equal((markup.match(/class="year-month"/g) ?? []).length, 12);
    if (year === 1582) {
      const fourth = cells.indexOf('1582,10,4');
      assert.equal(cells[fourth + 1], '1582,10,15');
      assert.doesNotMatch(markup, /data-calendar-date="1582,10,(?:[5-9]|1[0-4])"/);
      assert.match(markup, /10 月 4 日之后直接进入 10 月 15 日/);
    }
    if (year === 2028) assert.ok(cells.includes('2028,2,29'));
  }
});

test('year filters preserve all dates, local coverage notices and civil versus instant semantics', () => {
  const settings = defaultSettings('US');
  settings.calendarLayers = { usCultural: true, nycCivic: true, nycSchools: true, nycParking: true, commercial: false };
  const state = { year: 2027, month: 12, selectedDay: 31, page: 2, followToday: false, settings };
  const local = renderYearCalendar(state, 'local');
  assert.match(local, /data-coverage-layer="nyc-civic"/);
  assert.match(local, /data-coverage-layer="nyc-parking"/);
  assert.match(local, /data-coverage-layer="nyc-schools"/);
  assert.match(local, /部分覆盖/);
  assert.match(local, /未覆盖/);
  assert.match(local, /data-year-event-kind="local"/);
  assert.doesNotMatch(local, /data-year-event-kind="(?:national|astronomy)"/);
  assert.equal((local.match(/class="year-day(?: [^"]*)?"/g) ?? []).length, 365);
  const national = renderYearCalendar(state, 'national');
  assert.match(national, /12\/31\/2027/);
  assert.match(national, /元旦.*补休/s);
  assert.match(national, /<time>全天<\/time>/);
  assert.doesNotMatch(national, /data-year-event-kind="(?:local|astronomy)"/);
  const astronomy = renderYearCalendar({ ...state, year: 2026 }, 'astronomy');
  assert.match(astronomy, /春季开始/);
  assert.match(astronomy, /夏令时开始/);
  assert.match(astronomy, /上午 03:00:00/);
  assert.doesNotMatch(astronomy, /农历|生肖|干支|立春|清明|小满/);
});
