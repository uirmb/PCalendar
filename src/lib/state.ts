import { dateTimeAt, isTimezoneSupported, offsetAtUT } from './time';
import type { TimezoneSettings } from './time';
import { getCities, getCity, getCountry, getDefaultCity, getLegacyRegion, resolveWeekStart } from './regions';
import type { RegionCity, Weekday } from './regions';
import { DEFAULT_CALENDAR_LAYERS } from './local-calendars';
import type { CalendarLayerPreferences } from './local-calendars';
import { SUPPORTED_LOCALES, type AppLocale } from './i18n';

export { dateAtOffset } from './time';

export interface AppSettings extends TimezoneSettings {
  locale: AppLocale;
  theme: 'light' | 'dark' | 'system';
  countryCode: string;
  cityId: string;
  timezoneId: string;
  locationMode: 'city' | 'custom';
  province: string;
  city: string;
  longitude: number;
  latitude: number;
  weekStart: Weekday;
  weekStartMode: 'auto' | 'custom';
  clockFormat: 'auto' | '24' | '12';
  dateFormat: 'auto' | 'ymd' | 'mdy' | 'dmy';
  showZodiac: boolean;
  subdivisionCode: string;
  municipalityCode: string;
  calendarLayers: CalendarLayerPreferences;
}

export interface AppState {
  year: number;
  month: number;
  selectedDay: number;
  page: number;
  followToday: boolean;
  settings: AppSettings;
}

const KEY = 'sxwnl-modern.settings.v1';
const chinaCities = getCities('CN');
const legacyChina = getDefaultCity('CN')!;

function snapshotOffset(timezoneId: string): number {
  // 我只把代表日期的偏移保存在兼容字段；地区计算始终以 IANA 规则为准。
  return offsetAtUT({ timezone: 0, timezoneMode: 'region', timezoneRegion: '', timezoneId }, Date.UTC(2026, 0, 15, 12) / 86400000 - 10957.5);
}

export function defaultSettings(countryCode = 'CN'): AppSettings {
  const country = getCountry(countryCode) ?? getCountry('CN')!;
  const city = getDefaultCity(country.code);
  const timezoneId = city?.timezoneId ?? 'Etc/UTC';
  return {
    locale: 'zh-CN', theme: 'light', countryCode: country.code, cityId: city?.id ?? '', timezoneId,
    locationMode: city ? 'city' : 'custom',
    province: city?.province ?? '', city: city?.name ?? '自定义地点',
    longitude: city?.longitude ?? 0, latitude: city?.latitude ?? 0,
    timezone: snapshotOffset(timezoneId), timezoneMode: 'region', timezoneRegion: country.name,
    weekStart: country.weekStart, weekStartMode: 'auto', clockFormat: 'auto',
    dateFormat: 'auto', showZodiac: true,
    subdivisionCode: city?.subdivisionCode ?? '', municipalityCode: city?.municipalityCode ?? '',
    calendarLayers: { ...DEFAULT_CALENDAR_LAYERS },
  };
}

function finiteWithin(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function calendarPreferences(value: unknown): CalendarLayerPreferences {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_CALENDAR_LAYERS };
  for (const key of Object.keys(result) as (keyof CalendarLayerPreferences)[]) {
    if (typeof saved[key] === 'boolean') result[key] = saved[key];
  }
  return result;
}

