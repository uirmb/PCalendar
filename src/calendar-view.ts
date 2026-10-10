import { getMonthCalendar, getSunMoon } from './engine/facade';
import { J2000, JD, XL, obb, dt_T } from './engine/engine';
import type { LunarDay, MonthCalendar } from './engine/types';
import type { AppState, AppSettings } from './lib/state';
import { dateTimeAt, offsetAtUT, localToUT, formatUTCOffset } from './lib/time';
import { getCountry, resolveWeekStart } from './lib/regions';
import { localeCountryName } from './lib/i18n';
import { formatClock, formatDate } from './lib/format';
import { displayYear, html, pad } from './lib/dom';
import { icon } from './lib/icons';
import { civilDateKey, getChinaDayHolidays, getHolidayCoverage, getCalendarEventSource, HOLIDAY_CATEGORY_LABELS, HOLIDAY_METADATA } from './lib/holidays';
import type { HolidayEvent } from './lib/holidays';
import { getCalendarHolidays, getLocalCalendarCoverage } from './lib/local-calendars';
import { getSeasonEvents, getTimezoneTransitions } from './lib/astronomy-events';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const cache = new Map<string, MonthCalendar>();
const internationalPhases: Record<string, string> = { 朔: '新月', 望: '满月', 上弦: '上弦月', 下弦: '下弦月' };

export function monthData(year: number, month: number): MonthCalendar {
  const key = `${year}:${month}`;
  if (!cache.has(key)) {
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    cache.set(key, getMonthCalendar(year, month));
  }
  return cache.get(key)!;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const absolute = year * 12 + month - 1 + delta;
  return { year: Math.floor(absolute / 12), month: ((absolute % 12) + 12) % 12 + 1 };
}

function lunarLabel(day: LunarDay): string { return `${day.Lleap}${day.Lmc}月${day.Ldc}`; }
function calendarTerm(day: LunarDay): string { return day.Ljq && day.Ljq !== day.jqmc ? day.Ljq : ''; }
function countryName(settings: AppSettings): string { const country=getCountry(settings.countryCode); return country ? localeCountryName(settings.locale,country.code,country.name) : settings.countryCode; }

export function selectedDay(state: AppState): LunarDay {
  return monthData(state.year, state.month).days.find((day) => day.d === state.selectedDay) ?? monthData(state.year, state.month).days[0];
}

export interface CalendarEvent {
  name: string;
  type: 'term' | 'moon' | 'season' | 'dst';
  year: number;
  month: number;
  day: number;
  dayNumber: number;
  time: string;
  offset: number;
  utcJ2000: number;
  description?: string;
  sourceUrl?: string;
}

/** 我保留原引擎事件数值，只转换瞬时时区；美国季节与时钟切换也按真实当地日期归位。 */
function nearbyEvents(year: number, month: number, settings: AppSettings): CalendarEvent[] {
  const chinese = settings.countryCode === 'CN', result: CalendarEvent[] = [];
  const years = new Set<number>();
  for (const delta of [-1, 0, 1]) {
    const value = shiftMonth(year, month, delta);
    if (value.year < -4712 || value.year > 9999) continue;
    years.add(value.year);
    for (const day of monthData(value.year, value.month).days) {
      const raw: Array<{ name: string; type: 'term' | 'moon'; beijing: number }> = [];
      if (chinese && day.jqmc && typeof day.jqjd === 'number') raw.push({ name: day.jqmc, type: 'term', beijing: day.jqjd });
      if (day.yxmc && typeof day.yxjd === 'number') raw.push({ name: chinese ? day.yxmc : internationalPhases[day.yxmc] ?? day.yxmc, type: 'moon', beijing: day.yxjd });
      for (const event of raw) {
        const utcJ2000 = event.beijing - 8 / 24, offset = offsetAtUT(settings, utcJ2000);
        const local = utcJ2000 + offset / 24, dayNumber = Math.floor(local + 0.5), date = JD.DD(dayNumber + J2000);
        result.push({ name: event.name, type: event.type, year: date.Y, month: date.M, day: date.D, dayNumber, time: JD.timeStr(local), offset, utcJ2000 });
      }
    }
  }
  if (settings.countryCode === 'US') {
    for (const eventYear of years) {
      result.push(...getSeasonEvents(eventYear, (ut) => offsetAtUT(settings, ut)), ...getTimezoneTransitions(eventYear, settings));
    }
  }
  return result.sort((a, b) => a.utcJ2000 - b.utcJ2000);
}

