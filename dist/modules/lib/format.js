import { uses12HourClock } from './regions.js';
import { displayYear, pad } from './dom.js';
/** 我只格式化钟表时刻；日照长度等持续时间继续使用原始时长。 */
export function formatClock(settings, value, includeSeconds = true) {
    if (value.includes(' / '))
        return value.split(' / ').map((time) => formatClock(settings, time, includeSeconds)).join(' / ');
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(.*)$/);
    if (!match)
        return value;
    const hour = Number(match[1]);
    if (hour > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59)
        return value;
    const twelve = uses12HourClock(settings);
    const periods = { 'zh-CN': ['上午', '下午'], 'zh-TW': ['上午', '下午'], 'en-US': ['AM', 'PM'], 'pt-BR': ['AM', 'PM'], 'ja-JP': ['午前', '午後'], 'ko-KR': ['오전', '오후'], 'es-ES': ['a. m.', 'p. m.'], 'fr-FR': ['AM', 'PM'], 'de-DE': ['AM', 'PM'] };
    const period = periods[settings.locale] ?? periods['en-US'];
    const prefix = twelve ? `${hour < 12 ? period[0] : period[1]} ` : '';
    const time = `${pad(twelve ? hour % 12 || 12 : hour)}:${match[2]}${includeSeconds && match[3] ? `:${match[3]}` : ''}`;
    return `${prefix}${time}${match[4]}`;
}
/** 我让数字日期遵循独立偏好，中文菜单不随地区自动切换语言。 */
export function formatDate(settings, year, month, day) {
    const format = settings.dateFormat && settings.dateFormat !== 'auto' ? settings.dateFormat : settings.countryCode === 'US' ? 'mdy' : 'ymd';
    const y = displayYear(year), m = pad(month), d = pad(day);
    if (format === 'mdy')
        return `${m}/${d}/${y}`;
    if (format === 'dmy')
        return `${d}/${m}/${y}`;
    return `${y}.${m}.${d}`;
}