/** 我根据原地点身份迁移国家，绝不以固定 UTC 偏移或旧独立世界时钟推断国家。 */
export function loadSettings(): AppSettings {
  const defaults = defaultSettings();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    const value = saved as Record<string, unknown>;
    const savedCountry = typeof value.countryCode === 'string' ? getCountry(value.countryCode) : undefined;
    const savedCity = typeof value.cityId === 'string' ? getCity(value.cityId) : undefined;
    const longitude = finiteWithin(value.longitude, -180, 180) ? value.longitude : undefined;
    const latitude = finiteWithin(value.latitude, -89.999999999, 89.999999999) ? value.latitude : undefined;
    const hasLocation = ['city', 'province', 'longitude', 'latitude'].some((key) => key in value);
    const knownChinaCity = !hasLocation ? legacyChina : chinaCities.find((city) =>
      city.name === value.city && (!value.province || city.province === value.province)
      && (longitude === undefined || Math.abs(city.longitude - longitude) < 0.00001)
      && (latitude === undefined || Math.abs(city.latitude - latitude) < 0.00001));
    const oldRegion = value.timezoneMode === 'region' && typeof value.timezoneRegion === 'string' ? getLegacyRegion(value.timezoneRegion) : undefined;
    const countryCode = savedCountry?.code ?? oldRegion?.countryCode ?? (knownChinaCity ? 'CN' : 'ZZ');
    const country = getCountry(countryCode)!;
    const hasSavedCity = savedCity?.countryCode === countryCode;
    const custom = value.locationMode === 'custom' || (value.locationMode !== 'city' && hasLocation && !knownChinaCity && !hasSavedCity);
    let city: RegionCity | undefined;
    if (!custom) {
      city = hasSavedCity ? savedCity : countryCode === 'CN' && knownChinaCity ? knownChinaCity : oldRegion?.countryCode === countryCode ? oldRegion : getDefaultCity(countryCode);
    }
    const locationMode = custom || !city ? 'custom' : 'city';
    const fallbackCity = savedCountry ? getDefaultCity(savedCountry.code) : legacyChina;
    const preservedId = hasSavedCity ? savedCity.id : '';
    const legacyLineZone = value.timezoneRegion === '国际日期变更线（东）' ? 'Etc/GMT+12' : value.timezoneRegion === '国际日期变更线（西）' ? 'Etc/GMT-12' : undefined;
    const requestedId = typeof value.timezoneId === 'string' && isTimezoneSupported(value.timezoneId) ? value.timezoneId : undefined;
    const timezoneId = requestedId ?? oldRegion?.timezoneId ?? legacyLineZone ?? city?.timezoneId ?? fallbackCity?.timezoneId ?? 'Etc/UTC';
    // 我只迁移已经启用的地区规则；旧 worldCountry 不参与观测地点或计算时区选择。
    const timezoneMode = value.timezoneMode === 'region' ? 'region' : 'fixed';
    const timezone = timezoneMode === 'region' ? snapshotOffset(timezoneId) : finiteWithin(value.timezone, -12, 14) ? value.timezone : 8;
    const hasWeekStart = Number.isInteger(value.weekStart) && finiteWithin(value.weekStart, 0, 6);
    const weekStartMode = value.weekStartMode === 'auto' ? 'auto' : hasWeekStart ? 'custom' : 'auto';
    const weekStart = hasWeekStart ? value.weekStart as Weekday : country.weekStart;
    const jurisdiction = city ?? (hasSavedCity ? savedCity : undefined);
    const result: AppSettings = {
      locale: SUPPORTED_LOCALES.includes(value.locale as AppLocale) ? value.locale as AppLocale : 'zh-CN',
      theme: value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : defaults.theme,
      countryCode, cityId: city?.id ?? preservedId, timezoneId, locationMode,
      province: city?.province ?? (typeof value.province === 'string' ? value.province : fallbackCity?.province ?? ''),
      city: city?.name ?? (typeof value.city === 'string' ? value.city : '自定义地点'),
      longitude: city?.longitude ?? longitude ?? fallbackCity?.longitude ?? 0,
      latitude: city?.latitude ?? latitude ?? fallbackCity?.latitude ?? 0,
      timezone, timezoneMode, timezoneRegion: country.name,
      weekStart, weekStartMode,
      clockFormat: value.clockFormat === 'auto' || value.clockFormat === '12' || value.clockFormat === '24' ? value.clockFormat : '24',
      dateFormat: value.dateFormat === 'ymd' || value.dateFormat === 'mdy' || value.dateFormat === 'dmy' ? value.dateFormat : 'auto',
      showZodiac: typeof value.showZodiac === 'boolean' ? value.showZodiac : true,
      subdivisionCode: jurisdiction?.subdivisionCode ?? '', municipalityCode: jurisdiction?.municipalityCode ?? '',
      calendarLayers: calendarPreferences(value.calendarLayers),
    };
    if (result.weekStartMode === 'auto') result.weekStart = resolveWeekStart(result);
    return result;
  } catch { return defaults; }
}

export function saveSettings(settings: AppSettings): void {
  const { theme, countryCode, cityId, timezoneId, locationMode, province, city, longitude, latitude, timezone, timezoneMode, timezoneRegion, weekStart, weekStartMode, clockFormat, dateFormat, showZodiac, subdivisionCode, municipalityCode, calendarLayers } = settings;
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme, countryCode, cityId, timezoneId, locationMode, province, city, longitude, latitude, timezone, timezoneMode, timezoneRegion, weekStart, weekStartMode, clockFormat, dateFormat, showZodiac, subdivisionCode, municipalityCode, calendarLayers }));
  } catch { /* 我允许受限存储环境继续使用当前设置。 */ }
}

export function initialState(): AppState {
  const settings = loadSettings();
  const today = dateTimeAt(settings);
  return { year: today.year, month: today.month, selectedDay: today.day, page: 1, followToday: true, settings };
}
