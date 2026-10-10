import { civilDateKey, getCalendarEventSource, getHolidays, HOLIDAY_METADATA } from './holidays';
import type { HolidayEvent } from './holidays';
import { LOCAL_CALENDAR_SOURCES, NYC_ASP_2026, NYC_CIVIC_2026, NYC_SCHOOL_SCHEDULES } from '../data/nyc-calendars';

export interface CalendarLayerPreferences {
  usCultural: boolean;
  nycCivic: boolean;
  nycSchools: boolean;
  nycParking: boolean;
  commercial: boolean;
}

export const DEFAULT_CALENDAR_LAYERS: Readonly<CalendarLayerPreferences> = Object.freeze({
  usCultural: true, nycCivic: true, nycSchools: false, nycParking: false, commercial: false,
});

export type CalendarLayerId = 'us-federal' | 'us-cultural' | 'nyc-civic' | 'nyc-schools' | 'nyc-parking' | 'commercial';

export interface CalendarLocationSettings {
  countryCode: string;
  subdivisionCode?: string;
  municipalityCode?: string;
  calendarLayers?: Partial<CalendarLayerPreferences>;
}

export interface LocalCalendarCoverage {
  id: CalendarLayerId;
  label: string;
  available: boolean;
  partial?: boolean;
  summary: string;
  sourceUrl: string;
  coverageLabel: string;
  scope: string;
}

export function resolveCalendarLayers(preferences?: Partial<CalendarLayerPreferences>): CalendarLayerPreferences {
  const result = { ...DEFAULT_CALENDAR_LAYERS };
  for (const key of Object.keys(result) as (keyof CalendarLayerPreferences)[]) {
    if (typeof preferences?.[key] === 'boolean') result[key] = preferences[key];
  }
  return result;
}

export function isNewYorkCity(settings: CalendarLocationSettings): boolean {
  return settings.countryCode === 'US' && settings.municipalityCode === 'US-NYC';
}

function validYear(year: number): boolean { return Number.isInteger(year) && year >= -4712 && year <= 9999; }

/** 我只用 UTC 字段做公历整数运算，不把民用日期转换成任何时区的瞬时值。 */
function dateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function dateRange(first: string, last = first, weekdaysOnly = false, excludeDates: readonly string[] = []): string[] {
  const parts = dateParts(first), cursor = new Date(0), dates: string[] = [];
  cursor.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  cursor.setUTCHours(12, 0, 0, 0);
  for (let key = first; key <= last; cursor.setUTCDate(cursor.getUTCDate() + 1), key = civilDateKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())) {
    if (weekdaysOnly && (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6)) continue;
    if (!excludeDates.includes(key)) dates.push(key);
  }
  return dates;
}

function localEvent(date: string, id: string, name: string, category: HolidayEvent['category'], sourceId: keyof typeof LOCAL_CALENDAR_SOURCES, details: Pick<HolidayEvent, 'layerId' | 'scope' | 'effect' | 'coverageLabel' | 'status' | 'audience'>): HolidayEvent {
  return {
    id: `US:${details.layerId}:${id}:${date}`, countryCode: 'US', date, ...dateParts(date), name, category,
    sourceId, sourceUrl: LOCAL_CALENDAR_SOURCES[sourceId].url, description: details.effect ?? '', prominent: true, ...details,
  };
}

function culturalEves(year: number): HolidayEvent[] {
  if (year < HOLIDAY_METADATA.US.fromYear) return [];
  return [
    [12, 24, 'christmas-eve', '平安夜'], [12, 31, 'new-year-eve', '跨年夜'],
  ].map(([month, day, id, name]) => localEvent(civilDateKey(year, month as number, day as number), id as string, name as string, 'cultural', 'us-cultural-eves', {
    layerId: 'us-cultural', scope: '美国常见文化日期', status: 'observance', coverageLabel: '1971 年起按当代日期惯例展示',
    effect: '文化日期，不属于每年固定的全国性联邦休假安排；不据此推断学校、机构或雇主休假。',
  }));
}

