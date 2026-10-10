import assert from 'node:assert/strict';
import test from 'node:test';
import { dateSummary, getMonthEvents, renderCalendar, selectedDay } from '../src/calendar-view.ts';
import { getSunMoon } from '../src/engine/facade.ts';
import { J2000 } from '../src/engine/engine.ts';
import { defaultSettings, type AppSettings, type AppState } from '../src/lib/state.ts';
import { localToUT, offsetAtUT } from '../src/lib/time.ts';
import { formatClock } from '../src/lib/format.ts';
import { getCalendarHolidays } from '../src/lib/local-calendars.ts';
import { html } from '../src/lib/dom.ts';

function nycSettings(): AppSettings {
  const settings = defaultSettings('US');
  settings.calendarLayers = { usCultural: true, nycCivic: true, nycSchools: true, nycParking: true, commercial: true };
  return settings;
}
function stateFor(settings: AppSettings, year = 2026, month = 11, selectedDay = 3): AppState {
  return { year, month, selectedDay, page: 1, followToday: false, settings };
}
function cell(markup: string, year: number, month: number, day: number): string {
  const value = markup.match(new RegExp(`<button[^>]*data-calendar-date="${year},${month},${day}"[\\s\\S]*?</button>`))?.[0];
  assert.ok(value, `calendar cell ${year}-${month}-${day} exists`);
  return value;
}

test('NYC election day shows two compact items plus overflow, while aria and details retain all three distinct impacts', () => {
  const settings = nycSettings(), state = stateFor(settings), markup = renderCalendar(state), selected = cell(markup, 2026, 11, 3);
  assert.equal((selected.match(/class="day-local-item"/g) ?? []).length, 2);
  assert.match(selected, /class="day-more"[^>]*>\+1</);
  assert.match(selected, /公校远程上课/);
  assert.doesNotMatch(selected, /calendar-status-marker|data-rest-state/);
  const aria = selected.match(/aria-label="([^"]*)"/)?.[1] ?? '';
  for (const name of ['选举日（纽约）', '选举日 · 远程上课', 'ASP 暂停 · 选举日']) assert.ok(aria.includes(name));
  assert.match(aria, /这一天不是学生停课日/);
  assert.match(markup, /aria-label="本月节日与当地事项"/);
  assert.match(markup, /aria-label="季节与月相"/);
  const sidebar = markup.split('<aside class="day-sidebar"')[1]!;
  for (const value of ['纽约市 2026 大选', '纽约市公校（NYCPS）', '停车计费及其他已张贴的限制仍须遵守', '资料覆盖', '2026–27 学年官方排期']) assert.ok(sidebar.includes(value), value);
  for (const domain of ['https://vote.nyc/', 'https://www.schools.nyc.gov/', 'https://portal.311.nyc.gov/']) assert.ok(sidebar.includes(`href="${domain}`), domain);
  assert.equal((sidebar.match(/class="local-holiday-detail"/g) ?? []).length, 3);
});

