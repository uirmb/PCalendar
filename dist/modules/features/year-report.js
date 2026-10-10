import { JD, J2000, SSQ, obb } from '../engine/engine.js';
import { FeatureTime } from './time.js';
/** 我保留 SSQ 的中国农历月序、历日和干支，只单独转换精确朔气的显示时刻。 */
export function localizedYearReport(year, showTime, time) {
    SSQ.calcY(Math.floor((year - 2000) * 365.2422 + 180));
    const clock = (beijing, assignedDay) => {
        const local = time.beijingToLocal(beijing), ut = beijing - 8 / 24;
        const formatted = JD.JD2str(local + J2000);
        const dateShift = Math.floor(local + 0.5) - Math.floor(beijing + 0.5);
        const historicalDifference = Math.floor(beijing + 0.5) !== assignedDay;
        const flag = dateShift ? `<span class="feature-date-shift">相对北京时间 ${dateShift > 0 ? '+' : ''}${dateShift} 日</span>` : '';
        return `<span class="feature-local-event${historicalDifference ? ' feature-historical-difference' : ''}" data-ut="${ut}">${showTime ? formatted : formatted.slice(0, 11)} <small>${time.zoneText(ut)}</small></span>${flag}`;
    };
    const date = (day) => JD.JD2str(day + J2000).slice(0, 11);
    const ganzhi = (day) => {
        const absolute = day + J2000;
        return String(obb.Gan[((absolute + 9) % 10 + 10) % 10]) + String(obb.Zhi[((absolute + 1) % 12 + 12) % 12]);
    };
    const months = [];
    for (let i = 0; i < 14; i++) {
        if (SSQ.HS[i + 1] > SSQ.ZQ[24])
            break;
        const start = SSQ.HS[i], end = SSQ.HS[i + 1];
        let name = `${SSQ.leap && i === SSQ.leap ? '闰' : ''}${SSQ.ym[i]}`;
        if (!name.endsWith('月'))
            name += '月';
        name += SSQ.dx[i] > 29 ? '大' : '小';
        let content = `<tr><th>定朔</th><td>${date(start)}${showTime ? '' : ` ${ganzhi(start)}`}</td><td>${clock(obb.so_accurate2(start), start)}</td></tr>`;
        for (let j = -2; j < 24; j++) {
            const qi = j === -2 ? SSQ.ZQ.pe2 : j === -1 ? SSQ.ZQ.pe1 : SSQ.ZQ[j];
            if (qi < start || qi >= end)
                continue;
            const lunarDate = showTime ? '' : ` ${obb.rmc[qi - start]} ${ganzhi(qi)}`;
            content += `<tr><th>${obb.jqmc[(j + 24) % 24]}</th><td>${date(qi)}${lunarDate}</td><td>${clock(obb.qi_accurate2(qi), qi)}</td></tr>`;
        }
        months.push(`<section class="feature-year-month" data-lunar-month="${SSQ.ym[i]}" data-leap="${SSQ.leap && i === SSQ.leap ? '1' : '0'}" data-days="${SSQ.dx[i]}" data-calendar-day="${start}"><h4>${name}</h4><div class="feature-table-wrap"><table><thead><tr><th>天象</th><th>中国农历历日（北京日界）</th><th>所选地区${showTime ? '日期与时刻' : '日期'}</th></tr></thead><tbody>${content}</tbody></table></div></section>`);
    }
    return '<p class="feature-note">农历排月、历日和干支按中国历法保留；天象日期与时刻按所选地区转换，包含对应日期的夏令时。红色时刻表示精确天象的北京日期与历史历日不同。</p>' + months.join('');
}
