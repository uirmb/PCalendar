import assert from 'node:assert/strict';
import test from 'node:test';
import * as engine from '../src/engine/engine.ts';
import * as locations from '../src/engine/locations.ts';
import { OriginalOracle, assertEquivalent, deterministicYears } from './oracle.ts';

const { JD, J2000, Lunar, SSQ, XL, oba, obb, SZJ, msc, rsGS, rsPL, ysPL } = engine;
const historicalYears = [
  -4712, -4000, -3000, -2000, -1000, -722, -721, -720, -480, -479, -478,
  -222, -221, -220, -105, -104, -103, -1, 0, 1, 7, 8, 9, 22, 23, 24,
  236, 237, 238, 239, 240, 618, 619, 620, 688, 689, 690, 700, 701, 702,
  760, 761, 762, 763, 1200, 1500, 1581, 1582, 1583, 1644, 1899, 2101, 3000, 5000, 9999,
];
const monthYears = [...new Set([
  ...historicalYears,
  ...Array.from({ length: 201 }, (_, index) => index + 1900),
  ...deterministicYears(96),
])].sort((left, right) => left - right);

function snapshotMonth(month: InstanceType<typeof Lunar>) {
  return {
    y: month.y, m: month.m, w0: month.w0, d0: month.d0, dn: month.dn,
    Ly: month.Ly, ShX: month.ShX, nianhao: month.nianhao,
    days: month.lun.slice(0, month.dn),
  };
}

test(`complete lunar day records match original for ${monthYears.length * 12} months`, () => {
  const original = new OriginalOracle();
  original.evaluate('var _calendar = new Lunar();');
  const modern = new Lunar();
  let comparedDays = 0;
  for (const year of monthYears) {
    for (let month = 1; month <= 12; month++) {
      modern.yueLiCalc(year, month);
      const expected = original.evaluate(`
        _calendar.yueLiCalc(_year, _month);
        ({y:_calendar.y,m:_calendar.m,w0:_calendar.w0,d0:_calendar.d0,dn:_calendar.dn,
          Ly:_calendar.Ly,ShX:_calendar.ShX,nianhao:_calendar.nianhao,
          days:_calendar.lun.slice(0,_calendar.dn)})
      `, { _year: year, _month: month });
      assertEquivalent(snapshotMonth(modern), expected, `month ${year}-${month}`);
      comparedDays += modern.dn;
    }
  }
  console.log(`Compared ${monthYears.length * 12} months / ${comparedDays} day records, including all calculated fields.`);
});

test('1582 reform, 2033 leap month, and spring boundaries retain original dates', () => {
  const month = new Lunar();
  month.yueLiCalc(1582, 10);
  assert.equal(month.dn, 21);
  assert.deepEqual(month.lun.slice(0, month.dn).map((day) => day.d), [1, 2, 3, 4, ...Array.from({ length: 17 }, (_, index) => index + 15)]);
  month.yueLiCalc(2033, 12);
  const leapStart = month.lun.slice(0, month.dn).find((day) => day.d === 22)!;
  assert.equal(leapStart.Lmc, '十一');
  assert.equal(leapStart.Lleap, '闰');
  assert.equal(leapStart.Ldc, '初一');
  month.yueLiCalc(2024, 2);
  assert.equal(month.lun[9]!.Ldc, '初一');
  assert.equal(month.lun[9]!.Lmc, '正');
  assert.notEqual(month.lun[4]!.Lyear2, month.lun[4]!.Lyear3);
});

test('Julian dates, inverse dates, week calculations and mixed-calendar boundaries match', () => {
  const original = new OriginalOracle();
  const years = [...historicalYears, ...deterministicYears(120), 2000, 2026, 2033];
  assert.equal(JD.JD(2000, 1, 1.5), 2451545);
  assert.equal(JD.JD(-4712, 1, 1.5), 0);
  assert.equal(JD.JD(1582, 10, 15) - JD.JD(1582, 10, 4), 1);
  for (const year of years) {
    for (const month of [1, 2, 3, 6, 10, 12]) {
      for (const day of [1, 15.5, 28.999999]) {
        const jd = JD.JD(year, month, day);
        assertEquivalent(jd, original.evaluate('JD.JD(_y,_m,_d)', { _y: year, _m: month, _d: day }), `JD ${year}-${month}-${day}`);
        assertEquivalent(JD.DD(jd), original.evaluate('JD.DD(_jd)', { _jd: jd }), 'JD.DD');
        assertEquivalent(JD.JD2str(jd), original.evaluate('JD.JD2str(_jd)', { _jd: jd }), 'JD.JD2str');
        assertEquivalent(JD.getWeek(jd), original.evaluate('JD.getWeek(_jd)', { _jd: jd }), 'JD.getWeek');
        assertEquivalent(JD.timeStr(jd), original.evaluate('JD.timeStr(_jd)', { _jd: jd }), 'JD.timeStr');
      }
    }
  }
  for (const [year, month] of [[1900, 5], [2000, 2], [2026, 10], [2033, 12]]) {
    for (let week = 1; week <= 5; week++) {
      for (let day = 0; day < 7; day++) {
        assertEquivalent(JD.nnweek(year!, month!, week, day), original.evaluate('JD.nnweek(_y,_m,_n,_w)', { _y: year, _m: month, _n: week, _w: day }), 'nth weekday');
      }
    }
  }
});

