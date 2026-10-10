import { getMonthEvents, monthData } from './calendar-view';
import type { CalendarEvent } from './calendar-view';
import { html, displayYear } from './lib/dom';
import { formatClock, formatDate } from './lib/format';
import { getCalendarEventSource, getHolidayCoverage, HOLIDAY_CATEGORY_LABELS } from './lib/holidays';
import type { HolidayEvent } from './lib/holidays';
import { icon } from './lib/icons';
import { getCalendarHolidays, getLocalCalendarCoverage } from './lib/local-calendars';
import { getCountry, resolveWeekStart } from './lib/regions';
import type { AppState, AppSettings } from './lib/state';
import { dateTimeAt, formatUTCOffset } from './lib/time';

export type YearFilter = 'all' | 'national' | 'local' | 'astronomy';
type EventKind = Exclude<YearFilter, 'all'>;
interface YearEvent {
  year: number; month: number; day: number;
  name: string; kind: EventKind; category: string;
  description: string; scope?: string; sourceUrl?: string; sourceName?: string;
  time?: string; offset?: number;
}

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const filterLabels: Record<YearFilter, string> = { all: '全部事项', national: '全国与文化', local: '地方事项', astronomy: '天文与时钟' };
const kindLabels: Record<EventKind, string> = { national: '全国与文化', local: '地方事项', astronomy: '天文与时钟' };

function holidayEvent(event: HolidayEvent): YearEvent {
  const source = getCalendarEventSource(event);
  const local = ['local', 'school', 'parking'].includes(event.category) || event.layerId?.startsWith('nyc-');
  return {
    year: event.year, month: event.month, day: event.day, name: event.name,
    kind: local ? 'local' : 'national', category: HOLIDAY_CATEGORY_LABELS[event.category],
    description: event.effect || event.description, scope: event.scope,
    sourceUrl: source?.url, sourceName: source?.title,
  };
}

function astronomyEvent(event: CalendarEvent): YearEvent {
  const category = event.type === 'moon' ? '月相' : event.type === 'season' ? '季节转换' : event.type === 'dst' ? '时钟调整' : '节气';
  return {
    year: event.year, month: event.month, day: event.day, name: event.name,
    kind: 'astronomy', category, description: event.description ?? '天文瞬间按事件发生时的地区时区转换为当地日期与时刻。',
    time: event.time, offset: event.offset, sourceUrl: event.sourceUrl,
  };
}

function eventTime(settings: AppSettings, event: YearEvent): string {
  return event.time ? `${formatClock(settings, event.time)} ${formatUTCOffset(event.offset!)}` : '全天';
}

function descriptionText(settings: AppSettings, text: string): string {
  return text.replace(/(?<![\d:+−-])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/g, (value) => formatClock(settings, value));
}

function miniMonth(state: AppState, month: number, events: YearEvent[]): string {
  const { settings, year } = state, data = monthData(year, month), start = resolveWeekStart(settings);
  const today = dateTimeAt(settings), first = data.days[0];
  const leading = ((first.week - start) % 7 + 7) % 7;
  const empty = '<span class="year-day-empty" aria-hidden="true"></span>';
  const days = data.days.map((day) => {
    const items = events.filter((event) => event.day === day.d), kinds = [...new Set(items.map((item) => item.kind))];
    const isToday = year === today.year && month === today.month && day.d === today.day;
    const selected = month === state.month && day.d === state.selectedDay;
    const label = `${formatDate(settings, year, month, day.d)}，星期${weekdays[day.week]}${items.length ? `，${items.map((item) => `${item.name} · ${item.category} · ${eventTime(settings, item)}`).join('；')}` : ''}`;
    return `<button type="button" class="year-day${day.week === 0 || day.week === 6 ? ' is-weekend' : ''}${isToday ? ' is-today' : ''}${selected ? ' is-selected' : ''}" data-calendar-date="${year},${month},${day.d}" data-open-calendar aria-label="${html(label)}" title="${html(label)}"${isToday ? ' aria-current="date"' : ''}>
      <span>${day.d}</span><span class="year-day-dots" aria-hidden="true">${kinds.map((kind) => `<i class="year-kind-${kind}"></i>`).join('')}</span>
    </button>`;
  }).join('');
  return `<section class="year-month" aria-label="${html(`${displayYear(year)} 年 ${month} 月`)}">
    <button class="year-month-title" data-calendar-date="${year},${month},${first.d}" data-open-calendar><strong>${month}<small>月</small></strong><span>${events.length ? `${events.length} 项` : '查看月份'} ${icon('chevronRight')}</span></button>
    <div class="year-weekdays">${Array.from({ length: 7 }, (_, index) => `<span>${weekdays[(start + index) % 7]}</span>`).join('')}</div>
    <div class="year-month-days">${empty.repeat(leading)}${days}${empty.repeat(42 - leading - data.days.length)}</div>
  </section>`;
}

function eventRow(state: AppState, event: YearEvent): string {
  const { settings } = state;
  const date = formatDate(settings, event.year, event.month, event.day), time = eventTime(settings, event);
  const description = descriptionText(settings, event.description);
  const label = `${date}，${event.name}，${event.category}，${time}`;
  return `<li class="year-event year-kind-${event.kind}" data-year-event-kind="${event.kind}">
    <button class="year-event-link" data-calendar-date="${event.year},${event.month},${event.day}" data-open-calendar aria-label="${html(label)}"><span class="year-event-date">${html(date)}</span><span class="year-event-name">${html(event.name)}<small>${html(event.category)}</small></span><time>${html(time)}</time></button>
    <details class="year-event-description"><summary>适用范围与说明</summary>${event.scope ? `<p>${html(event.scope)}</p>` : ''}<p>${html(description)}</p>${event.sourceUrl ? `<a href="${html(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">${html(event.sourceName || '查看来源')}</a>` : ''}</details>
  </li>`;
}

