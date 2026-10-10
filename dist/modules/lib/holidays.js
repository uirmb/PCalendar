import { obb } from '../engine/engine.js';
import { LOCAL_CALENDAR_SOURCES } from '../data/nyc-calendars.js';
import { GLOBAL_HOLIDAYS_2026 } from './global-holidays.js';
export const HOLIDAY_METADATA = {
    checkedAt: '2026-10-06',
    US: {
        fromYear: 1971,
        throughYear: 9999,
        ruleVersion: '5 USC 6103；按已生效规则推算',
        federalScope: '全国性联邦假日；observed 适用于通常周一至周五工作的联邦员工。州、地方及私人雇主的休假安排可能不同。',
        exclusions: '全国规则本身不含州和地方安排；纽约地方日历由独立层组合。未收录华盛顿地区就职日及一次性行政放假。1971 年以前的历史规则未覆盖，未来年份按现有规则推算。',
        culturalScope: '情人节、圣帕特里克节、西方复活节、母亲节、父亲节、万圣节；按当代习惯标注，均不代表联邦休假。',
    },
    CN: {
        officialScheduleYears: [2026],
        traditionalSource: '寿星天文历原农历和节日资料；保留原计算，不把旧国庆节假日或 Fjia 作为官方休班依据。',
        exclusions: '其他年份未载入官方放假调休表；传统节日日期与实际休假安排分开显示。',
    },
    sources: {
        'us-opm': { title: 'OPM Federal Holidays', url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/' },
        'us-code': { title: '5 USC 6103 及生效日期注释', url: 'https://www.govinfo.gov/content/pkg/USCODE-2023-title5/html/USCODE-2023-title5-partIII-subpartE-chap61-subchapI-sec6103.htm' },
        'us-census': { title: 'U.S. Census Bureau Facts for Features series', url: 'https://www.census.gov/newsroom/facts-for-features/fff-series-list.html' },
        'us-observances': { title: '36 USC 109、117：父亲节与母亲节', url: 'https://www.govinfo.gov/content/pkg/USCODE-2023-title36/html/USCODE-2023-title36-subtitleI-partA-chap1.htm' },
        'us-easter': { title: 'U.S. Naval Observatory: The Date of Easter', url: 'https://aa.usno.navy.mil/faq/easter' },
        'cn-2026': { title: '国务院办公厅关于2026年部分节假日安排的通知，国办发明电〔2025〕7号', url: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html', gazetteUrl: 'https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf', issuedAt: '2025-11-04' },
        'sxwnl': { title: '寿星天文历 V5.09 原始节日资料', url: '' },
    },
};
export const HOLIDAY_CATEGORY_LABELS = {
    federal: '公共假日', observed: '补休日', cultural: '文化纪念日', traditional: '历法节日',
    rest: '官方放假', workday: '调休上班', local: '地方日期', school: '公校安排', parking: '停车提醒', commercial: '商业日期',
};
/** 我让地方事件与原有节日共用来源出口，不把来源名称当作放假依据。 */
export function getCalendarEventSource(holiday) {
    const sources = { ...HOLIDAY_METADATA.sources, ...LOCAL_CALENDAR_SOURCES };
    const source = sources[holiday.sourceId];
    if (!source && !holiday.sourceUrl)
        return undefined;
    return { title: source?.title ?? '事件来源', url: holiday.sourceUrl ?? source.url, scope: holiday.scope, coverageLabel: holiday.coverageLabel };
}
export function civilDateKey(year, month, day) {
    const yearText = year < 0 ? `-${String(-year).padStart(4, '0')}` : String(year).padStart(4, '0');
    return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function event(countryCode, year, month, day, id, name, category, sourceId, description, prominent = true) {
    return { id: `${countryCode}:${id}:${civilDateKey(year, month, day)}`, countryCode, date: civilDateKey(year, month, day), year, month, day, name, category, sourceId, description, prominent };
}
/** Date 仅在此作为公历整数运算工具；从不进行当地时区转换。 */
function civilUTC(year, month, day) {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(12, 0, 0, 0);
    return date;
}
function nthWeekday(year, month, weekday, occurrence) {
    return 1 + (weekday - civilUTC(year, month, 1).getUTCDay() + 7) % 7 + 7 * (occurrence - 1);
}
function lastWeekday(year, month, weekday) {
    const last = civilUTC(year, month + 1, 0);
    return last.getUTCDate() - (last.getUTCDay() - weekday + 7) % 7;
}
/** Oudin 的公历教会复活节算法，见 USNO；不是按天文满月时刻转换日期。 */
function westernEaster(year) {
    const int = Math.trunc, century = int(year / 100), golden = year - 19 * int(year / 19);
    const correction = int((century - 17) / 25);
    let epact = century - int(century / 4) - int((century - correction) / 3) + 19 * golden + 15;
    epact -= 30 * int(epact / 30);
    epact -= int(epact / 28) * (1 - int(epact / 28) * int(29 / (epact + 1)) * int((21 - golden) / 11));
    let weekday = year + int(year / 4) + epact + 2 - century + int(century / 4);
    weekday -= 7 * int(weekday / 7);
    const difference = epact - weekday, month = 3 + int((difference + 40) / 44);
    return { month, day: difference + 28 - 31 * int(month / 4) };
}
/** 最早年份为本数据集覆盖起点，不宣称所有这些节日都创设于 1971 年。 */
export const US_FEDERAL_RULES = [
    { id: 'new-year', name: '元旦', fromYear: 1971, month: 1, day: 1 },
    { id: 'mlk', name: '马丁·路德·金纪念日', fromYear: 1986, month: 1, weekday: 1, occurrence: 3 },
    { id: 'washington', name: '华盛顿诞辰日', fromYear: 1971, month: 2, weekday: 1, occurrence: 3 },
    { id: 'memorial', name: '阵亡将士纪念日', fromYear: 1971, month: 5, weekday: 1, occurrence: -1 },
    { id: 'juneteenth', name: '六月节', fromYear: 2021, month: 6, day: 19 },
    { id: 'independence', name: '独立日', fromYear: 1971, month: 7, day: 4 },
    { id: 'labor', name: '劳动节', fromYear: 1971, month: 9, weekday: 1, occurrence: 1 },
    { id: 'columbus', name: '哥伦布日', fromYear: 1971, month: 10, weekday: 1, occurrence: 2 },
    { id: 'veterans', name: '退伍军人节', fromYear: 1971, throughYear: 1977, month: 10, weekday: 1, occurrence: 4 },
    { id: 'veterans', name: '退伍军人节', fromYear: 1978, month: 11, day: 11 },
    { id: 'thanksgiving', name: '感恩节', fromYear: 1971, month: 11, weekday: 4, occurrence: 4 },
    { id: 'christmas', name: '圣诞节', fromYear: 1971, month: 12, day: 25 },
];
function usFederalHolidays(holidayYear) {
    const result = [];
    for (const rule of US_FEDERAL_RULES) {
        if (holidayYear < rule.fromYear || holidayYear > (rule.throughYear ?? 9999))
            continue;
        const day = rule.day ?? (rule.occurrence === -1
            ? lastWeekday(holidayYear, rule.month, rule.weekday)
            : nthWeekday(holidayYear, rule.month, rule.weekday, rule.occurrence));
        const actual = event('US', holidayYear, rule.month, day, rule.id, rule.name, 'federal', 'us-code', HOLIDAY_METADATA.US.federalScope);
        result.push(actual);
        const observed = civilUTC(holidayYear, rule.month, day), weekday = observed.getUTCDay();
        if (weekday !== 0 && weekday !== 6)
            continue;
        observed.setUTCDate(observed.getUTCDate() + (weekday === 6 ? -1 : 1));
        result.push({ ...event('US', observed.getUTCFullYear(), observed.getUTCMonth() + 1, observed.getUTCDate(), `${rule.id}-observed`, `${rule.name}（补休）`, 'observed', 'us-opm', `${actual.date} ${rule.name}的 observed 日期，适用于通常周一至周五工作的联邦员工。`), observedFor: actual.date });
    }
    return result;
}
function usCulturalHolidays(year) {
    if (year < HOLIDAY_METADATA.US.fromYear || year > 9999)
        return [];
    const culture = (month, day, id, name, sourceId = 'us-census') => event('US', year, month, day, id, name, 'cultural', sourceId, '文化或宗教纪念日，不属于全国性联邦休假安排。');
    const easter = westernEaster(year);
    return [
        culture(2, 14, 'valentine', '情人节'), culture(3, 17, 'st-patrick', '圣帕特里克节'),
        culture(easter.month, easter.day, 'easter', '复活节（西方）', 'us-easter'),
        culture(5, nthWeekday(year, 5, 0, 2), 'mother', '母亲节', 'us-observances'),
        culture(6, nthWeekday(year, 6, 0, 3), 'father', '父亲节', 'us-observances'),
        culture(10, 31, 'halloween', '万圣节'),
    ];
}
export const CN_2026_REST_RANGES = [
    { name: '元旦', month: 1, from: 1, to: 3 }, { name: '春节', month: 2, from: 15, to: 23 },
    { name: '清明节', month: 4, from: 4, to: 6 }, { name: '劳动节', month: 5, from: 1, to: 5 },
    { name: '端午节', month: 6, from: 19, to: 21 }, { name: '中秋节', month: 9, from: 25, to: 27 },
    { name: '国庆节', month: 10, from: 1, to: 7 },
];
export const CN_2026_WORKDAYS = [
    { month: 1, day: 4, holiday: '元旦' }, { month: 2, day: 14, holiday: '春节' }, { month: 2, day: 28, holiday: '春节' },
    { month: 5, day: 9, holiday: '劳动节' }, { month: 9, day: 20, holiday: '国庆节' }, { month: 10, day: 10, holiday: '国庆节' },
];
function chinaOfficialSchedule(year) {
    if (year !== 2026)
        return [];
    const result = [];
    for (const range of CN_2026_REST_RANGES) {
        for (let day = range.from; day <= range.to; day++) {
            result.push(event('CN', year, range.month, day, `rest-${range.month}-${day}`, `${range.name}假期`, 'rest', 'cn-2026', `官方放假安排：${range.month}月${range.from}日至${range.to}日，见国办发明电〔2025〕7号。`));
        }
    }
    for (const item of CN_2026_WORKDAYS)
        result.push(event('CN', year, item.month, item.day, `work-${item.month}-${item.day}`, `${item.holiday}调休上班`, 'workday', 'cn-2026', '该日按国务院办公厅 2026 年安排调休上班。'));
    return result;
}
/** US：该民用年内的节日及另列补休日；CN：该年已收录的官方休班表，农历节日通过 getChinaDayHolidays 获取。 */
export function getHolidays(countryCode, year) {
    if (!Number.isInteger(year) || year < -4712 || year > 9999)
        return [];
    let result;
    if (countryCode === 'US') {
        if (year < HOLIDAY_METADATA.US.fromYear)
            return [];
        // 邻年元旦可能在本年 12 月 31 日补休，不能只枚举本年的法定日期。
        result = [year - 1, year, year + 1].flatMap(usFederalHolidays).filter((item) => item.year === year);
        result.push(...usCulturalHolidays(year));
    }
    else if (countryCode === 'CN')
        result = chinaOfficialSchedule(year);
    else {
        const calendar = year === 2026 ? GLOBAL_HOLIDAYS_2026[countryCode] : undefined;
        result = calendar ? calendar.rows.map((row) => ({ ...event(countryCode, year, row.month, row.day, row.id, row.name, row.observed ? 'observed' : 'federal', `global-${countryCode}`, calendar.scope), sourceUrl: calendar.sourceUrl, scope: calendar.scope, coverageLabel: '2026' })) : [];
    }
    return result.sort((a, b) => a.month - b.month || a.day - b.day || a.category.localeCompare(b.category));
}
/** 只读取引擎原对象；旧版固定国庆假日从展示层剔除，原公式和缓存均保持不变。 */
export function getChinaDayHolidays(day) {
    const result = [];
    const seen = new Set();
    for (const [index, value] of [day.A, day.B, day.C].entries()) {
        for (const name of (value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').split(/\s+/).filter(Boolean)) {
            if (seen.has(name) || obb.jqmc.includes(name) || /国庆(?:节)?假日/.test(name))
                continue;
            seen.add(name);
            result.push(event('CN', day.y, day.m, day.d, `traditional-${name}`, name, 'traditional', 'sxwnl', '原版中国历法节日或纪念日；是否放假另见该年的官方休班表。', index < 2));
        }
    }
    result.push(...chinaOfficialSchedule(day.y).filter((item) => item.month === day.m && item.day === day.d));
    return result;
}
export function getHolidayCoverage(countryCode, year) {
    if (countryCode === 'CN') {
        const scheduleAvailable = HOLIDAY_METADATA.CN.officialScheduleYears.includes(year);
        return {
            supported: true, scheduleAvailable,
            summary: scheduleAvailable ? `${year} 年官方放假调休已收录` : `${year <= 0 ? `公元前 ${1 - year}` : year} 年官方放假调休未覆盖`,
            detail: scheduleAvailable ? '“休”“班”依据国务院办公厅当年通知，节日名称沿用原版历法资料。' : '仅显示历法节日；未加载该年官方休班数据，不推断放假或调休。',
            sourceIds: scheduleAvailable ? ['cn-2026', 'sxwnl'] : ['sxwnl'],
        };
    }
    if (countryCode === 'US') {
        const supported = year >= HOLIDAY_METADATA.US.fromYear && year <= 9999;
        return {
            supported, scheduleAvailable: supported,
            summary: supported ? '美国联邦假日与常见文化节日' : '该年美国节日资料未覆盖',
            detail: supported ? '全国联邦假日及其补休适用于相应联邦员工，不代表所有单位放假；按 1971 年起已生效规则推算。文化日期和已收录的纽约地方安排按所选日历层单列，未载入临时公告。' : '本版美国节日规则覆盖 1971 年起；更早年份只显示公历与天文数据。',
            sourceIds: supported ? ['us-opm', 'us-code', 'us-census', 'us-observances', 'us-easter'] : [],
        };
    }
    const global = year === 2026 ? GLOBAL_HOLIDAYS_2026[countryCode] : undefined;
    if (global)
        return { supported: true, scheduleAvailable: true, summary: '2026 公共假日已收录', detail: `${global.scope}。国家内部的州、省、市差异不会自动推断；请以当地主管机关最新公告为准。`, sourceIds: [] };
    return { supported: false, scheduleAvailable: false, summary: '该地区或年份的节日资料尚未覆盖', detail: '当前仍显示公历、季节、月相和当地天文信息；公共假日仅在有明确数据源的年份显示。', sourceIds: [] };
}