export function getMonthEvents(year: number, month: number, settings: AppSettings): CalendarEvent[] {
  return nearbyEvents(year, month, settings).filter((event) => event.year === year && event.month === month);
}

function zoneLabel(settings: AppSettings): string {
  if (settings.timezoneMode !== 'region') return formatUTCOffset(settings.timezone);
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: settings.timezoneId, timeZoneName: 'longGeneric' })
      .formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? settings.timezoneId;
  } catch { return settings.timezoneId; }
}

/** 我格式化说明中的钟表时刻与数字日期，保留 UTC 偏移及日照时长的原意。 */
function formatDescription(settings: AppSettings, text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_value, year: string, month: string, day: string) => formatDate(settings, Number(year), Number(month), Number(day)))
    .replace(/(?<![\d:+−-])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/g, (value) => formatClock(settings, value));
}

function shortHolidayName(holiday: HolidayEvent): string {
  if (holiday.category === 'parking') return 'ASP 暂停';
  if (holiday.category === 'school' && holiday.status === 'remote') return '公校远程上课';
  return holiday.name;
}

function holidayText(holiday: HolidayEvent): string { return `${holiday.name} · ${HOLIDAY_CATEGORY_LABELS[holiday.category]}`; }
function eventIcon(event: CalendarEvent): ReturnType<typeof icon> { return icon(event.type === 'moon' ? 'moon' : event.type === 'dst' ? 'clock' : 'leaf'); }
function eventColor(event: CalendarEvent): string { return event.type === 'moon' ? 'purple' : event.type === 'dst' ? 'amber' : 'green'; }

const holidayPriority: Partial<Record<HolidayEvent['category'], number>> = { federal: 0, observed: 0, school: 1, local: 2, parking: 3, cultural: 4, commercial: 5 };
function importantHolidays(holidays: HolidayEvent[]): HolidayEvent[] {
  return holidays.slice().sort((a, b) => Number(b.prominent) - Number(a.prominent) || (holidayPriority[a.category] ?? 4) - (holidayPriority[b.category] ?? 4) || a.name.localeCompare(b.name));
}

function dayCell(day: LunarDay, state: AppState, dayEvents: CalendarEvent[], holidays: HolidayEvent[]): string {
  const { settings } = state, chinese = settings.countryCode === 'CN', american = settings.countryCode === 'US', international = settings.countryCode !== 'CN';
  const inMonth = day.y === state.year && day.m === state.month, selected = inMonth && day.d === state.selectedDay;
  const today = dateTimeAt(settings), isToday = day.y === today.year && day.m === today.month && day.d === today.day;
  const solarTerm = dayEvents.find((event) => event.type === 'term'), moonPhase = dayEvents.find((event) => event.type === 'moon');
  const holiday = holidays.find((item) => item.prominent && item.category !== 'rest' && item.category !== 'workday');
  // 我只用中国官方休班表显示“休 / 班”，学校或停车事项不会成为全民休假标记。
  const official = chinese ? holidays.find((item) => item.category === 'rest' || item.category === 'workday') : undefined;
  const termName = chinese ? solarTerm?.name || calendarTerm(day) : '';
  const label = termName || holiday?.name || (chinese ? official?.name || (day.Ldc === '初一' ? `${day.Lleap}${day.Lmc}月` : day.Ldc) : '');
  const term = Boolean(termName), weekend = day.week === 0 || day.week === 6;
  const rest = official?.category === 'rest', workday = official?.category === 'workday';
  const ordered = importantHolidays(holidays), shown = ordered.slice(0, 2), extra = Math.max(0, ordered.length - shown.length);
  const description = [
    `${formatDate(settings, day.y, day.m, day.d)}，星期${weekdays[day.week]}`,
    chinese ? `农历${lunarLabel(day)}` : '',
    ...dayEvents.map((item) => `${item.name} ${formatClock(settings, item.time)} ${formatOffset(item.offset)}${item.description ? `，${formatDescription(settings, item.description)}` : ''}`),
    !solarTerm && termName ? `历法节气 ${termName}` : '',
    ...holidays.map((item) => `${holidayText(item)}${item.effect ? `，${formatDescription(settings, item.effect)}` : ''}${item.scope ? `，适用范围：${item.scope}` : ''}`),
  ].filter(Boolean).join('，');
  const markers = dayEvents.filter((event) => event.type !== 'term').map((event) => `<span class="day-astronomy-marker marker-${event.type}" title="${html(`${event.name} ${formatClock(settings, event.time)} ${formatOffset(event.offset)}`)}">${eventIcon(event)}<span>${html(event.name)}</span></span>`).join('');
  return `<button type="button" class="calendar-day${international ? ' calendar-day--local' : ''}${inMonth ? '' : ' is-outside'}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}"
    data-calendar-date="${day.y},${day.m},${day.d}" data-jd="${day.d0}" data-fjia="${workday ? 0 : rest || weekend ? 1 : 0}"${official ? ` data-rest-state="${official.category}"` : ''}
    tabindex="${selected ? '0' : '-1'}" aria-pressed="${selected}"${isToday ? ' aria-current="date"' : ''} aria-label="${html(description)}" title="${html(description)}">
    <span class="day-number">${day.d}${isToday ? '<span class="today-marker">今</span>' : ''}${official ? `<span class="calendar-status-marker ${rest ? 'is-rest' : 'is-workday'}" title="${html(holidayText(official))}">${rest ? '休' : '班'}</span>` : ''}</span>
    ${international ? `<span class="day-local-items">${shown.map((item) => `<span class="day-local-item" data-holiday-category="${item.category}" data-layer-id="${html(item.layerId ?? '')}">${html(shortHolidayName(item))}</span>`).join('')}</span>${extra ? `<span class="day-more" aria-hidden="true">+${extra}</span>` : ''}` : `<span class="day-lunar${term ? ' is-term' : holiday || official ? ' is-holiday' : ''}">${html(label)}</span>`}
    <span class="day-markers">${international ? markers : moonPhase ? `<span class="moon-marker" title="${html(`${moonPhase.name} ${formatClock(settings, moonPhase.time)} ${formatOffset(moonPhase.offset)}`)}">${icon('moon')}<span>${html(moonPhase.name)}</span></span>` : ''}${term ? '<span class="term-dot"></span>' : ''}</span>
  </button>`;
}

