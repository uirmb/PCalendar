import { legacyFixed, JD, J2000, HXK, xz88, schHXK, getHXK, hxCalc, dt_T, XL, rad2str, rad2mrad, daJu, xingHY, xingHR, xingLiu, xxName, cs_xxHH, xingX, SZJ, sunShengJ, pty_zty, m2fm, XL1_calc, obb, } from '../engine/engine.js';
import { FeatureDOM, year2Ayear, Ayear2year, timeStr2hour, escapeHTML } from './dom.js';
import { FeatureTime } from './time.js';
import { localizedYearReport } from './year-report.js';
import { getSeasonEvents } from '../lib/astronomy-events.js';
import { formatUTCOffset } from '../lib/time.js';
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
export class Calculations {
    dom;
    context;
    time;
    constructor(dom, context) {
        this.dom = dom;
        this.context = context;
        this.time = new FeatureTime(context);
    }
    julian(prefix, withTime = true) {
        const d = this.dom;
        return JD.JD(year2Ayear(d.value(`${prefix}_y`)), d.number(`${prefix}_m`), d.number(`${prefix}_d`)
            + (withTime ? timeStr2hour(d.value(`${prefix}_t`)) / 24 : 0)) - J2000;
    }
    localToTD(jd) { return this.time.localToTD(jd); }
    getNianLi(offset = 0) {
        const d = this.dom, year = year2Ayear(d.value('Cp2_y')) + offset;
        d.set('Cp2_y', Ayear2year(year));
        d.html('Cal7', `<article class="feature-year"><h3>${Ayear2year(year)} 年</h3>${localizedYearReport(year, d.checked('Cp2_tg'), this.time)}</article>`);
    }
    getNianLiN() {
        const d = this.dom, year = year2Ayear(d.value('Cp2_y')), count = d.count('Cp2_n', 500);
        const result = [];
        for (let i = 0; i < count; i++)
            result.push(`<article class="feature-year"><h3>${Ayear2year(year + i)} 年</h3>${localizedYearReport(year + i, d.checked('Cp2_tg'), this.time)}</article>`);
        d.html('Cal7', result.join(''));
    }
    initializeStarLibrary() {
        const select = this.dom.element('Cf_xk');
        select.replaceChildren();
        for (let i = 0; i < HXK.length; i++) {
            const text = HXK[i];
            select.add(new Option(text.slice(0, text.indexOf('#')), String(i)));
        }
        for (let i = 0; i < xz88.length; i += 5)
            select.add(new Option(String(xz88[i]).slice(0, 3), String(i + 1000)));
        this.showHXK(0);
    }
    showHXK(index) {
        let catalog = '';
        if (index < 100) {
            const data = HXK[index];
            if (!data)
                return;
            catalog = data.slice(data.indexOf('#'));
        }
        else if (index >= 1000)
            catalog = schHXK(String(xz88[index - 1000]).slice(3, 6));
        this.dom.set('Cf_db', '   RA(时分秒)   DEC(度分秒)   自行1  自行2  视差  星等  星名  星座' + catalog.replace(/#/g, '\r\n'));
    }
    aCalc() {
        const d = this.dom;
        let jd = this.julian('Cf');
        if (d.checked('Cf_ut'))
            jd = this.localToTD(jd);
        const interval = d.number('Cf_dt'), count = d.count('Cf_n');
        const shortPeriod = d.checked('Cf_nsn') ? 35 : 0, coordinate = d.number('Cf_lx');
        const longitude = d.number('Cf_J') * DEG, latitude = d.number('Cf_W') * DEG;
        const catalog = getHXK(d.value('Cf_db'), 0), result = [];
        for (let i = 0; i < count; i++, jd += interval) {
            result.push(`当地时 ${this.time.formatTD(jd)} ${this.time.tdZoneText(jd)}\r\n`);
            result.push(hxCalc(jd / 36525, catalog, shortPeriod, coordinate, longitude, latitude));
        }
        d.set('Cf_xl', result.join(''));
    }
    eventTime(time) {
        const td = time * 36525;
        return JD.JD2str(td + J2000) + ' TD　' + this.time.formatTD(td) + ' 当地时 ' + this.time.tdZoneText(td) + '　';
    }
    tianXiang(event, planet) {
        const d = this.dom, count = d.count('Ce_n');
        let time = this.julian('Ce', false) / 36525;
        let result = '';
        let solver;
        let interval = 0;
        let format;
        if (event === 14 || event === 15) {
            result = `${xxName[planet]}${event === 14 ? '顺留' : '逆留'}\r\n留时间(TD / 当地时)\r\n`;
            for (let i = 0; i < count; i++) {
                const eventTime = xingLiu(planet, time, event === 14 ? 1 : 0);
                result += this.eventTime(eventTime) + '\r\n';
                time = eventTime + cs_xxHH[planet - 1] / 36525;
            }
            d.set('Ce_tab', result);
            return;
        }
        if (event === 1 || event === 2) {
            solver = (t) => XL.moonMinR(t, event === 1 ? 1 : 0);
            interval = 27.555;
            format = (r) => legacyFixed(r[1], 2) + '千米';
        }
        else if (event === 3 || event === 4) {
            solver = (t) => XL.moonNode(t, event === 3 ? 1 : 0);
            interval = 27.555;
            format = (r) => rad2str(rad2mrad(r[1]), 0);
        }
        else if (event === 5 || event === 6) {
            solver = (t) => XL.earthMinR(t, event === 5 ? 1 : 0);
            interval = 365.259636;
            format = (r) => legacyFixed(r[1], 8) + ' AU';
        }
        else if (event >= 7 && event <= 10) {
            const body = event <= 8 ? 1 : 2, east = event === 7 || event === 9;
            solver = (t) => daJu(body, t, east ? 1 : 0);
            interval = body === 1 ? 115.8774777586 : 583.9213708245;
            format = (r) => legacyFixed((r[1] / DEG), 5) + '度';
        }
        else if (event === 11) {
            solver = (t) => xingHY(planet, t);
            interval = 28;
            result = '合月时间(TD / 当地时) 星月赤纬差(小于1度可能月掩星,由视差决定)\r\n';
            format = (r) => legacyFixed((-r[1] / DEG), 5) + '度';
        }
        else if (event === 12 || event === 13) {
            solver = (t) => xingHR(planet, t, event === 12 ? 0 : 1);
            interval = cs_xxHH[planet - 1];
            result = `${xxName[planet]}${event === 12 ? '合日(地内行星上合)' : '冲日(地内行星下合)'}\r\n黄经合/冲日时间(TD / 当地时) 星日赤纬差\r\n`;
            format = (r) => legacyFixed((-r[1] / DEG), 5) + '度';
        }
        else
            throw new Error('未知天象计算类型。');
        for (let i = 0; i < count; i++) {
            const row = solver(time);
            result += this.eventTime(row[0]) + format(row) + '\r\n';
            time = row[0] + interval / 36525;
        }
        d.set('Ce_tab', result);
    }
    pCalc() {
        const d = this.dom;
        let jd = this.julian('Cd');
        if (d.checked('Cd_ut'))
            jd = this.localToTD(jd);
        const body = d.number('Cd_xt'), interval = d.number('Cd_dt'), count = d.count('Cd_n', 1000);
        const longitude = d.number('Cd_J') * DEG, latitude = d.number('Cd_W') * DEG;
        let result = '';
        for (let i = 0; i < count; i++, jd += interval) {
            const jde = jd + J2000;
            result += JD.JD2str(jde) + 'TD, JED = ' + legacyFixed(jde, 7) + ' \r\n';
            result += `当地时 ${this.time.formatTD(jd)} ${this.time.tdZoneText(jd)}\r\n`;
            result += xingX(body, jd, longitude, latitude) + '\r\n';
        }
        d.set('Cd_tab', result);
    }
    shengjiang() {
        const d = this.dom;
        SZJ.L = d.number('Cp9_J') * DEG;
        SZJ.fa = d.number('Cp9_W') * DEG;
        const jd = this.julian('Cp9', false) + 0.5, localSolar = SZJ.L / TWO_PI;
        const solar = SZJ.St(jd - localSolar), moon = SZJ.Mt(jd - localSolar);
        const rows = [
            ['太阳升起', solar.s, '太阳降落', solar.j], ['日上中天', solar.z, '日下中天', solar.x],
            ['民用天亮', solar.c, '民用天黑', solar.h], ['航海天亮', solar.c2, '航海天黑', solar.h2],
            ['天文天亮', solar.c3, '天文天黑', solar.h3], ['月亮升起', moon.s, '月亮降落', moon.j], ['月上中天', moon.z, '月下中天', moon.x],
        ];
        const clock = (ut) => `${this.time.formatUT(ut)} <small>${this.time.zoneText(ut)}</small>`;
        const content = rows.map(([title1, time1, title2, time2]) => `<tr><th>${title1}</th><td>${clock(time1)}</td><th>${title2}</th><td>${clock(time2)}</td></tr>`).join('');
        d.html('Cp9_out', '<h3>日月升降 · 当地时间</h3><div class="feature-table-wrap"><table><tbody>' + content + '</tbody></table></div>'
            + `<p>日照长度 ${JD.timeStr(solar.j - solar.s - 0.5)}　日光长度 ${JD.timeStr(solar.h - solar.c - 0.5)}</p>`
            + (solar.sm ? `<p class="feature-note">注：${escapeHTML(solar.sm)}</p>` : ''));
    }
    shengjiang2() {
        const d = this.dom, longitude = d.number('Cp9_J') * DEG, latitude = d.number('Cp9_W') * DEG;
        const start = JD.JD(year2Ayear(d.value('Cp9_y')), 1, 1.5) - J2000;
        const rows = [];
        const clock = (ut) => ut === 0 ? '—（无升降事件）' : `${this.time.formatUT(ut)} <small>${this.time.zoneText(ut)}</small>`;
        for (let i = 0; i < 368; i++) {
            const rise = sunShengJ(start + i, longitude, latitude, -1);
            const set = sunShengJ(start + i, longitude, latitude, 1);
            rows.push(`<tr><td>${JD.JD2str(start + i + J2000).slice(0, 11)}</td><td>${clock(rise)}</td><td>${clock(set)}</td></tr>`);
        }
        d.html('Cp9_out', '<h3>太阳年度升降表 · 当地时间</h3><p class="feature-note">保留原版从元旦起连续 368 日的计算范围，日出和日落分别按实际事件日期解析所选地区时区。</p><table><thead><tr><th>计算日</th><th>日出（当地日期与时刻）</th><th>日落（当地日期与时刻）</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>');
    }
    shengjiang3() {
        const d = this.dom, start = JD.JD(year2Ayear(d.value('Cp9_y')), 1, 1.5), rows = [];
        for (let i = 0; i < 368; i++) {
            let td = this.time.localToUT(start + i - J2000);
            td += dt_T(td);
            const difference = pty_zty(td / 36525);
            rows.push(`<tr><td>${JD.JD2str(start + i).slice(0, 11)}</td><td>${m2fm(difference * 86400, 2, 2)}</td></tr>`);
        }
        d.html('Cp9_out', '<h3>太阳时差表</h3><p class="feature-note">所选地区当地时间每日 12 点，连续 368 日；时差是天文量，按该历元计算。</p><table><thead><tr><th>当地日期</th><th>真太阳时 − 平太阳时</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>');
    }
    suoCalc(angle) {
        const d = this.dom;
        if (angle === -1)
            angle = d.number('Cp8_angle');
        const year = year2Ayear(d.value('Cp8_y')) - 2000, count = d.count('Cp8_n');
        const initial = Math.floor(year * (365.2422 / 29.53058886));
        const rows = [];
        for (let i = 0; i < count; i++) {
            const t = XL.MS_aLon_t((initial + i + angle / 360) * TWO_PI);
            const distance = XL1_calc(2, t, -1);
            rows.push(`<tr><td>${this.time.formatTD(t * 36525)} <small>${this.time.tdZoneText(t * 36525)}</small></td><td>${legacyFixed(distance, 2)} 千米</td></tr>`);
        }
        d.html('Cp8_out', `<h3>月日黄经差 ${angle}° · 当地时间</h3><table><thead><tr><th>当地日期与时刻</th><th>地月距离</th></tr></thead><tbody>${rows.join('')}</tbody></table>`);
    }
    qiCalc() {
        const d = this.dom, year = year2Ayear(d.value('Cp8_y')) - 2000, count = d.count('Cp8_n'), rows = [];
        for (let i = 0; i < count; i++) {
            const t = XL.S_aLon_t((year + i * 15 / 360 + 1) * TWO_PI);
            rows.push(`<tr><td>${obb.jqmc[(i + 6) % 24]}</td><td>${this.time.formatTD(t * 36525)} <small>${this.time.tdZoneText(t * 36525)}</small></td><td>${i * 15}°</td></tr>`);
        }
        d.html('Cp8_out', '<h3>定气 · 当地时间</h3><table><thead><tr><th>节气</th><th>当地日期与时刻</th><th>视黄经</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>');
    }
    seasonCalc() {
        const year = year2Ayear(this.dom.value('Cp8_y'));
        const events = getSeasonEvents(year, (ut) => this.time.offsetAt(ut));
        const rows = events.map((event) => `<tr><td>${escapeHTML(event.name)}</td><td>${escapeHTML(this.time.formatUT(event.utcJ2000))}</td><td>${escapeHTML(formatUTCOffset(event.offset))}</td></tr>`).join('');
        this.dom.html('Cp8_out', `<h3>${Ayear2year(year)} 年 · 北半球四季转换</h3><p class="feature-note">天文季节由太阳视黄经确定，所有时刻按所选地区显示；南半球季节相反。</p><table><thead><tr><th>季节</th><th>当地日期与时刻（24 小时制）</th><th>事件时区</th></tr></thead><tbody>${rows}</tbody></table><p class="feature-note"><a href="${escapeHTML(events[0]?.sourceUrl ?? '')}" target="_blank" rel="noopener noreferrer">USNO：天文季节定义</a>；精确时刻沿用原天文算法。</p>`);
    }
    houCalc() {
        const d = this.dom, year = year2Ayear(d.value('Cp8_y')) - 2000, count = d.count('Cp8_n'), rows = [];
        for (let i = 0; i < count; i++) {
            let row = `<tr><th>${obb.jqmc[(i + 6) % 24]}</th>`;
            for (let phase = 0; phase < 3; phase++) {
                const t = XL.S_aLon_t((year + (i * 3 + phase) * 5 / 360 + 1) * TWO_PI);
                row += `<td>${this.time.formatTD(t * 36525)} <small>${this.time.tdZoneText(t * 36525)}</small></td>`;
            }
            rows.push(row + '</tr>');
        }
        d.html('Cp8_out', '<h3>定候 · 当地时间</h3><div class="feature-table-wrap"><table><thead><tr><th>节气</th><th>初候</th><th>二候</th><th>三候</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
    }
    ML_calc() {
        const d = this.dom, year = year2Ayear(d.value('Cml_y')), month = d.number('Cml_m'), day = d.number('Cml_d');
        const time = timeStr2hour(d.value('Cml_his'));
        const jd = JD.JD(year, month, day + time / 24);
        const result = { bz_jn: '', bz_jy: '', bz_jr: '', bz_js: '', bz_zty: '', bz_JS: '' };
        obb.mingLiBaZi(this.time.localToUT(jd - J2000), d.number('Cp11_J') * DEG, result);
        d.html('Cal6', `<div class="feature-bazi">${['bz_jn', 'bz_jy', 'bz_jr', 'bz_js'].map((key, i) => `<div><span>${['年柱', '月柱', '日柱', '时柱'][i]}</span><strong>${result[key]}</strong></div>`).join('')}</div>`
            + `<p>公历 ${Ayear2year(year)}-${month}-${day}　儒略日数 ${Math.floor(jd + 0.5)}　距 2000 年首 ${Math.floor(jd + 0.5 - J2000)} 日</p>`
            + `<p>真太阳时 <strong>${result.bz_zty}</strong></p><div class="feature-table-wrap"><p>${result.bz_JS}</p><p>时标　23　01　03　05　07　09　11　13　15　17　19　21　23</p></div>`);
    }
    ML_settime() {
        const local = this.time.utToLocal(Date.now() / 86400000 - 10957.5);
        const formatted = JD.JD2str(local + J2000);
        this.dom.set('Cml_y', Number(formatted.slice(0, 5)));
        this.dom.set('Cml_m', formatted.slice(6, 8));
        this.dom.set('Cml_d', formatted.slice(9, 11));
        this.dom.set('Cml_his', formatted.slice(12, 20));
        this.ML_calc();
    }
}
