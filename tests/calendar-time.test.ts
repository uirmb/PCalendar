import assert from 'node:assert/strict';
import test from 'node:test';
import { dateSummary, getMonthEvents, renderCalendar, type CalendarEvent } from '../src/calendar-view.ts';
import { defaultSettings, type AppSettings } from '../src/lib/state.ts';
import { OriginalOracle, assertEquivalent } from './oracle.ts';

function originalEvents(original: OriginalOracle, year: number, month: number, offset: number, daylight?: { start: number; end: number; crossesYear: boolean }): CalendarEvent[] {
  return original.evaluate<CalendarEvent[]>(`
    var _result=[];var _lunar=new Lunar();
    for(var _delta=-1;_delta<=1;_delta++){
      var _absolute=_year*12+_month-1+_delta;
      var _y=Math.floor(_absolute/12),_m=(_absolute%12+12)%12+1;
      if(_y < -4712 || _y > 9999)continue;
      _lunar.yueLiCalc(_y,_m);
      for(var _i=0;_i<_lunar.dn;_i++){
        var _day=_lunar.lun[_i];
        for(var _key of ['jq','yx'])if(_day[_key+'mc']){
          var _ut=_day[_key+'jd']-8/24;
          var _summer=_daylight&&(_daylight.crossesYear?(_ut>=_daylight.start||_ut<_daylight.end):(_ut>=_daylight.start&&_ut<_daylight.end));
          var _effective=_offset+(_summer?1:0),_local=_ut+_effective/24;
          var _number=Math.floor(_local+0.5),_date=JD.DD(_number+J2000);
          if(_date.Y===_year&&_date.M===_month)_result.push({name:_day[_key+'mc'],type:_key==='jq'?'term':'moon',year:_date.Y,month:_date.M,day:_date.D,dayNumber:_number,time:JD.timeStr(_local),offset:_effective,utcJ2000:_ut});
        }
      }
    }
    _result.sort(function(a,b){return a.utcJ2000-b.utcJ2000;});
  `, { _year: year, _month: month, _offset: offset, _daylight: daylight ?? null });
}

test('UTC+8 calendar events preserve every original event instant and date across historical boundaries', () => {
  const original = new OriginalOracle();
  const settings: AppSettings = { ...defaultSettings(), countryCode: 'CN', timezoneMode: 'fixed', timezone: 8 };
  for (const year of [-4712, -721, 0, 1582, 2000, 2026, 2033, 9999]) {
    for (const month of [1, 3, 6, 10, 11, 12]) {
      assertEquivalent(getMonthEvents(year, month, settings), originalEvents(original, year, month, 8), `UTC+8 ${year}-${month}`);
    }
  }
});

test('fixed-zone event lists include adjacent-month events and omit those moved outside the month', () => {
  const original = new OriginalOracle();
  for (const offset of [-12, -3.5, 0, 5.75, 14]) {
    const settings: AppSettings = { ...defaultSettings(), countryCode: 'CN', timezoneMode: 'fixed', timezone: offset };
    for (let month = 1; month <= 12; month++) {
      assertEquivalent(getMonthEvents(2026, month, settings), originalEvents(original, 2026, month, offset), `UTC${offset} 2026-${month}`);
    }
  }
  const west: AppSettings = { ...defaultSettings(), countryCode: 'CN', timezoneMode: 'fixed', timezone: -12 };
  const november = getMonthEvents(2026, 11, west);
  assert.ok(november.some((event) => event.name === '下弦' && event.day === 30 && event.time === '18:08:37'));
  assert.equal(getMonthEvents(2026, 12, west).some((event) => event.name === '下弦' && event.day === 1), false);
  const decemberChina = getMonthEvents(2026, 12, { ...defaultSettings(), countryCode: 'CN', timezoneMode: 'fixed', timezone: 8 });
  const originalInstant = decemberChina.find((event) => event.name === '下弦' && event.day === 1)!.utcJ2000;
  assert.equal(november.find((event) => event.name === '下弦' && event.day === 30)!.utcJ2000, originalInstant);
});

test('calendar event offsets use each event instant across northern and southern DST seasons', () => {
  const original = new OriginalOracle();
  const universal = (iso: string): number => Date.parse(iso) / 86400000 - 10957.5;
  for (const [name, timezoneId, offset, start, end, crossesYear] of [
    ['英国', 'Europe/London', 0, '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z', false],
    ['澳大利亚东部', 'Australia/Sydney', 10, '2026-10-03T16:00:00Z', '2026-04-04T16:00:00Z', true],
  ] as const) {
    const settings: AppSettings = { ...defaultSettings(), countryCode: 'CN', timezoneMode: 'region', timezoneRegion: name, timezoneId, timezone: offset };
    for (const month of [1, 3, 4, 7, 10, 11]) {
      const expected = originalEvents(original, 2026, month, offset, { start: universal(start), end: universal(end), crossesYear });
      assertEquivalent(getMonthEvents(2026, month, settings), expected, `${name} 2026-${month}`);
    }
  }
});

test('international moon events preserve exact engine instants while CN-only terms and date fields are excluded', () => {
  const original = new OriginalOracle();
  const names: Record<string, string> = { '朔': '新月', '望': '满月', '上弦': '上弦月', '下弦': '下弦月' };
  for (const countryCode of ['US', 'GB']) {
    for (const timezone of [-12, -5, 5.75, 14]) {
      const settings = { ...defaultSettings(countryCode), timezoneMode: 'fixed' as const, timezone };
      for (let month = 1; month <= 12; month++) {
        const expected = originalEvents(original, 2026, month, timezone).filter((event) => event.type === 'moon').map((event) => ({ ...event, name: names[event.name]! }));
        // 我单独对照原月相；美国新增的季节和时钟切换由本地化测试验证。
        assertEquivalent(getMonthEvents(2026, month, settings).filter((event) => event.type === 'moon'), expected, `${countryCode} ${timezone} ${month}`);
      }
    }
  }
  for (const countryCode of ['US', 'GB', 'CN']) {
    const settings = { ...defaultSettings(countryCode), timezoneMode: 'fixed' as const, timezone: 8 };
    const state = { year: 2026, month: 12, selectedDay: 25, page: 1, followToday: false, settings };
    const markup = renderCalendar(state), copied = dateSummary(state);
    if (countryCode === 'CN') { assert.match(markup, /农历/); assert.match(copied, /农历/); }
    else {
      for (const value of [markup, copied]) assert.doesNotMatch(value, /农历|黄帝纪年|回历|立春纪年|干支月日|下一节气/);
      if (countryCode === 'US') assert.match(copied, /圣诞节/);
      else assert.match(markup, /未覆盖/);
    }
  }
});