test('NYC monthly content follows the selected municipality and enabled layers independently of UTC offset', () => {
  const settings = nycSettings();
  const disabled = { ...settings, calendarLayers: { ...settings.calendarLayers, nycSchools: false, nycParking: false } };
  const disabledCell = cell(renderCalendar(stateFor(disabled)), 2026, 11, 3);
  assert.match(disabledCell, /选举日（纽约）/);
  assert.doesNotMatch(disabledCell, /远程上课|ASP 暂停|day-more/);
  for (const moved of [{ ...settings, municipalityCode: '' }, { ...settings, countryCode: 'GB' }]) {
    assert.doesNotMatch(renderCalendar(stateFor(moved)), /data-layer-id="nyc-|ASP 暂停|公校远程上课/);
  }
  const east = { ...settings, timezoneMode: 'fixed' as const, timezone: 8 };
  assert.match(cell(renderCalendar(stateFor(east)), 2026, 11, 3), /公校远程上课/);
  const westChina = { ...defaultSettings('CN'), timezoneMode: 'fixed' as const, timezone: -5 };
  assert.doesNotMatch(renderCalendar(stateFor(westChina)), /data-layer-id="nyc-/);
});

test('ordinary clocks honor 12/24 preference in month details and copied text without turning durations into clock times', () => {
  for (const clockFormat of ['12', '24'] as const) {
    const settings = { ...nycSettings(), clockFormat, dateFormat: 'dmy' as const }, state = stateFor(settings), day = selectedDay(state);
    const offset = offsetAtUT(settings, localToUT(settings, day.d0));
    const times = getSunMoon(day.d0 + J2000, settings.longitude, settings.latitude, offset, (ut) => offsetAtUT(settings, ut));
    const markup = renderCalendar(state), copy = dateSummary(state);
    for (const raw of [times.sunrise, times.sunset, times.solarNoon, times.civilDawn, times.civilDusk, times.moonrise, times.moonset, times.moonTransit]) {
      assert.ok(markup.includes(html(formatClock(settings, raw))), `rendered ${raw} in ${clockFormat}`);
      assert.ok(copy.includes(formatClock(settings, raw)), `copied ${raw} in ${clockFormat}`);
    }
    assert.ok(copy.includes(`日照 ${times.daylight}；白天时间 ${times.lightDuration}`));
    assert.ok(markup.includes(`日照 ${times.daylight}`));
    assert.ok(markup.includes(`<dt>白天时间</dt><dd>${times.lightDuration}</dd>`));
    assert.match(copy, /寿星天文历 · 03\/11\/2026/);
    if (clockFormat === '12') { assert.match(copy, /日落 下午 /); assert.match(copy, /太阳中天 上午 /); }
    else assert.doesNotMatch(copy, /上午|下午/);
    const phase = getMonthEvents(2026, 3, settings).find((event) => event.type === 'moon')!;
    const phaseState = stateFor(settings, phase.year, phase.month, phase.day);
    assert.ok(dateSummary(phaseState).includes(`${phase.name} ${formatClock(settings, phase.time)}`));
    assert.ok(cell(renderCalendar(phaseState), phase.year, phase.month, phase.day).includes(`${phase.name} ${formatClock(settings, phase.time)}`));
  }
});

test('US seasons and DST use local cells and retain raw event times while displayed transition explanations use the selected clock format', () => {
  const settings = nycSettings(), events = getMonthEvents(2026, 3, settings);
  const transition = events.find((event) => event.type === 'dst')!;
  assert.equal(transition.day, 8);
  assert.equal(transition.time, '03:00:00');
  assert.equal(transition.offset, -4);
  assert.ok(Math.abs(transition.utcJ2000 - (Date.parse('2026-03-08T07:00:00Z') / 86400000 - 10957.5)) < 1e-8);
  const state = stateFor(settings, 2026, 3, 8), markup = renderCalendar(state), copied = dateSummary(state);
  assert.match(cell(markup, 2026, 3, 8), /marker-dst/);
  assert.match(copied, /夏令时开始 上午 03:00:00/);
  assert.match(copied, /从 2026年3月8日 上午 02:00:00（UTC−05:00）调整为 2026年3月8日 上午 03:00:00（UTC−04:00）/);
  assert.doesNotMatch(copied, /UTC−上午|UTC−下午/);
  const september = getMonthEvents(2026, 9, settings).find((event) => event.type === 'season')!;
  assert.equal(september.day, 22);
  assert.match(cell(renderCalendar(stateFor(settings, 2026, 9, 22)), 2026, 9, 22), /marker-season/);
  const east = { ...settings, timezoneMode: 'fixed' as const, timezone: 8 };
  const eastSeason = getMonthEvents(2026, 9, east).find((event) => event.type === 'season')!;
  assert.equal(eastSeason.day, 23);
  assert.equal(eastSeason.utcJ2000, september.utcJ2000);
  assert.equal(getMonthEvents(2026, 3, east).some((event) => event.type === 'dst'), false);
  const west = { ...settings, timezoneMode: 'fixed' as const, timezone: -12 };
  const adjacent = cell(renderCalendar(stateFor(west, 2026, 12, 1)), 2026, 11, 30);
  assert.match(adjacent, /is-outside/);
  assert.match(adjacent, /下弦月/);
});

test('unavailable and partial local coverage is visible before expanding sources, with no recycled yearly schedules', () => {
  const settings = nycSettings();
  const future = renderCalendar(stateFor(settings, 2028, 11, 3));
  assert.match(future, /<summary>部分日历资料未覆盖 · 资料来源与覆盖范围<\/summary>/);
  assert.doesNotMatch(future, /data-layer-id="nyc-/);
  assert.match(future, /data-coverage-layer="us-federal"/);
  const partial = renderCalendar(stateFor(settings, 2027, 5, 3));
  assert.match(partial, /<summary>[^<]*部分日历仅收录部分日期[^<]*<\/summary>/);
  const nationalOnly = { ...settings, calendarLayers: { usCultural: false, nycCivic: false, nycSchools: false, nycParking: false, commercial: false } };
  assert.doesNotMatch(renderCalendar(stateFor(nationalOnly, 2028)), /has-coverage-warning/);
});

test('US zodiac is optional, Chinese cultural fields and official rest remain, and JD values remain in expandable details', () => {
  const us = { ...nycSettings(), showZodiac: false }, usState = stateFor(us), usMarkup = renderCalendar(usState), day = selectedDay(usState);
  for (const text of [usMarkup, dateSummary(usState)]) assert.doesNotMatch(text, /十二星座|天蝎座|农历|黄帝纪年|回历/);
  assert.match(usMarkup, /<details class="day-astronomy-details">[\s\S]*?<dt>儒略日<\/dt>/);
  assert.ok(usMarkup.includes(`<dd class="mono">${day.d0 + J2000}</dd>`));
  assert.ok(dateSummary(usState).includes(`距J2000 ${day.d0}日`));
  const cn = { ...defaultSettings('CN'), showZodiac: false, timezoneMode: 'fixed' as const, timezone: 8 }, cnState = stateFor(cn, 2026, 10, 1);
  const cnMarkup = renderCalendar(cnState), cnCopy = dateSummary(cnState);
  for (const value of ['农历', '黄帝纪年', '回历', '立春纪年']) { assert.ok(cnMarkup.includes(value)); assert.ok(cnCopy.includes(value)); }
  assert.match(cnMarkup, /<dt>星座<\/dt>/);
  assert.match(cell(cnMarkup, 2026, 10, 1), /data-rest-state="rest"/);
  assert.match(cell(cnMarkup, 2026, 10, 1), /calendar-status-marker is-rest/);
});

test('hover summary stays concise without discarding any event name, while copy keeps source and applicability', () => {
  const settings = nycSettings(), state = stateFor(settings), compact = dateSummary(state, { compact: true }), full = dateSummary(state);
  assert.ok(compact.length < full.length / 2);
  assert.doesNotMatch(compact, /https:\/\/|来源：|资料覆盖：/);
  for (const event of getCalendarHolidays(settings, 2026).filter((event) => event.month === 11 && event.day === 3)) assert.ok(compact.includes(event.name));
  assert.match(full, /适用范围：纽约市公校/);
  assert.match(full, /https:\/\/www\.schools\.nyc\.gov/);
  assert.match(full, /暂停换边停车不等于免费停车/);
});


test('observed federal holidays retain their qualifier in short cells and use the preferred date format in explanations', () => {
  const settings = { ...nycSettings(), dateFormat: 'mdy' as const }, state = stateFor(settings, 2026, 7, 3);
  const markup = renderCalendar(state), selected = cell(markup, 2026, 7, 3), copied = dateSummary(state);
  assert.match(selected, /class="day-local-item"[^>]*>独立日（补休）<\/span>/);
  assert.match(copied, /原节日 07\/04\/2026/);
  assert.match(copied, /07\/04\/2026 独立日的 observed 日期/);
  assert.doesNotMatch(copied, /2026-07-04/);
});
