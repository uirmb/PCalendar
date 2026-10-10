import assert from 'node:assert/strict';
import test from 'node:test';
import { FeatureTime } from '../src/features/time.ts';
import { localizedYearReport } from '../src/features/year-report.ts';
import { getSunMoon } from '../src/engine/facade.ts';
import { offsetAtUT } from '../src/lib/time.ts';
import type { FeatureContext } from '../src/features/types.ts';
import { OriginalOracle, assertEquivalent } from './oracle.ts';

const context = (timezone: number): FeatureContext => ({ year: 2026, month: 1, day: 1, longitude: 0, latitude: 51.5, timezone });
const ut = (iso: string): number => Date.parse(iso) / 86400000 - 10957.5;

test('professional local-time formatting converts original UT/TD without changing astronomical instants', () => {
  const original = new OriginalOracle();
  for (const offset of [-12, -3.5, 0, 5.75, 8, 14]) {
    const time = new FeatureTime(context(offset));
    for (const jd of [-1000000.75, -152384.5, 0, 9429.208333333334, 9775.123456, 365250]) {
      const expectedTD = original.evaluate<string>('JD.JD2str(_jd+J2000+_offset/24-dt_T(_jd))', { _jd: jd, _offset: offset });
      const expectedUT = original.evaluate<string>('JD.JD2str(_jd+_offset/24+J2000)', { _jd: jd, _offset: offset });
      assert.equal(time.formatTD(jd), expectedTD);
      assert.equal(time.formatUT(jd), expectedUT);
      assert.equal(time.localToTD(jd), original.evaluate('(_jd-_offset/24)+dt_T(_jd)', { _jd: jd, _offset: offset }));
      assert.equal(time.beijingToLocal(jd), jd + (offset - 8) / 24);
    }
  }
  const selected = context(0);
  selected.timezoneAt = (value) => value >= ut('2026-03-29T01:00:00Z') && value < ut('2026-10-25T01:00:00Z') ? 1 : 0;
  const time = new FeatureTime(selected);
  assert.match(time.formatUT(ut('2026-03-29T00:59:59Z')), /2026-03-29 00:59:59$/);
  assert.match(time.formatUT(ut('2026-03-29T01:00:00Z')), /2026-03-29 02:00:00$/);
});