function astronomyListItem(event: CalendarEvent, settings: AppSettings): string {
  const description = `${event.name}，${formatDate(settings, event.year, event.month, event.day)}，${formatClock(settings, event.time)}，${formatOffset(event.offset)}${event.description ? `，${formatDescription(settings, event.description)}` : ''}`;
  return `<button class="event-item" data-calendar-date="${event.year},${event.month},${event.day}" data-event-kind="instant" data-astronomy-type="${event.type}" aria-label="${html(description)}" title="${html(description)}"><span class="event-symbol ${eventColor(event)}">${eventIcon(event)}</span><span class="event-copy"><strong>${html(event.name)}</strong><small>${html(formatDate(settings, event.year, event.month, event.day))}</small></span><time title="${html(formatOffset(event.offset))}">${html(formatClock(settings, event.time))}</time></button>`;
}

function holidayListItem(holiday: HolidayEvent, settings: AppSettings): string {
  return `<button class="event-item" data-calendar-date="${holiday.year},${holiday.month},${holiday.day}" data-event-kind="all-day" data-holiday-category="${holiday.category}" data-layer-id="${html(holiday.layerId ?? '')}" title="${html(formatDescription(settings, holiday.effect || holiday.description))}"><span class="event-symbol holiday-symbol">${icon(holiday.category === 'school' ? 'book' : holiday.category === 'parking' ? 'pin' : 'calendar')}</span><span class="event-copy"><strong>${html(holiday.name)}</strong><small>${html(formatDate(settings, holiday.year, holiday.month, holiday.day))} <span class="holiday-category">${HOLIDAY_CATEGORY_LABELS[holiday.category]}</span></small></span><time>全天</time></button>`;
}

function holidayCoverageMarkup(settings: AppSettings, year: number): string {
  if (settings.countryCode === 'US') {
    const layers = getLocalCalendarCoverage(settings, year);
    const unavailable = layers.some((layer) => !layer.available), partial = layers.some((layer) => layer.partial);
    const warning = [unavailable ? '部分日历资料未覆盖' : '', partial ? '部分日历仅收录部分日期' : ''].filter(Boolean).join(' · ');
    return `<details class="holiday-coverage${warning ? ' has-coverage-warning' : ''}"><summary>${warning ? `${html(warning)} · ` : ''}资料来源与覆盖范围</summary><div class="coverage-layer-list">${layers.map((layer) => `<div data-coverage-layer="${html(layer.id)}" class="coverage-layer${layer.available ? '' : ' is-unavailable'}"><strong>${html(layer.label)}</strong><span>${html(layer.coverageLabel)}</span><p>${html(layer.summary)}</p><p>${html(layer.scope)}</p>${layer.sourceUrl ? `<a href="${html(layer.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看官方来源</a>` : ''}</div>`).join('')}</div></details>`;
  }
  const coverage = getHolidayCoverage(settings.countryCode, year);
  if (!coverage.supported) return `<p class="holiday-coverage">${html(coverage.summary)}。${html(coverage.detail)}</p>`;
  const sources = coverage.sourceIds.map((id) => HOLIDAY_METADATA.sources[id as keyof typeof HOLIDAY_METADATA.sources]).filter((source) => source?.url);
  return `<details class="holiday-coverage"><summary>${html(coverage.summary)}</summary><p>${html(coverage.detail)}</p>${sources.length ? `<p>${sources.map((source) => `<a href="${html(source.url)}" target="_blank" rel="noopener noreferrer">${html(source.title)}</a>`).join(' · ')}</p>` : ''}</details>`;
}

