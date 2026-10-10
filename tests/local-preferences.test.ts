import assert from 'node:assert/strict';
import test from 'node:test';
import { formatClock, formatDate } from '../src/lib/format.ts';
import { defaultSettings, loadSettings, saveSettings } from '../src/lib/state.ts';
import { getCity } from '../src/lib/regions.ts';

const key = 'sxwnl-modern.settings.v1';
function withStorage(run: (storage: Pick<Storage, 'setItem' | 'getItem'>) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { run(storage); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('clock preferences preserve noon, midnight, missing events and multiple moon events', () => {
  const usa = defaultSettings('US'), china = defaultSettings('CN');
  assert.equal(formatClock(usa, '00:05:09'), '上午 12:05:09');
  assert.equal(formatClock(usa, '12:05:09'), '下午 12:05:09');
  assert.equal(formatClock(usa, '23:30:10（次日）', false), '下午 11:30（次日）');
  assert.equal(formatClock(usa, '--:--:--'), '--:--:--');
  assert.equal(formatClock(usa, '01:30:00 / 23:30:00'), '上午 01:30:00 / 下午 11:30:00');
  assert.equal(formatClock(china, '19:15:20'), '19:15:20');
  assert.equal(formatClock({ ...usa, clockFormat: '24' }, '19:15:20', false), '19:15');
  assert.equal(formatClock(usa, '25:10:00'), '25:10:00');
});

test('numeric date style is independent of country content and supports explicit overrides', () => {
  const usa = defaultSettings('US');
  assert.equal(formatDate(usa, 2026, 11, 3), '11/03/2026');
  assert.equal(formatDate(defaultSettings('CN'), 2026, 11, 3), '2026.11.03');
  assert.equal(formatDate({ ...usa, dateFormat: 'ymd' }, 2026, 11, 3), '2026.11.03');
  assert.equal(formatDate({ ...usa, dateFormat: 'dmy' }, 2026, 11, 3), '03/11/2026');
});

test('v1.2 New York preferences migrate to an explicit city jurisdiction and safe local-calendar defaults', () => {
  withStorage((storage) => {
    const old = { ...defaultSettings('US') } as Record<string, unknown>;
    for (const name of ['dateFormat', 'showZodiac', 'subdivisionCode', 'municipalityCode', 'calendarLayers']) delete old[name];
    storage.setItem(key, JSON.stringify(old));
    const settings = loadSettings();
    assert.equal(settings.subdivisionCode, 'US-NY');
    assert.equal(settings.municipalityCode, 'US-NYC');
    assert.equal(settings.clockFormat, 'auto');
    assert.equal(settings.calendarLayers.nycCivic, true);
    assert.equal(settings.calendarLayers.nycSchools, false);
    assert.equal(settings.calendarLayers.nycParking, false);
  });
});

test('a New York timezone override cannot give another selected city the NYC jurisdiction', () => {
  withStorage((storage) => {
    const la = getCity('iana:US:America/Los_Angeles')!;
    storage.setItem(key, JSON.stringify({ ...defaultSettings('US'), cityId: la.id, city: la.name, longitude: la.longitude, latitude: la.latitude, timezoneId: 'America/New_York' }));
    const settings = loadSettings();
    assert.equal(settings.cityId, la.id);
    assert.equal(settings.timezoneId, 'America/New_York');
    assert.equal(settings.subdivisionCode, '');
    assert.equal(settings.municipalityCode, '');
  });
});

test('calendar choices survive storage and region changes without accepting malformed preference values', () => {
  withStorage((storage) => {
    const settings = defaultSettings('US');
    settings.calendarLayers.nycSchools = true;
    settings.calendarLayers.nycParking = true;
    settings.dateFormat = 'ymd'; settings.clockFormat = '24'; settings.showZodiac = false;
    saveSettings(settings);
    assert.deepEqual(loadSettings(), settings);
    const china = { ...defaultSettings('CN'), calendarLayers: settings.calendarLayers, dateFormat: settings.dateFormat, clockFormat: settings.clockFormat, showZodiac: settings.showZodiac };
    saveSettings(china);
    assert.deepEqual(loadSettings().calendarLayers, settings.calendarLayers);
    assert.equal(loadSettings().municipalityCode, '');
    storage.setItem(key, JSON.stringify({ ...settings, calendarLayers: { nycSchools: 'yes', nycParking: false }, dateFormat: 'bogus', showZodiac: null }));
    const recovered = loadSettings();
    assert.equal(recovered.calendarLayers.nycSchools, false);
    assert.equal(recovered.calendarLayers.usCultural, true);
    assert.equal(recovered.dateFormat, 'auto');
    assert.equal(recovered.showZodiac, true);
  });
});