test('year reports in both modes preserve their complete original output', () => {
  const original = new OriginalOracle();
  for (const year of [...historicalYears, 1900, 2000, 2008, 2024, 2026, 2033, 2034, 2100]) {
    assertEquivalent(engine.nianLiHTML(year), original.evaluate('nianLiHTML(_y)', { _y: year }), `year precise ${year}`);
    assertEquivalent(engine.nianLi2HTML(year), original.evaluate('nianLi2HTML(_y)', { _y: year }), `year stems ${year}`);
  }
});

test('historical SSQ corrections, solar terms and lunar month ordering match', () => {
  const original = new OriginalOracle();
  for (const year of [...historicalYears, 1900, 2000, 2009, 2024, 2033, 2034, ...deterministicYears(60)]) {
    const jd = Math.floor((year - 2000) * 365.2422 + 180);
    SSQ.calcY(jd);
    const expected = original.evaluate('SSQ.calcY(_jd); ({ZQ:SSQ.ZQ, HS:SSQ.HS,dx:SSQ.dx,ym:SSQ.ym,leap:SSQ.leap})', { _jd: jd });
    assertEquivalent({ ZQ: SSQ.ZQ, HS: SSQ.HS, dx: SSQ.dx, ym: SSQ.ym, leap: SSQ.leap }, expected, `SSQ year ${year}`);
    for (const delta of [-300, -15, 0, 15, 300]) {
      for (const kind of ['气', '朔']) {
        assertEquivalent(SSQ.calc(jd + delta, kind), original.evaluate('SSQ.calc(_jd,_kind)', { _jd: jd + delta, _kind: kind }), `SSQ.calc ${year} ${kind}`);
      }
    }
  }
});

test('accurate and approximate solar / lunar roots and exact clock strings match', () => {
  const original = new OriginalOracle();
  const years = [-4000, -1000, -721, -104, 0, 619, 1582, 1644, 1900, 2000, 2026, 2033, 3000, 5000, 9999];
  for (const year of years) {
    for (let term = 0; term < 24; term++) {
      const longitude = (year - 2000 + term / 24) * Math.PI * 2;
      for (const name of ['S_aLon_t', 'S_aLon_t2'] as const) {
        assertEquivalent(XL[name](longitude), original.evaluate(`XL.${name}(_w)`, { _w: longitude }), `${name} ${year}/${term}`);
      }
      const accurate = obb.qi_accurate(longitude);
      assertEquivalent(accurate, original.evaluate('obb.qi_accurate(_w)', { _w: longitude }), 'accurate solar term');
      assertEquivalent(JD.JD2str(accurate + J2000), original.evaluate('JD.JD2str(obb.qi_accurate(_w)+J2000)', { _w: longitude }), 'solar term clock');
    }
    const lunation = Math.floor((year - 2000) * 365.2422 / 29.53058886);
    for (let phase = 0; phase < 52; phase++) {
      const longitude = (lunation + phase / 4) * Math.PI * 2;
      for (const name of ['MS_aLon_t', 'MS_aLon_t2'] as const) {
        assertEquivalent(XL[name](longitude), original.evaluate(`XL.${name}(_w)`, { _w: longitude }), `${name} ${year}/${phase}`);
      }
      assertEquivalent(obb.so_accurate(longitude), original.evaluate('obb.so_accurate(_w)', { _w: longitude }), 'accurate lunar phase');
    }
  }
});

