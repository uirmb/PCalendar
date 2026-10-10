import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateAtOffset, dateTimeAt, formatUTCOffset, localToUT, localToUTByOffset, offsetAtUT,
  type TimezoneSettings,
} from '../src/lib/time.ts';
import { defaultSettings, initialState, loadSettings, saveSettings } from '../src/lib/state.ts';
import { getDefaultCity } from '../src/lib/regions.ts';
import { OriginalOracle } from './oracle.ts';

const storageKey = 'sxwnl-modern.settings.v1';
const ut = (iso: string): number => Date.parse(iso) / 86400000 - 10957.5;
const fixed = (timezone: number): TimezoneSettings => ({ timezone, timezoneMode: 'fixed', timezoneRegion: '中国' });
const timezoneIds: Record<string, string> = {
  中国: 'Asia/Shanghai', 英国: 'Europe/London', 美国东部: 'America/New_York',
  澳大利亚东部: 'Australia/Sydney', 澳大利亚中部: 'Australia/Adelaide',
  新西兰查塔姆群岛: 'Pacific/Chatham', 尼泊尔: 'Asia/Kathmandu',
};
const region = (timezoneRegion: string, timezone: number): TimezoneSettings => ({ timezone, timezoneMode: 'region', timezoneRegion, timezoneId: timezoneIds[timezoneRegion] });

