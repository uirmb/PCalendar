import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCities, getCity, getCountries, getCountry, getDefaultCity, getLegacyRegion,
  getRegions, resolveWeekStart, uses12HourClock,
} from '../src/lib/regions.ts';
import { isTimezoneSupported } from '../src/lib/time.ts';

test('country and city records have unique identities, valid coordinates and offline IANA identifiers', () => {
  const countries = getCountries(), codes = countries.map((country) => country.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(countries.length > 200, 'global selection should not silently collapse to CN and US');
  const ids = new Set<string>();
  for (const country of countries) {
    const cities = getCities(country.code);
    if (country.code === 'ZZ') { assert.equal(cities.length, 0); continue; }
    assert.ok(cities.length > 0, `${country.code} has a selectable location`);
    assert.equal(getDefaultCity(country.code)?.countryCode, country.code);
    for (const city of cities) {
      assert.ok(!ids.has(city.id), `duplicate city ${city.id}`); ids.add(city.id);
      assert.equal(city.countryCode, country.code);
      assert.deepEqual(getCity(city.id), city);
      assert.ok(Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180);
      assert.ok(Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90);
    }
  }
  for (const timezone of new Set(getRegions().map((city) => city.timezoneId))) assert.equal(isTimezoneSupported(timezone), true, timezone);
  assert.equal(getCity('not-a-city'), undefined);
  assert.equal(getCountry('not-a-country'), undefined);
});

test('CN and US presets synchronize location coordinates with the correct timezone identity', () => {
  const china = getDefaultCity('CN')!, usa = getDefaultCity('US')!;
  assert.equal(china.name, '天安门');
  assert.equal(china.timezoneId, 'Asia/Shanghai');
  assert.equal(china.longitude, 116.38333333333334);
  assert.equal(china.latitude, 39.9);
  assert.equal(usa.name, '纽约');
  assert.equal(usa.timezoneId, 'America/New_York');
  assert.equal(usa.latitude, 40 + 42 / 60 + 51 / 3600);
  assert.equal(usa.longitude, -(74 + 23 / 3600));
  assert.equal(getLegacyRegion('美国东部')?.id, usa.id);
  assert.equal(getLegacyRegion('中国')?.id, china.id);
  assert.equal(getLegacyRegion('英国')?.timezoneId, 'Europe/London');
  assert.equal(getLegacyRegion('不存在的地区'), undefined);
});

test('regional week and clock defaults can be explicitly overridden without changing the country', () => {
  const usa = { countryCode: 'US', weekStart: 3 as const, weekStartMode: 'auto' as const, clockFormat: 'auto' as const };
  const china = { ...usa, countryCode: 'CN' };
  assert.equal(resolveWeekStart(usa), 0);
  assert.equal(resolveWeekStart(china), 1);
  assert.equal(uses12HourClock(usa), true);
  assert.equal(uses12HourClock(china), false);
  assert.equal(resolveWeekStart({ ...usa, weekStartMode: 'custom' }), 3);
  assert.equal(uses12HourClock({ ...usa, clockFormat: '24' }), false);
  assert.equal(uses12HourClock({ ...china, clockFormat: '12' }), true);
  assert.equal(getCountry('US')!.holidayCoverage, 'us');
  assert.equal(getCountry('CN')!.holidayCoverage, 'china');
  assert.equal(getCountry('GB')!.holidayCoverage, 'none');
});