test('Delta T, nutation, equation of time and lunar illumination match', () => {
  const original = new OriginalOracle();
  for (const year of [...historicalYears, ...deterministicYears(80), 2000, 2024, 2026]) {
    const jd = JD.JD(year, 7, 1.5) - J2000;
    const century = jd / 36525;
    assertEquivalent(engine.dt_calc(year), original.evaluate('dt_calc(_y)', { _y: year }), `Delta T ${year}`);
    assertEquivalent(engine.dt_T(jd), original.evaluate('dt_T(_jd)', { _jd: jd }), 'Delta T days');
    assertEquivalent(engine.hcjj(century), original.evaluate('hcjj(_t)', { _t: century }), 'obliquity');
    assertEquivalent(engine.nutation(century, 0), original.evaluate('nutation(_t,0)', { _t: century }), 'nutation full');
    assertEquivalent(engine.nutation2(century), original.evaluate('nutation2(_t)', { _t: century }), 'nutation approximate');
    assertEquivalent(engine.pty_zty(century), original.evaluate('pty_zty(_t)', { _t: century }), 'equation of time accurate');
    assertEquivalent(engine.pty_zty2(century), original.evaluate('pty_zty2(_t)', { _t: century }), 'equation of time approximate');
    assertEquivalent(XL.moonIll(century), original.evaluate('XL.moonIll(_t)', { _t: century }), 'moon illumination');
  }
});

const sites = [
  { name: 'Shanghai', longitude: 121.46, latitude: 31.23, timezone: -8, height: 0.005 },
  { name: 'Beijing', longitude: 116.37, latitude: 39.93, timezone: -8, height: 0.031 },
  { name: 'Sao Paulo', longitude: -46.63, latitude: -23.55, timezone: 3, height: 0.76 },
  { name: 'Greenwich', longitude: 0, latitude: 51.48, timezone: 0, height: 0 },
  { name: 'Tromso', longitude: 18.95, latitude: 69.65, timezone: -1, height: 0 },
  { name: 'Sydney', longitude: 151.21, latitude: -33.87, timezone: -10, height: 0.058 },
];

test('sun and moon rise, transit, setting and all twilight modes match', () => {
  const original = new OriginalOracle();
  for (const year of [0, 1582, 1900, 2000, 2009, 2024, 2026, 2033, 2100]) {
    for (const month of [1, 3, 6, 9, 12]) {
      const jd = Math.floor(JD.JD(year, month, 15.5) - J2000);
      for (const site of sites) {
        const longitude = site.longitude * Math.PI / 180;
        const latitude = site.latitude * Math.PI / 180;
        SZJ.calcRTS(jd, 3, longitude, latitude, site.timezone);
        const expected = original.evaluate('SZJ.calcRTS(_jd,3,_lon,_lat,_tz); SZJ.rts.slice(0,3)', { _jd: jd, _lon: longitude, _lat: latitude, _tz: site.timezone });
        assertEquivalent(SZJ.rts.slice(0, 3), expected, `rise/set ${site.name} ${year}-${month}`);
        assertEquivalent(SZJ.St(jd + site.timezone / 24), original.evaluate('SZJ.St(_jd+_tz/24)', { _jd: jd, _tz: site.timezone }), 'all twilight thresholds');
        for (const direction of [-1, 1]) {
          assertEquivalent(engine.sunShengJ(jd, longitude, latitude, direction), original.evaluate('sunShengJ(_jd,_lon,_lat,_direction)', { _jd: jd, _lon: longitude, _lat: latitude, _direction: direction }), 'fast solar rise/set');
        }
      }
    }
  }
});

test('all ten body ephemeris reports and observer coordinates match', () => {
  const original = new OriginalOracle();
  for (const year of [-1000, 0, 1582, 1900, 2000, 2008, 2026, 2033, 3000]) {
    const jd = JD.JD(year, 7, 22.3) - J2000;
    for (const site of sites.slice(0, 4)) {
      const longitude = site.longitude * Math.PI / 180;
      const latitude = site.latitude * Math.PI / 180;
      for (let body = 1; body <= 10; body++) {
        const expected = original.evaluate('xingX(_body,_jd,_lon,_lat)', { _body: body, _jd: jd, _lon: longitude, _lat: latitude });
        assertEquivalent(engine.xingX(body, jd, longitude, latitude), expected, `body ${body} ${year} ${site.name}`);
      }
      msc.calc(jd, longitude, latitude, site.height);
      const expected = original.evaluate('msc.calc(_jd,_lon,_lat,_height); msc', { _jd: jd, _lon: longitude, _lat: latitude, _height: site.height });
      assertEquivalent(msc, expected, `solar/lunar coordinates ${year} ${site.name}`);
      assertEquivalent(msc.toHTML(1), original.evaluate('msc.toHTML(1)'), 'solar/lunar full report');
    }
  }
});