/** 公历全年视图；民用节日保持日期，天文事件复用月历的逐事件时区转换。 */
export function renderYearCalendar(state: AppState, filter: YearFilter = 'all'): string {
  const { year, settings } = state;
  const holidays = getCalendarHolidays(settings, year), coverage = getLocalCalendarCoverage(settings, year);
  const baseCoverage = getHolidayCoverage(settings.countryCode, year);
  const events = [
    ...holidays.map(holidayEvent),
    ...Array.from({ length: 12 }, (_, index) => getMonthEvents(year, index + 1, settings)).flat().map(astronomyEvent),
  ].sort((a, b) => a.month - b.month || a.day - b.day || Number(Boolean(a.time)) - Number(Boolean(b.time)) || (a.time ?? '').localeCompare(b.time ?? '') || a.name.localeCompare(b.name));
  const shown = filter === 'all' ? events : events.filter((event) => event.kind === filter);
  const count = (kind: EventKind): number => events.filter((event) => event.kind === kind).length;
  const country = getCountry(settings.countryCode)?.name ?? settings.countryCode;
  const missing = coverage.filter((item) => !item.available || item.partial);
  const notices = [
    ...missing.map((item) => `<p class="year-coverage-notice" data-coverage-layer="${html(item.id)}"><strong>${html(item.label)}：${item.available ? '部分覆盖' : '未覆盖'}</strong><span>${html(item.summary)}</span></p>`),
    ...(!baseCoverage.supported && !coverage.length ? [`<p class="year-coverage-notice"><strong>节日资料未覆盖</strong><span>${html(baseCoverage.summary)}</span></p>`] : []),
  ].join('');
  const monthlyLists = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1, items = shown.filter((event) => event.month === month);
    return `<details class="year-event-month"${month === state.month ? ' open' : ''}><summary><strong>${month} 月</strong><span>${items.length} 项 ${icon('chevronDown')}</span></summary>${items.length ? `<ol class="year-events">${items.map((event) => eventRow(state, event)).join('')}</ol>` : `<p class="year-events-empty">当前筛选与已收录资料中没有事项。</p>`}</details>`;
  }).join('');
  return `<div class="year-workspace" data-year-filter-current="${filter}">
    <section class="year-heading"><div><span class="eyebrow">全年一览</span><h1>${html(displayYear(year))}<span>年</span></h1><p>${html(country)} · ${html(settings.city)} · 公历年历</p></div><div class="year-toolbar"><button class="button button--secondary" data-action="prev-year" aria-label="上一年"${year <= -4712 ? ' disabled' : ''}>${icon('chevronLeft')}</button><button class="button button--secondary" data-action="today">今年</button><button class="button button--secondary" data-action="next-year" aria-label="下一年"${year >= 9999 ? ' disabled' : ''}>${icon('chevronRight')}</button><button class="button button--secondary" data-action="open-date">${icon('calendar')}跳转日期</button></div></section>
    <div class="year-summary">${(['national', 'local', 'astronomy'] as const).map((kind) => `<button type="button" class="year-summary-item year-kind-${kind}${filter === kind ? ' is-active' : ''}" data-year-filter="${kind}" aria-pressed="${filter === kind}"><span>${kindLabels[kind]}</span><strong>${count(kind)}</strong><small>项已收录事项</small></button>`).join('')}</div>
    <div class="year-filters" role="group" aria-label="全年事项筛选">${(Object.keys(filterLabels) as YearFilter[]).map((value) => `<button class="button button--secondary${filter === value ? ' is-active' : ''}" data-year-filter="${value}" aria-pressed="${filter === value}">${filterLabels[value]}</button>`).join('')}<span>日期下的圆点对应已筛选事项；点击日期打开月历。</span></div>
    ${notices ? `<aside class="year-coverage-notices" aria-label="资料覆盖提示">${notices}</aside>` : ''}
    <div class="year-month-grid">${Array.from({ length: 12 }, (_, index) => miniMonth(state, index + 1, shown.filter((event) => event.month === index + 1))).join('')}</div>
    <section class="year-overview"><div class="year-section-heading"><div><h2>全年事件总览</h2><p>${html(filterLabels[filter])} · ${shown.length} 项。展开月份查看日期、当地时刻与适用范围。</p></div></div><div class="year-event-months">${monthlyLists}</div></section>
    <details class="year-sources"><summary>地区资料与历法说明</summary><p>全天节日属于当地民用日期，不做时区换日；月相、季节与时钟调整按事件当时的地区时区显示。各类事项有不同适用范围，文化、学校及停车安排均不代表全民休假。</p><p>历史日期沿用原版混合历法：1582 年 10 月 4 日之后为 10 月 15 日；更早日期按原版儒略历规则排列。</p>${coverage.map((item) => `<div><strong>${html(item.label)} · ${html(item.coverageLabel)}</strong><p>${html(item.scope)} ${html(item.summary)}</p>${item.sourceUrl ? `<a href="${html(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看资料来源</a>` : ''}</div>`).join('')}${!coverage.length ? `<p>${html(baseCoverage.summary)} ${html(baseCoverage.detail)}</p>` : ''}</details>
    ${year === 1582 ? '<p class="year-history-note">本年沿用原版改历边界：10 月 4 日之后直接进入 10 月 15 日。</p>' : ''}
  </div>`;
}