function commercialEvents(year: number): HolidayEvent[] {
  // 我从 2005 年起提供商业层，避免把网络星期一套到名称出现之前的历史年份。
  if (year < 2005) return [];
  const thanksgiving = getHolidays('US', year).find((item) => item.category === 'federal' && item.id.startsWith('US:thanksgiving:'));
  if (!thanksgiving) return [];
  const friday = thanksgiving.day + 1;
  const monday = thanksgiving.day + 4;
  const cursor = new Date(0);
  cursor.setUTCFullYear(year, 10, monday);
  cursor.setUTCHours(12, 0, 0, 0);
  const details = { layerId: 'commercial', scope: '美国商业购物日期', status: 'observance' as const, coverageLabel: '2005 年起按当代日期惯例展示', effect: '商业购物日期，不是法定休假依据；商家活动及营业时间各自安排。' };
  return [
    localEvent(civilDateKey(year, 11, friday), 'black-friday', '黑色星期五', 'commercial', 'us-commercial', details),
    localEvent(civilDateKey(year, cursor.getUTCMonth() + 1, cursor.getUTCDate()), 'cyber-monday', '网络星期一', 'commercial', 'us-commercial', details),
  ];
}

function civicEvents(year: number): HolidayEvent[] {
  if (year !== 2026) return [];
  return NYC_CIVIC_2026.map((item) => localEvent(item.date, item.id, item.name, 'local', item.sourceId, {
    layerId: 'nyc-civic', scope: item.scope, effect: item.effect, coverageLabel: '2026 年已核对的地方重要日期', status: 'observance',
  }));
}

function parkingEvents(year: number): HolidayEvent[] {
  if (year !== 2026) return [];
  const groups = new Map<string, { names: string[]; major: boolean }>();
  for (const item of NYC_ASP_2026) {
    const group = groups.get(item.date) ?? { names: [], major: false };
    if (!group.names.includes(item.name)) group.names.push(item.name);
    group.major ||= item.major === true;
    groups.set(item.date, group);
  }
  return [...groups].map(([date, group]) => {
    const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
    const meter = group.major
      ? '官方列为 major legal holiday，停车计费暂停；全年七天生效的禁停等规则仍有效。'
      : sunday
        ? '当日也是周日，停车计费按周日规则暂停；其他停车限制仍须遵守。'
        : '暂停换边停车不等于免费停车；停车计费及其他已张贴的限制仍须遵守。';
    return localEvent(date, 'asp', `ASP 暂停 · ${group.names.join('／')}`, 'parking', 'nyc-asp-2026', {
      layerId: 'nyc-parking', scope: '纽约市换边停车（ASP）／街道清扫规则', status: 'asp-suspended',
      effect: `已公布的换边停车暂停日，原因：${group.names.join('、')}。${meter}临时天气及紧急变动请查 NYC311；以现场标志和最新公告为准。`,
      coverageLabel: '2026 年官方计划暂停日期；不含实时临时公告',
    });
  });
}

function schoolEvents(year: number): HolidayEvent[] {
  if (year < 2025 || year > 2027) return [];
  const events: HolidayEvent[] = [];
  for (const schedule of NYC_SCHOOL_SCHEDULES) {
    for (const [index, item] of schedule.entries.entries()) {
      for (const date of dateRange(item.date, item.through, item.weekdaysOnly, item.excludeDates)) {
        if (dateParts(date).year !== year) continue;
        events.push(localEvent(date, `${schedule.sourceId}-${index}`, item.name, 'school', schedule.sourceId, {
          layerId: 'nyc-schools', status: item.status, audience: item.audience, effect: item.effect,
          scope: `纽约市公校（NYCPS）：${item.audience.join('、')}`, coverageLabel: schedule.label,
        }));
      }
    }
  }
  return events;
}