test('algorithms for every one of the 45 astronomical event combinations match', () => {
  const original = new OriginalOracle();
  for (const year of [-1000, 0, 1582, 1900, 2000, 2009, 2026, 2033, 3000]) {
    const century = (JD.JD(year, 1, 1.5) - J2000) / 36525;
    for (const flag of [0, 1]) {
      assertEquivalent(XL.moonMinR(century, flag), original.evaluate('XL.moonMinR(_t,_flag)', { _t: century, _flag: flag }), 'moon apsides');
      assertEquivalent(XL.moonNode(century, flag), original.evaluate('XL.moonNode(_t,_flag)', { _t: century, _flag: flag }), 'moon nodes');
      assertEquivalent(XL.earthMinR(century, flag), original.evaluate('XL.earthMinR(_t,_flag)', { _t: century, _flag: flag }), 'earth apsides');
      for (const body of [1, 2]) {
        assertEquivalent(engine.daJu(body, century, flag), original.evaluate('daJu(_body,_t,_flag)', { _body: body, _t: century, _flag: flag }), 'greatest elongation');
      }
    }
    for (let body = 1; body <= 7; body++) {
      assertEquivalent(engine.xingHY(body, century), original.evaluate('xingHY(_body,_t)', { _body: body, _t: century }), 'planet moon conjunction');
      for (const flag of [0, 1]) {
        assertEquivalent(engine.xingHR(body, century, flag), original.evaluate('xingHR(_body,_t,_flag)', { _body: body, _t: century, _flag: flag }), 'conjunction/opposition');
        assertEquivalent(engine.xingLiu(body, century, flag), original.evaluate('xingLiu(_body,_t,_flag)', { _body: body, _t: century, _flag: flag }), 'planet station');
      }
    }
  }
});

test('editable star catalogs, constellations and three coordinate modes match', () => {
  const original = new OriginalOracle();
  assertEquivalent(engine.HXK, original.evaluate('HXK'), 'star catalogs');
  assertEquivalent(engine.xz88, original.evaluate('xz88'), 'constellation catalog');
  const catalogs = [...engine.HXK];
  for (const abbreviation of ['And', 'Ori', 'UMa', 'Sco']) {
    const catalog = engine.schHXK(abbreviation);
    assertEquivalent(catalog, original.evaluate('schHXK(_abbreviation)', { _abbreviation: abbreviation }), `star lookup ${abbreviation}`);
    catalogs.push(catalog);
  }
  for (const catalog of catalogs) {
    const stars = engine.getHXK(catalog, 0);
    assertEquivalent(stars, original.evaluate('getHXK(_catalog,0)', { _catalog: catalog }), 'star parse');
    for (const century of [-10, 0, 0.08, 0.26, 1, 10]) {
      for (const mode of [0, 1, 2]) {
        for (const shortPeriod of [0, 35]) {
          const longitude = 121.46 * Math.PI / 180;
          const latitude = 31.23 * Math.PI / 180;
          const expected = original.evaluate('hxCalc(_t,getHXK(_catalog,0),_q,_mode,_lon,_lat)', { _t: century, _catalog: catalog, _q: shortPeriod, _mode: mode, _lon: longitude, _lat: latitude });
          assertEquivalent(engine.hxCalc(century, stars, shortPeriod, mode, longitude, latitude), expected, `star mode ${mode}/${shortPeriod}`);
        }
      }
    }
  }
});

const eclipses: Array<[number, number, number]> = [
  [1999, 8, 11], [2008, 8, 1], [2009, 7, 22], [2017, 8, 21],
  [2020, 6, 21], [2024, 4, 8], [2026, 8, 12], [2027, 8, 2],
];