test('localized year reports retain original lunar-month allocation and exact source events in both modes', () => {
  const original = new OriginalOracle();
  for (const year of [-4712, -721, 0, 1582, 2026, 2033, 2034]) {
    const reference = original.evaluate<{ months: Array<{ name: string; leap: string; days: string; day: string }>; events: number[]; calendarTexts: string[] }>(`
      SSQ.calcY(Math.floor((_year-2000)*365.2422+180));
      var _months=[],_events=[],_calendarTexts=[];
      var _gz=function(d){var a=d+J2000;return obb.Gan[((a+9)%10+10)%10]+obb.Zhi[((a+1)%12+12)%12];};
      for(var i=0;i<14;i++){
        if(SSQ.HS[i+1]>SSQ.ZQ[24])break;
        var a=SSQ.HS[i],b=SSQ.HS[i+1];
        _months.push({name:SSQ.ym[i],leap:SSQ.leap&&i==SSQ.leap?'1':'0',days:String(SSQ.dx[i]),day:String(a)});
        _events.push(obb.so_accurate2(a)-8/24);
        _calendarTexts.push((JD.JD2str(a+J2000).slice(0,11)+' '+_gz(a)).trim());
        for(var j=-2;j<24;j++){var q=j==-2?SSQ.ZQ.pe2:j==-1?SSQ.ZQ.pe1:SSQ.ZQ[j];if(q>=a&&q<b){_events.push(obb.qi_accurate2(q)-8/24);_calendarTexts.push((JD.JD2str(q+J2000).slice(0,11)+' '+obb.rmc[q-a]+' '+_gz(q)).trim());}}
      }
      ({months:_months,events:_events,calendarTexts:_calendarTexts})
    `, { _year: year });
    for (const showTime of [false, true]) {
      for (const offset of [8, -12, 5.75]) {
        const report = localizedYearReport(year, showTime, new FeatureTime(context(offset)));
        const months = [...report.matchAll(/<section\b([^>]+)>/g)].map((match) => {
          const value = (name: string): string => match[1]!.match(new RegExp(`${name}="([^"]*)"`))![1]!;
          return { name: value('data-lunar-month'), leap: value('data-leap'), days: value('data-days'), day: value('data-calendar-day') };
        });
        assertEquivalent(months, reference.months, `lunar year ${year} mode ${showTime} UTC${offset}`);
        if (!showTime) {
          const actualDates = [...report.matchAll(/<tr><th>[^<]+<\/th><td>([^<]+)<\/td>/g)].map((match) => match[1]!.trim());
          assert.deepEqual(actualDates, Array.from(reference.calendarTexts), `Chinese date and ganzhi ${year} UTC${offset}`);
        }
        const events = [...report.matchAll(/<span class="feature-local-event[^"]*" data-ut="([^"]+)">([\s\S]*?) <small>/g)];
        assert.deepEqual(events.map((match) => Number(match[1])), Array.from(reference.events));
        for (let index = 0; index < events.length; index++) {
          const expected = original.evaluate<string>('JD.JD2str(_ut+8/24+(_offset-8)/24+J2000)', { _ut: reference.events[index], _offset: offset });
          assert.equal(events[index]![2]!.trim(), (showTime ? expected : expected.slice(0, 11)).trim());
        }
        assert.equal(report.includes('undefined'), false);
      }
    }
  }
});

test('sun and moon summaries preserve constant-zone results and assign DST-day events by their own instants', () => {
  const original = new OriginalOracle();
  for (const [year, month, day] of [[-211, 1, 1], [1582, 10, 4], [2026, 1, 1]]) {
    const fullJD = original.evaluate<number>('JD.JD(_y,_m,_d+0.5)', { _y: year, _m: month, _d: day });
    assert.deepEqual(getSunMoon(fullJD, 116.3833, 39.9, 8, () => 8), getSunMoon(fullJD, 116.3833, 39.9, 8));
  }
  const zone = { timezoneMode: 'region' as const, timezoneRegion: '英国', timezoneId: 'Europe/London', timezone: 0 };
  const offset = (value: number): number => offsetAtUT(zone, value);
  for (const [year, month, day, noonOffset] of [[2021, 10, 31, 0], [2023, 3, 26, 1]]) {
    const jd = original.evaluate<number>('JD.JD(_y,_m,_d+0.5)', { _y: year, _m: month, _d: day });
    const actual = getSunMoon(jd, 0, 51.5, noonOffset, offset);
    const baseline = original.evaluate<{ moonrise: string; moonset: string; daylight: string; lightDuration: string }>(`
      SZJ.calcRTS(_jd-J2000,1,0,51.5*Math.PI/180,-_offset);
      ({moonrise:SZJ.rts[0].Ms,moonset:SZJ.rts[0].Mj,daylight:SZJ.rts[0].sj,lightDuration:SZJ.rts[0].ch})
    `, { _jd: jd, _offset: noonOffset });
    assert.equal(actual.daylight, baseline.daylight, 'duration must not gain or lose an hour');
    assert.equal(actual.lightDuration, baseline.lightDuration);
    if (year === 2021) {
      assert.equal(baseline.moonrise, '00:33:03');
      assert.equal(actual.moonrise, '01:33:03', 'moonrise occurs before the offset drops from +1 to 0');
    } else {
      assert.equal(baseline.moonset, '00:36:23');
      assert.equal(actual.moonset, '--:--:--', 'the old fixed-offset candidate belongs to the previous local day');
    }
  }
});