/** 我先组合全国与用户启用的地方日历，再按民用日期排序；没有时区参数或跨日换算。 */
export function getCalendarHolidays(settings: CalendarLocationSettings, year: number): HolidayEvent[] {
  if (!validYear(year)) return [];
  if (settings.countryCode !== 'US') return getHolidays(settings.countryCode, year);
  const layers = resolveCalendarLayers(settings.calendarLayers);
  const events = getHolidays('US', year).filter((item) => item.category !== 'cultural' || layers.usCultural).map((item) => ({
    ...item, layerId: item.category === 'cultural' ? 'us-cultural' : 'us-federal',
    scope: item.category === 'cultural' ? '美国常见文化日期' : HOLIDAY_METADATA.US.federalScope,
    effect: item.description, sourceUrl: getCalendarEventSource(item)?.url,
    coverageLabel: '1971 年起按已生效规则与当代惯例展示',
  } as HolidayEvent));
  if (layers.usCultural) events.push(...culturalEves(year));
  if (layers.commercial) events.push(...commercialEvents(year));
  if (isNewYorkCity(settings)) {
    if (layers.nycCivic) events.push(...civicEvents(year));
    if (layers.nycSchools) events.push(...schoolEvents(year));
    if (layers.nycParking) events.push(...parkingEvents(year));
  }
  // 我只消除同层的相同语义记录，保留同日选举、上课与停车等不同影响。
  const unique = new Map<string, HolidayEvent>();
  for (const item of events) {
    const key = JSON.stringify([item.layerId, item.date, item.name, item.status, item.scope, item.effect]);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.month - b.month || a.day - b.day || a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

export function getLocalCalendarCoverage(settings: CalendarLocationSettings, year: number): LocalCalendarCoverage[] {
  if (settings.countryCode !== 'US') return [];
  const layers = resolveCalendarLayers(settings.calendarLayers), result: LocalCalendarCoverage[] = [];
  const yearValid = validYear(year), federalYear = yearValid && year >= 1971;
  result.push({
    id: 'us-federal', label: '美国联邦节日', available: federalYear,
    summary: federalYear ? '节日本日与联邦补休日分别显示；未来年份按已生效规则推算' : '1971 年以前的联邦节日规则未覆盖',
    sourceUrl: HOLIDAY_METADATA.sources['us-opm'].url, coverageLabel: '1971 年起，按各节日生效年份计算',
    scope: HOLIDAY_METADATA.US.federalScope,
  });
  if (layers.usCultural) result.push({
    id: 'us-cultural', label: '美国文化日期', available: federalYear,
    summary: federalYear ? '8 项常见文化日期，包含平安夜与跨年夜' : '该年文化日期资料未覆盖',
    sourceUrl: HOLIDAY_METADATA.sources['us-census'].url, coverageLabel: '1971 年起按当代日期惯例展示',
    scope: '文化纪念日，不代表联邦休假；不同纪念日的详细来源见事件详情。',
  });
  if (layers.commercial) result.push({
    id: 'commercial', label: '美国商业日期', available: yearValid && year >= 2005,
    summary: yearValid && year >= 2005 ? '黑色星期五、网络星期一' : '该年商业日期资料未覆盖',
    sourceUrl: LOCAL_CALENDAR_SOURCES['us-commercial'].url, coverageLabel: '2005 年起按当代日期惯例展示', scope: '商业日期，不是法定休假或营业时间依据。',
  });
  if (!isNewYorkCity(settings)) return result;
  if (layers.nycCivic) result.push({
    id: 'nyc-civic', label: '纽约公共事务', available: year === 2026,
    summary: year === 2026 ? '已收录 2026 年初选、大选及林肯诞辰日期' : `${year} 年纽约公共事务排期未覆盖，不沿用其他年份`,
    sourceUrl: LOCAL_CALENDAR_SOURCES['nyc-election-2026'].url, coverageLabel: '仅 2026 年；并非完整地方事件名录', scope: '纽约市及所列纽约州日期，不表示全体居民休假。',
  });
  if (layers.nycSchools) {
    const available = year === 2025 || year === 2026 || year === 2027;
    result.push({
      id: 'nyc-schools', label: '纽约公校', available, partial: available && year !== 2026,
      summary: year === 2026 ? '已收录 2025–26、2026–27 学年中落在 2026 年的官方安排'
        : year === 2025 ? '部分覆盖：仅 2025 年 9 月起的 2025–26 学年安排'
          : year === 2027 ? '部分覆盖：仅 2027 年 6 月结束前的 2026–27 学年安排'
            : `${year} 年纽约公校排期未覆盖，不推断停课或开学日`,
      sourceUrl: LOCAL_CALENDAR_SOURCES[year === 2025 ? 'nyc-schools-2025-26' : 'nyc-schools-2026-27'].url,
      coverageLabel: '2025–26 与 2026–27 学年；不含暑期项目及临时变动',
      scope: 'NYCPS 3-K 至 12 年级；按学段显示不同影响，个别学校的家长会安排可能调整。',
    });
  }
  if (layers.nycParking) result.push({
    id: 'nyc-parking', label: '纽约停车提醒', available: year === 2026,
    summary: year === 2026 ? '已收录 2026 年 ASP 计划暂停日期' : `${year} 年 ASP 排期未覆盖，请查看 NYC311`,
    sourceUrl: LOCAL_CALENDAR_SOURCES['nyc-asp-2026'].url, coverageLabel: '仅 2026 年计划暂停表；非实时停车状态', scope: 'ASP 暂停与停车计费分开说明；现场标志、天气和紧急公告可能另有要求。',
  });
  return result;
}