function holidayDetails(holiday: HolidayEvent, settings: AppSettings): string {
  const source = getCalendarEventSource(holiday);
  const scope = holiday.scope || source?.scope;
  const coverage = holiday.coverageLabel || source?.coverageLabel;
  return `<article class="local-holiday-detail" data-holiday-category="${holiday.category}" data-layer-id="${html(holiday.layerId ?? '')}"><div class="local-holiday-heading"><strong>${html(holiday.name)}</strong><span class="holiday-category">${HOLIDAY_CATEGORY_LABELS[holiday.category]}</span></div><p>${html(formatDescription(settings, holiday.effect || holiday.description))}</p>${scope || coverage ? `<dl>${scope ? `<div><dt>适用范围</dt><dd>${html(scope)}</dd></div>` : ''}${coverage ? `<div><dt>资料覆盖</dt><dd>${html(coverage)}</dd></div>` : ''}</dl>` : ''}${source?.url ? `<a class="event-source" href="${html(source.url)}" target="_blank" rel="noopener noreferrer">${html(source.title)} ${icon('chevronRight')}</a>` : ''}</article>`;
}

export function renderCalendar(state: AppState): string {
  const settings = state.settings, chinese = settings.countryCode === 'CN', american = settings.countryCode === 'US', international = settings.countryCode !== 'CN';
  const country = countryName(settings), calendar = monthData(state.year, state.month), day = selectedDay(state), weekStart = resolveWeekStart(settings);
  state.selectedDay = day.d;
  const before = shiftMonth(state.year, state.month, -1), after = shiftMonth(state.year, state.month, 1);
  const leading = (calendar.firstWeekday - weekStart + 7) % 7;
  const count = Math.max(35, Math.ceil((leading + calendar.dayCount) / 7) * 7);
  const previousDays = state.year <= -4712 && state.month === 1 ? [] : monthData(before.year, before.month).days;
  const nextDays = state.year >= 9999 && state.month === 12 ? [] : monthData(after.year, after.month).days;
  const cells: (LunarDay | null)[] = [
    ...Array.from({ length: leading }, (_, i) => previousDays[previousDays.length - leading + i] ?? null),
    ...calendar.days,
    ...Array.from({ length: count - leading - calendar.dayCount }, (_, i) => nextDays[i] ?? null),
  ];
  const surroundingEvents = nearbyEvents(state.year, state.month, settings), eventsByDay = new Map<number, CalendarEvent[]>();
  for (const event of surroundingEvents) {
    const existing = eventsByDay.get(event.dayNumber) ?? [];
    existing.push(event); eventsByDay.set(event.dayNumber, existing);
  }
  const holidayYears = new Map<number, HolidayEvent[]>();
  const yearHolidays = (year: number): HolidayEvent[] => {
    if (!holidayYears.has(year)) holidayYears.set(year, getCalendarHolidays(settings, year));
    return holidayYears.get(year)!;
  };
  const dayHolidays = (item: LunarDay): HolidayEvent[] => chinese ? getChinaDayHolidays(item)
    : yearHolidays(item.y).filter((holiday) => holiday.month === item.m && holiday.day === item.d);
  const grid = Array.from({ length: count / 7 }, (_, row) => `<div class="calendar-week" role="row">${cells.slice(row * 7, row * 7 + 7).map((item) => `<div role="gridcell">${item ? dayCell(item, state, eventsByDay.get(item.d0) ?? [], dayHolidays(item)) : '<div class="calendar-day is-empty"></div>'}</div>`).join('')}</div>`).join('');
  const events = surroundingEvents.filter((event) => event.year === state.year && event.month === state.month);
  const nextTerm = surroundingEvents.find((event) => event.type === 'term' && event.dayNumber >= day.d0);
  const nextMoon = surroundingEvents.find((event) => event.type === 'moon' && event.dayNumber >= day.d0);
  const selectedEvents = eventsByDay.get(day.d0) ?? [], selectedHolidays = dayHolidays(day);
  const monthHolidays = chinese ? [] : yearHolidays(state.year).filter((holiday) => holiday.month === state.month);
  const selectedKey = civilDateKey(day.y, day.m, day.d);
  const nextHoliday = international ? [...yearHolidays(day.y), ...(day.y < 9999 ? yearHolidays(day.y + 1) : [])].filter((holiday) => holiday.date >= selectedKey).sort((a, b) => a.date.localeCompare(b.date) || (holidayPriority[a.category] ?? 4) - (holidayPriority[b.category] ?? 4))[0] : undefined;
  const astronomyItems = events.map((event) => astronomyListItem(event, settings)).join('');
  const holidayItems = monthHolidays.map((holiday) => holidayListItem(holiday, settings)).join('');
  const utNoon = localToUT(settings, day.d0), dayOffset = offsetAtUT(settings, utNoon);
  const sunMoon = getSunMoon(day.d0 + J2000, settings.longitude, settings.latitude, dayOffset, (ut) => offsetAtUT(settings, ut));
  const illumination = XL.moonIll((utNoon + dt_T(utNoon)) / 36525) * 100;
  const dayZodiac = obb.ShX[((day.Lyear0 % 12) + 12) % 12], traditionalTerm = chinese ? calendarTerm(day) : '';
  const coverage = getHolidayCoverage(settings.countryCode, state.year), showZodiac = chinese || settings.showZodiac;
  const historical = state.year === 1582 && state.month === 10;
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) => {
    const weekday = (i + weekStart) % 7;
    const label = new Intl.DateTimeFormat(settings.locale,{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2023,0,1+weekday)));
    return `<div role="columnheader" class="${weekday === 0 || weekday === 6 ? 'weekend-heading' : ''}">${html(label)}</div>`;
  }).join('');
  const dateOverview = chinese
    ? `<span class="eyebrow">农历 · ${html(day.Lyear3)}年</span><strong>${html(lunarLabel(day))}</strong><span class="overview-sub">${html(dayZodiac)}年 <span class="dot-divider">·</span> ${html(day.Lmonth2)}月 ${html(day.Lday2)}日</span>`
    : `<span class="eyebrow">${html(country)} · 当地日期</span><strong>${html(formatDate(settings, day.y, day.m, day.d))}</strong><span class="overview-sub">星期${weekdays[day.week]}${showZodiac ? ` <span class="dot-divider">·</span> ${html(day.XiZ)} <span class="muted">十二星座</span>` : ''}</span>`;
  const nextOverview = chinese
    ? `<span class="eyebrow">${nextTerm ? '下一节气' : '本月节气'}</span><strong>${nextTerm ? html(nextTerm.name) : '查看气朔表'}</strong><span class="overview-sub">${nextTerm ? `${html(formatDate(settings, nextTerm.year, nextTerm.month, nextTerm.day))} <span class="dot-divider">·</span> ${html(formatClock(settings, nextTerm.time))}` : '节气与物候精确推算'}</span>`
    : international ? `<span class="eyebrow">接下来的节日与事项</span><strong>${nextHoliday ? html(nextHoliday.name) : '节日资料未覆盖'}</strong><span class="overview-sub">${nextHoliday ? `${html(formatDate(settings, nextHoliday.year, nextHoliday.month, nextHoliday.day))} <span class="dot-divider">·</span> ${HOLIDAY_CATEGORY_LABELS[nextHoliday.category]}` : html(coverage.summary)}</span>`
      : `<span class="eyebrow">下一月相</span><strong>${nextMoon ? html(nextMoon.name) : '查看月相推算'}</strong><span class="overview-sub">${nextMoon ? `${html(formatDate(settings, nextMoon.year, nextMoon.month, nextMoon.day))} <span class="dot-divider">·</span> ${html(formatClock(settings, nextMoon.time))}` : '精确天文时刻'}</span>`;
  const chineseFacts = chinese ? `<div><dt>春节纪年</dt><dd>${html(day.Lyear3)}年</dd></div><div><dt>立春纪年</dt><dd>${html(day.Lyear2)}年</dd></div><div><dt>干支月日</dt><dd>${html(day.Lmonth2)}月 ${html(day.Lday2)}日</dd></div><div><dt>黄帝纪年</dt><dd>${day.Lyear4}年</dd></div><div><dt>回历</dt><dd>${day.Hyear}年 ${day.Hmonth}月 ${day.Hday}日</dd></div>` : '';

  return `<section class="calendar-overview" aria-label="所选日期概览" data-calendar-region="${html(settings.countryCode)}">
    <article class="overview-card ${chinese ? 'lunar-overview' : 'local-date-overview'}"><div class="overview-icon purple">${icon('calendar')}</div><div>${dateOverview}</div><span class="overview-decoration" aria-hidden="true">${icon('orbit')}</span></article>
    <article class="overview-card holiday-overview"><div class="overview-icon green">${icon(chinese ? 'leaf' : international ? 'calendar' : 'moon')}</div><div>${nextOverview}</div></article>
    <article class="overview-card"><div class="overview-icon amber">${icon('rise')}</div><div><span class="eyebrow">${html(settings.city)} · 日出 / 日落</span><strong class="time-pair">${html(formatClock(settings, sunMoon.sunrise, false))}<span>/</span>${html(formatClock(settings, sunMoon.sunset, false))}</strong><span class="overview-sub">日照 ${html(sunMoon.daylight)}</span></div></article>
  </section>

  <div class="calendar-layout">
    <section class="calendar-panel card" aria-label="月历" data-calendar-country="${html(settings.countryCode)}">
      <div class="calendar-toolbar">
        <div class="calendar-title"><h2>${displayYear(state.year)}<span>年</span> ${state.month}<span>月</span></h2><p>${chinese ? `${html(calendar.heavenlyStemEarthlyBranch)}${html(calendar.zodiac)}年 <span class="dot-divider">·</span> ${html(calendar.era)}` : `${html(country)} <span class="dot-divider">·</span> 公历 <span class="dot-divider">·</span> ${html(zoneLabel(settings))}`}</p></div>
        <div class="calendar-actions"><button class="button button--secondary button--sm" data-action="today" aria-pressed="${state.followToday}" title="跟随所选时区的今天">今天</button><div class="month-navigation"><button class="button button--ghost button--icon-only button--sm" data-action="prev-month" title="上个月（Page Up）" aria-label="上个月">${icon('chevronLeft')}</button><button class="button button--ghost button--icon-only button--sm" data-action="next-month" title="下个月（Page Down）" aria-label="下个月">${icon('chevronRight')}</button></div><button class="button button--tertiary button--sm date-jump" data-action="open-date">${icon('calendar')}<span>跳转日期</span></button></div>
      </div>
      ${historical ? '<div class="calendar-notice">沿用原版改历规则：1582 年 10 月 4 日之后为 10 月 15 日，本月共 21 天。</div>' : ''}
      <div class="calendar-grid" role="grid" aria-label="${html(displayYear(state.year))}年${state.month}月" aria-describedby="calendar-keyboard-help"><div class="calendar-week weekday-headings" role="row">${weekdayHeaders}</div>${grid}</div>
      <div class="calendar-bottom"><span><i class="legend-dot purple"></i>月相${chinese ? ' <i class="legend-dot green"></i>节气' : international ? ' <i class="legend-dot green"></i>季节 <i class="legend-dot amber"></i>公共假日' : ''}</span><span id="calendar-keyboard-help">方向键选日 <span class="key-hint">← →</span></span><span class="calendar-year-nav"><button data-action="prev-year" title="上一年" aria-label="上一年">${icon('chevronLeft')}上一年</button><button data-action="next-year" title="下一年" aria-label="下一年">下一年${icon('chevronRight')}</button></span></div>
      ${international ? `<section class="month-events month-local-events" aria-label="本月节日与当地事项"><div class="section-heading"><h3>${icon('calendar')}本月节日与当地事项</h3><span>${monthHolidays.length} 项 · 全天</span></div><p class="calendar-time-note">${settings.municipalityCode === 'US-NYC' ? '纽约市事项按启用的日历层显示。' : ''}学校、停车与文化纪念事项各有适用范围，不代表统一放假。</p><div class="event-list local-event-list">${holidayItems || '<p class="empty-message">本月没有已启用且已核实的当地事项。</p>'}</div>${holidayCoverageMarkup(settings, state.year)}</section>` : ''}
      <section class="month-events month-astronomy-events" aria-label="${chinese ? '本月节气与月相' : '季节与月相'}"><div class="section-heading"><h3>${icon('sparkle')}${chinese ? '本月节气与月相' : '季节与月相'}</h3><span>${html(zoneLabel(settings))}</span></div><p class="calendar-time-note">${chinese ? '农历沿用原版中国历法；节气与月相时刻按所选时区显示。' : '季节、月相与时钟调整均按所选时区显示，属于精确时刻。'}</p><div class="event-list">${astronomyItems || '<p class="empty-message">本月没有可显示的天文事件。</p>'}</div>${!international ? holidayCoverageMarkup(settings, state.year) : ''}</section>
    </section>

    <aside class="day-sidebar" aria-label="日期详情">
      <section class="day-detail card">
        <div class="detail-heading"><span>日期详情</span><button class="button button--ghost button--icon-only button--sm" data-action="copy-day" aria-label="复制日期详情" title="复制日期详情">${icon('copy')}</button></div>
        <div class="selected-date"><span class="detail-date-number">${pad(day.d)}</span><div><strong>星期${weekdays[day.week]}</strong><span>${html(formatDate(settings, day.y, day.m, day.d))}</span></div><div class="mini-moon" aria-hidden="true"></div></div>
        ${chinese ? `<div class="lunar-date-chip">${html(lunarLabel(day))} <span>${html(day.Lleap)}${day.Lmc}月${day.Ldn > 29 ? '大' : '小'}</span></div>` : ''}
        <dl class="day-facts">${chineseFacts}${showZodiac ? `<div><dt>${chinese ? '星座' : '十二星座'}</dt><dd>${html(day.XiZ)}</dd></div>` : ''}${!chinese ? `<div><dt>日历地区</dt><dd>${html(country)}${american && settings.municipalityCode === 'US-NYC' ? ' · 纽约市' : ''}</dd></div>` : ''}</dl>
        ${traditionalTerm ? `<dl class="day-facts compact"><div><dt>历法节气</dt><dd>${html(traditionalTerm)}</dd></div></dl>` : ''}
        ${selectedHolidays.length ? chinese ? `<div class="festival-block"><span class="eyebrow">节日与纪念日</span><div class="festival-tags">${selectedHolidays.map((holiday) => `<span class="festival-tag" data-holiday-category="${holiday.category}" title="${html(holiday.description)}">${html(holiday.name)}<small class="holiday-category">${HOLIDAY_CATEGORY_LABELS[holiday.category]}</small></span>`).join('')}</div></div>` : `<div class="festival-block local-holiday-details"><span class="eyebrow">节日与当地事项</span>${importantHolidays(selectedHolidays).map((holiday) => holidayDetails(holiday, settings)).join('')}</div>` : international ? '<p class="day-empty-events">这一天没有已启用且已核实的全天事项。</p>' : ''}
        ${!coverage.supported ? `<p class="holiday-coverage">${html(coverage.summary)}</p>` : ''}
        ${selectedEvents.length ? `<div class="selected-events">${selectedEvents.map((event) => `<div class="selected-astronomy-event" data-astronomy-type="${event.type}"><p>${eventIcon(event)}${html(event.name)}<strong title="${html(formatOffset(event.offset))}">${html(formatClock(settings, event.time))}</strong></p>${event.description ? `<small>${html(formatDescription(settings, event.description))}</small>` : ''}${event.sourceUrl ? `<a class="event-source" href="${html(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源</a>` : ''}</div>`).join('')}<small>${html(zoneLabel(settings))}</small></div>` : ''}
        <details class="day-astronomy-details"><summary>${icon('orbit')}天文详情${icon('chevronDown')}</summary><dl class="day-facts compact"><div><dt>儒略日</dt><dd class="mono">${day.d0 + J2000}</dd></div><div><dt>距 J2000</dt><dd class="mono">${day.d0} 日</dd></div></dl></details>
      </section>
      <section class="sun-moon-card card"><div class="section-heading"><h3>${icon('sun')}日月升降</h3><button class="text-button" data-page="9" aria-label="打开日月升降详细计算">详情 ${icon('chevronRight')}</button></div><p class="card-caption">${html(settings.city)} · ${html(zoneLabel(settings))}</p>
        <div class="sun-times"><div><span class="sun-disc sunrise-disc">${icon('rise')}</span><small>日出</small><strong>${html(formatClock(settings, sunMoon.sunrise))}</strong></div><div><span class="sun-disc sunset-disc">${icon('sun')}</span><small>日落</small><strong>${html(formatClock(settings, sunMoon.sunset))}</strong></div></div>
        <dl class="day-facts compact"><div><dt>太阳中天</dt><dd>${html(formatClock(settings, sunMoon.solarNoon))}</dd></div><div><dt>晨起天亮</dt><dd>${html(formatClock(settings, sunMoon.civilDawn))}</dd></div><div><dt>晚上天黑</dt><dd>${html(formatClock(settings, sunMoon.civilDusk))}</dd></div><div><dt>白天时间</dt><dd>${html(sunMoon.lightDuration)}</dd></div><div><dt>月出 / 月落</dt><dd>${html(formatClock(settings, sunMoon.moonrise))} / ${html(formatClock(settings, sunMoon.moonset))}</dd></div><div><dt>月亮中天</dt><dd>${html(formatClock(settings, sunMoon.moonTransit))}</dd></div><div><dt>月面照明</dt><dd>${illumination.toFixed(1)}% <span class="muted">（正午）</span></dd></div></dl>
        ${sunMoon.message ? `<p class="polar-note">${html(sunMoon.message)}</p>` : ''}
      </section>
    </aside>
  </div>`;
}

export function formatOffset(offset: number): string { return formatUTCOffset(offset); }

export function dateSummary(state: AppState, options: { compact?: boolean } = {}): string {
  const settings = state.settings, day = selectedDay(state), chinese = settings.countryCode === 'CN';
  const dayOffset = offsetAtUT(settings, localToUT(settings, day.d0));
  const times = getSunMoon(day.d0 + J2000, settings.longitude, settings.latitude, dayOffset, (ut) => offsetAtUT(settings, ut));
  const events = getMonthEvents(day.y, day.m, settings).filter((event) => event.dayNumber === day.d0);
  const holidays = chinese ? getChinaDayHolidays(day) : getCalendarHolidays(settings, day.y).filter((item) => item.month === day.m && item.day === day.d);
  const coverage = getHolidayCoverage(settings.countryCode, day.y);
  const compact = options.compact === true;
  const culturalDetails = chinese ? [
    `农历 ${day.Lyear3}年 ${lunarLabel(day)}（${day.Ldn > 29 ? '大月' : '小月'}）`,
    `立春纪年 ${day.Lyear2}年；${day.Lmonth2}月 ${day.Lday2}日；黄帝纪年 ${day.Lyear4}年`,
    `回历 ${day.Hyear}年${day.Hmonth}月${day.Hday}日；${day.XiZ}`,
  ] : [`${countryName(settings)}${settings.countryCode === 'US' && settings.municipalityCode === 'US-NYC' ? ' · 纽约市' : ''} · 公历${settings.showZodiac ? `；十二星座 ${day.XiZ}` : ''}`];
  return [
    `寿星天文历 · ${formatDate(settings, day.y, day.m, day.d)} 星期${weekdays[day.week]}`,
    ...culturalDetails,
    `儒略日 ${day.d0 + J2000}；距J2000 ${day.d0}日`,
    `${settings.city} ${zoneLabel(settings)} 日出 ${formatClock(settings, times.sunrise)}；日落 ${formatClock(settings, times.sunset)}；太阳中天 ${formatClock(settings, times.solarNoon)}`,
    compact ? '' : `晨起天亮 ${formatClock(settings, times.civilDawn)}；晚上天黑 ${formatClock(settings, times.civilDusk)}；日照 ${times.daylight}；白天时间 ${times.lightDuration}`,
    `月出 ${formatClock(settings, times.moonrise)}；月落 ${formatClock(settings, times.moonset)}；月亮中天 ${formatClock(settings, times.moonTransit)}`,
    chinese && calendarTerm(day) ? `历法节气 ${calendarTerm(day)}` : '',
    ...events.map((event) => `${event.name} ${formatClock(settings, event.time)}（${formatOffset(event.offset)}）${!compact && event.description ? `；${formatDescription(settings, event.description)}` : ''}${!compact && event.sourceUrl ? `；来源 ${event.sourceUrl}` : ''}`),
    ...holidays.map((holiday) => {
      if (compact) return `${holidayText(holiday)}（全天）`;
      const source = getCalendarEventSource(holiday);
      return `${holidayText(holiday)}（全天）${holiday.observedFor ? `，原节日 ${formatDescription(settings, holiday.observedFor)}` : ''}${holiday.effect || holiday.description ? `；${formatDescription(settings, holiday.effect || holiday.description)}` : ''}${holiday.scope || source?.scope ? `；适用范围：${holiday.scope || source?.scope}` : ''}${holiday.coverageLabel || source?.coverageLabel ? `；资料覆盖：${holiday.coverageLabel || source?.coverageLabel}` : ''}${source?.url ? `；来源：${source.url}` : ''}`;
    }),
    compact ? '' : `${coverage.summary}。${coverage.detail}`,
    ...(compact ? [] : getLocalCalendarCoverage(settings, day.y)).filter((layer) => !layer.available || layer.partial).map((layer) => `${layer.label}：${layer.summary}（${layer.coverageLabel}）`),
  ].filter(Boolean).join('\n');
}