function nearInstant(actual: number, expected: number, label: string): void {
  // 新的本地时/UT反算使用日数；只容许双精度加减的亚毫秒误差，不用于原天文算法对照。
  assert.ok(Math.abs(actual - expected) * 86400 < 0.0001, `${label}: ${actual} vs ${expected}`);
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

function withStorage(run: (storage: MemoryStorage) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { run(storage); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('fixed offsets handle both sides of midnight, year boundaries and fractional hours', () => {
  const timestamp = Date.parse('2026-01-01T01:15:30Z');
  const cases = [
    [-12, 2025, 12, 31, 13, 15, 30], [-3.5, 2025, 12, 31, 21, 45, 30],
    [0, 2026, 1, 1, 1, 15, 30], [5.75, 2026, 1, 1, 7, 0, 30],
    [8, 2026, 1, 1, 9, 15, 30], [12.75, 2026, 1, 1, 14, 0, 30],
    [14, 2026, 1, 1, 15, 15, 30],
  ];
  for (const [offset, year, month, day, hour, minute, second] of cases) {
    assert.deepEqual(dateTimeAt(fixed(offset!), timestamp), { year, month, day, hour, minute, second, offset });
    assert.deepEqual(dateAtOffset(offset!, timestamp), { year, month, day });
    assert.equal(offsetAtUT(fixed(offset!), ut('2026-07-01T00:00:00Z')), offset);
  }
  assert.deepEqual(dateAtOffset(14, Date.parse('2025-12-31T12:00:00Z')), { year: 2026, month: 1, day: 1 });
});

test('fixed mode ignores a selected DST region and roundtrips exact local calendar instants', () => {
  const settings = { ...region('英国', 5.75), timezoneMode: 'fixed' as const };
  for (const instant of ['1900-01-01T02:30:00Z', '2026-03-29T01:00:00Z', '2026-07-01T12:45:00Z', '2033-12-31T23:59:00Z']) {
    const universal = ut(instant);
    assert.equal(offsetAtUT(settings, universal), 5.75);
    nearInstant(localToUT(settings, universal + 5.75 / 24), universal, instant);
    nearInstant(localToUTByOffset(universal + 5.75 / 24, () => 5.75), universal, `${instant} callback`);
  }
});

test('IANA northern-hemisphere DST uses exact modern transition instants', () => {
  for (const [settings, start, end, winter, summer] of [
    [region('英国', 0), '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z', 0, 1],
    [region('美国东部', -5), '2026-03-08T07:00:00Z', '2026-11-01T06:00:00Z', -5, -4],
  ] as const) {
    assert.equal(offsetAtUT(settings, ut(start) - 1 / 86400), winter);
    assert.equal(offsetAtUT(settings, ut(start)), summer);
    assert.equal(offsetAtUT(settings, ut(end) - 1 / 86400), summer);
    assert.equal(offsetAtUT(settings, ut(end)), winter);
    assert.equal(dateTimeAt(settings, Date.parse(start)).offset, summer, `${settings.timezoneRegion} clock transition start`);
    assert.equal(dateTimeAt(settings, Date.parse(end)).offset, winter, `${settings.timezoneRegion} clock transition end`);
  }
  assert.equal(offsetAtUT(region('美国东部', -5), ut('2026-03-20T12:00:00Z')), -4);
});

test('IANA southern-hemisphere DST spans New Year and retains fractional offsets', () => {
  const settings = region('澳大利亚东部', 10);
  for (const [instant, expected] of [
    ['2025-10-04T15:59:59Z', 10], ['2025-10-04T16:00:00Z', 11],
    ['2025-12-31T23:59:59Z', 11], ['2026-01-01T00:00:00Z', 11],
    ['2026-04-04T15:59:59Z', 11], ['2026-04-04T16:00:00Z', 10],
    ['2026-07-01T00:00:00Z', 10], ['2026-10-03T16:00:00Z', 11],
  ] as const) {
    assert.equal(offsetAtUT(settings, ut(instant)), expected, instant);
    assert.equal(dateTimeAt(settings, Date.parse(instant)).offset, expected, `${instant} clock`);
  }
  assert.equal(offsetAtUT(region('澳大利亚中部', 9.5), ut('2026-01-01T00:00:00Z')), 10.5);
  assert.equal(offsetAtUT(region('新西兰查塔姆群岛', 12.75), ut('2026-01-01T00:00:00Z')), 13.75);
});

test('ambiguous local hours choose the earlier instant and missing hours move forward', () => {
  const cases = [
    [region('英国', 0), '2026-10-25T01:30:00Z', '2026-10-25T00:30:00Z'],
    [region('英国', 0), '2026-03-29T01:30:00Z', '2026-03-29T01:30:00Z'],
    [region('美国东部', -5), '2026-11-01T01:30:00Z', '2026-11-01T05:30:00Z'],
    [region('美国东部', -5), '2026-03-08T02:30:00Z', '2026-03-08T07:30:00Z'],
    [region('澳大利亚东部', 10), '2026-04-05T02:30:00Z', '2026-04-04T15:30:00Z'],
    [region('澳大利亚东部', 10), '2026-10-04T02:30:00Z', '2026-10-03T16:30:00Z'],
  ] as const;
  for (const [settings, wallClock, universal] of cases) {
    nearInstant(localToUT(settings, ut(wallClock)), ut(universal), `${settings.timezoneRegion} ${wallClock}`);
    nearInstant(localToUTByOffset(ut(wallClock), (time) => offsetAtUT(settings, time)), ut(universal), 'callback conversion');
  }
});

test('regional clocks show the effective offset, including DST and fractional regions', () => {
  assert.deepEqual(dateTimeAt(region('英国', 0), Date.parse('2026-03-29T01:30:15Z')), {
    year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 15, offset: 1,
  });
  assert.deepEqual(dateTimeAt(region('澳大利亚东部', 10), Date.parse('2025-12-31T14:30:00Z')), {
    year: 2026, month: 1, day: 1, hour: 1, minute: 30, second: 0, offset: 11,
  });
  assert.deepEqual(dateTimeAt(region('尼泊尔', 5.75), Date.parse('2026-01-01T00:30:00Z')), {
    year: 2026, month: 1, day: 1, hour: 6, minute: 15, second: 0, offset: 5.75,
  });
});

test('local dates retain the original mixed calendar across 1582 reform and BCE years', () => {
  const original = new OriginalOracle();
  for (const [year, month, day, hour, offset] of [
    [1582, 10, 4, 23.5, 1], [1582, 10, 15, 0.5, -1],
    [0, 1, 1, 0.5, -1], [-211, 12, 31, 23.5, 2], [2033, 12, 22, 0, 8],
  ]) {
    const universal = original.evaluate<number>('JD.JD(_y,_m,_d+_h/24)-J2000', { _y: year, _m: month, _d: day, _h: hour });
    const expected = original.evaluate<{ Y: number; M: number; D: number }>('JD.DD(_ut+_offset/24+J2000)', { _ut: universal, _offset: offset });
    const timestamp = (universal + 10957.5) * 86400000;
    assert.deepEqual(dateAtOffset(offset!, timestamp), { year: expected.Y, month: expected.M, day: expected.D });
    nearInstant(localToUT(fixed(offset!), universal + offset! / 24), universal, `${year} local/UT`);
  }
});

test('UTC labels preserve signs and minute precision for integral and fractional offsets', () => {
  for (const [offset, expected] of [[0, 'UTC+00:00'], [8, 'UTC+08:00'], [-3.5, 'UTC−03:30'], [5.75, 'UTC+05:45'], [12.75, 'UTC+12:45'], [-12, 'UTC−12:00'], [14, 'UTC+14:00']] as const) {
    assert.equal(formatUTCOffset(offset), expected);
  }
});

test('new settings default to synchronized China coordinates and IANA time independently of the host', () => {
  withStorage(() => {
    const defaults = defaultSettings();
    assert.equal(defaults.countryCode, 'CN');
    assert.equal(defaults.city, '天安门');
    assert.equal(defaults.timezone, 8);
    assert.equal(defaults.timezoneId, 'Asia/Shanghai');
    assert.equal(defaults.longitude, getDefaultCity('CN')!.longitude);
    assert.equal(defaults.latitude, getDefaultCity('CN')!.latitude);
    assert.equal(defaults.weekStartMode, 'auto');
    assert.equal(defaults.clockFormat, 'auto');
    assert.deepEqual(loadSettings(), defaults);
  });
});

test('v1 migration preserves the previous computation offset and does not adopt the unrelated old world clock', () => {
  withStorage((storage) => {
    storage.setItem(storageKey, JSON.stringify({ theme: 'dark', province: '北京市', city: '旧观测点', longitude: -46.63, latitude: -23.55, timezone: -3, weekStart: 1, worldCountry: '英国' }));
    const migrated = loadSettings();
    assert.equal(migrated.timezoneMode, 'fixed');
    assert.equal(migrated.timezone, -3);
    assert.equal(migrated.city, '旧观测点');
    assert.equal(migrated.longitude, -46.63);
    assert.equal(migrated.latitude, -23.55);
    assert.equal(migrated.theme, 'dark');
    assert.equal(migrated.weekStart, 1);
    assert.equal(offsetAtUT(migrated, ut('2026-07-01T00:00:00Z')), -3);
  });
});

test('unified region settings persist and malformed storage safely uses bounded defaults', () => {
  withStorage((storage) => {
    const selected = { ...defaultSettings('AU'), timezoneId: 'Australia/Adelaide', timezone: 9.5, locationMode: 'custom' as const, city: '自定义观测点' };
    saveSettings(selected);
    assert.deepEqual(loadSettings(), { ...selected, timezone: 10.5 });
    assert.equal(offsetAtUT(loadSettings(), ut('2026-01-01T00:00:00Z')), 10.5);
    storage.setItem(storageKey, '{invalid json');
    assert.deepEqual(loadSettings(), defaultSettings());
    storage.setItem(storageKey, JSON.stringify({ timezone: 99, longitude: 999, latitude: -95, theme: 'unsupported' }));
    const recovered = loadSettings(), defaults = defaultSettings();
    assert.ok(Number.isFinite(recovered.timezone) && recovered.timezone >= -12 && recovered.timezone <= 14);
    assert.ok(Number.isFinite(recovered.longitude) && Math.abs(recovered.longitude) <= 180);
    assert.ok(Number.isFinite(recovered.latitude) && Math.abs(recovered.latitude) < 90);
    assert.equal(recovered.theme, defaults.theme);
  });
});

test('initial date follows the unified clock across a year boundary and storage can be unavailable', () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-01-01T01:15:00Z');
  try {
    withStorage((storage) => {
      storage.setItem(storageKey, JSON.stringify({ ...defaultSettings(), ...fixed(-12) }));
      const state = initialState();
      assert.deepEqual({ year: state.year, month: state.month, day: state.selectedDay }, { year: 2025, month: 12, day: 31 });
      assert.equal(state.followToday, true);
    });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
    try {
      assert.deepEqual(loadSettings(), defaultSettings());
      assert.doesNotThrow(() => saveSettings(defaultSettings()));
      const state = initialState();
      assert.deepEqual({ year: state.year, month: state.month, day: state.selectedDay }, { year: 2026, month: 1, day: 1 });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  } finally { Date.now = originalNow; }
});


test('v1.1 America Eastern with the former Beijing preset migrates to New York consistently', () => {
  withStorage((storage) => {
    storage.setItem(storageKey, JSON.stringify({ theme: 'dark', province: '北京市', city: '天安门', longitude: 116.38333333333334, latitude: 39.9, timezoneMode: 'region', timezoneRegion: '美国东部', timezone: -5, weekStart: 0 }));
    const migrated = loadSettings(), city = getDefaultCity('US')!;
    assert.equal(migrated.countryCode, 'US');
    assert.equal(migrated.locationMode, 'city');
    assert.equal(migrated.cityId, city.id);
    assert.equal(migrated.city, '纽约');
    assert.equal(migrated.longitude, city.longitude);
    assert.equal(migrated.latitude, city.latitude);
    assert.equal(migrated.timezoneId, 'America/New_York');
    assert.equal(offsetAtUT(migrated, ut('2026-03-20T12:00:00Z')), -4);
    assert.equal(migrated.theme, 'dark');
    saveSettings(migrated);
    assert.deepEqual(loadSettings(), migrated);
  });
});

test('migration preserves custom observation coordinates and never infers a country from a fixed offset', () => {
  withStorage((storage) => {
    const old = { city: '山顶台站', province: '', longitude: 86.925, latitude: 27.9881, timezoneMode: 'region', timezoneRegion: '美国东部', timezone: -5 };
    storage.setItem(storageKey, JSON.stringify(old));
    const custom = loadSettings();
    assert.equal(custom.countryCode, 'US');
    assert.equal(custom.locationMode, 'custom');
    assert.equal(custom.city, old.city);
    assert.equal(custom.longitude, old.longitude);
    assert.equal(custom.latitude, old.latitude);
    assert.equal(custom.timezoneId, 'America/New_York');
    for (const offset of [-5, 8, 9]) {
      storage.setItem(storageKey, JSON.stringify({ ...old, timezoneMode: 'fixed', timezone: offset, worldCountry: '英国' }));
      const fixed = loadSettings();
      assert.equal(fixed.countryCode, 'ZZ');
      assert.equal(fixed.timezoneMode, 'fixed');
      assert.equal(fixed.timezone, offset);
      assert.equal(fixed.longitude, old.longitude);
      assert.equal(fixed.latitude, old.latitude);
    }
  });
});