test('fast eclipse search, Besselian features, paths and eclipse boundary tables match', () => {
  const original = new OriginalOracle();
  for (let month = 0; month < 600; month++) {
    const jd = JD.JD(2000 + Math.floor(month / 12), month % 12 + 1, 15) - J2000;
    assertEquivalent(engine.ecFast(jd), original.evaluate('ecFast(_jd)', { _jd: jd }), `eclipse scan ${month}`);
  }
  for (const [year, month, day] of eclipses) {
    const jd = JD.JD(year, month, day) - J2000;
    for (const precision of [2, 3, 7]) {
      rsGS.init(jd, precision);
      original.evaluate('rsGS.init(_jd,_n)', { _jd: jd, _n: precision });
      assertEquivalent(rsGS.Zs, original.evaluate('rsGS.Zs'), 'Besselian interpolation table');
      assertEquivalent(rsGS.feature(jd), original.evaluate('rsGS.feature(_jd)', { _jd: jd }), 'global eclipse feature');
    }
    assertEquivalent(rsGS.jieX(jd), original.evaluate('rsGS.jieX(_jd)', { _jd: jd }), `boundary paths ${year}-${month}-${day}`);
    assertEquivalent(rsGS.jieX2(jd + 0.3), original.evaluate('rsGS.jieX2(_jd)', { _jd: jd + 0.3 }), 'instantaneous shadow');
    assertEquivalent(rsGS.jieX3(jd), original.evaluate('rsGS.jieX3(_jd)', { _jd: jd }), 'boundary table');
  }
});

test('local eclipses, NASA radius modes, contact geometry and lunar eclipses match', () => {
  const original = new OriginalOracle();
  for (const [year, month, day] of eclipses) {
    const jd = JD.JD(year, month, day) - J2000;
    for (const nasa of [0, 1]) {
      rsPL.nasa_r = nasa;
      original.evaluate('rsPL.nasa_r=_nasa', { _nasa: nasa });
      for (const site of sites) {
        const longitude = site.longitude * Math.PI / 180;
        const latitude = site.latitude * Math.PI / 180;
        rsPL.secMax(jd, longitude, latitude, site.height);
        const expected = original.evaluate('rsPL.secMax(_jd,_lon,_lat,_height); rsPL', { _jd: jd, _lon: longitude, _lat: latitude, _height: site.height });
        assertEquivalent(rsPL, expected, `local eclipse ${year} ${site.name} NASA=${nasa}`);
      }
      rsPL.nbj(jd + 0.3);
      assertEquivalent(rsPL, original.evaluate('rsPL.nbj(_jd); rsPL', { _jd: jd + 0.3 }), 'north/south eclipse boundaries');
    }
  }
  for (const [year, month, day] of [[2000, 1, 21], [2008, 2, 21], [2018, 7, 27], [2021, 5, 26], [2022, 11, 8], [2025, 3, 14], [2026, 3, 3]]) {
    const jd = JD.JD(year!, month!, day!) - J2000;
    ysPL.lecMax(jd);
    assertEquivalent(ysPL, original.evaluate('ysPL.lecMax(_jd); ysPL', { _jd: jd }), `lunar eclipse ${year}-${month}-${day}`);
  }
});

test('traditional four pillars and Islamic calendar retain original output', () => {
  const original = new OriginalOracle();
  for (const year of [...historicalYears, 1984, 2000, 2024, 2026, 2033]) {
    for (const month of [1, 2, 6, 12]) {
      for (const hour of [0, 12, 22.9, 23.1]) {
        const jd = JD.JD(year, month, 4 + hour / 24) - J2000;
        const result: Record<string, unknown> = {};
        const longitude = 121.46 * Math.PI / 180;
        obb.mingLiBaZi(jd, longitude, result);
        const expected = original.evaluate('var _bazi={}; obb.mingLiBaZi(_jd,_lon,_bazi); _bazi', { _jd: jd, _lon: longitude });
        assertEquivalent(result, expected, `four pillars ${year}-${month} ${hour}`);
        const islamic: Record<string, unknown> = {};
        oba.getHuiLi(jd, islamic);
        assertEquivalent(islamic, original.evaluate('var _islamic={}; oba.getHuiLi(_jd,_islamic); _islamic', { _jd: jd }), 'Islamic date');
      }
    }
  }
});

test('complete city and original timezone databases and city coordinate decoding match', () => {
  const original = new OriginalOracle();
  assertEquivalent(locations.JWv, original.evaluate('JWv'), 'all cities');
  assertEquivalent(locations.SQv, original.evaluate('SQv'), 'all timezone records');
  let decoded = 0;
  for (const province of locations.JWv) {
    for (const city of province.slice(1)) {
      assertEquivalent(new locations.JWdecode(city), original.evaluate('new JWdecode(_code)', { _code: city }), `coordinate ${city}`);
      decoded++;
    }
  }
  console.log(`Compared ${decoded} city coordinate records.`);
});

test('engine imports do not mutate the native Number.toFixed or Date prototype', () => {
  assert.equal((1.005).toFixed(2), '1.00');
  assert.ok(!('toLocaleString2' in Date.prototype));
});
