import { legacyFixed,
  JD, J2000, dt_T, XL, msc, rad2mrad, j1_j2, rad, m2fm, rsPL, ysPL, rsGS, ecFast, rad2str2,
} from '../engine/engine';
import { FeatureDOM, year2Ayear } from './dom';
import { Calculations } from './calculations';
import { createDrawings } from './graphics';
import type { EclipseBoundaries, EclipseFeature, EclipseShadow, FeatureContext } from './types';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

export class EclipseCalculations {
  private readonly drawings = createDrawings();
  private boundaries: EclipseBoundaries | null = null;

  constructor(private readonly dom: FeatureDOM, private readonly context: FeatureContext,
    private readonly basic: Calculations, private readonly navigate: (page: number) => void) {}

  private setDate(prefix: string, jd: number, includeTime = true): void {
    const time: string = JD.JD2str(jd + J2000);
    this.dom.set(`${prefix}_y`, Number(time.slice(0, 5)));
    this.dom.set(`${prefix}_m`, time.slice(6, 8)); this.dom.set(`${prefix}_d`, time.slice(9, 11));
    if (includeTime) this.dom.set(`${prefix}_t`, time.slice(12, 20));
  }

  zb_calc(): void {
    if (this.dom.checked('Cal_pause')) return;
    let jd = Date.now() / 86400000 - 10957.5;
    jd += dt_T(jd);
    msc.calc(jd, this.dom.number('Cb_J') * DEG, this.dom.number('Cb_W') * DEG, 0);
    this.dom.html('Cal_zb', msc.toHTML(0));
  }

  zxsCopy(longitude: number, latitude: number): void {
    this.dom.set('Cb_J', longitude); this.dom.set('Cb_W', latitude); this.tu_calc(2);
  }

  tu_calc(mode: number): void {
    const d = this.dom, { tu1 } = this.drawings;
    tu1.init(d.element<HTMLCanvasElement>('Can1')); tu1.showzb();
    const longitude = d.number('Cb_J') * DEG, latitude = d.number('Cb_W') * DEG, height = d.number('Cb_high');
    let jd = this.basic.julian('Cb');
    if (mode === 0) { jd = this.basic.time.utToLocal(Date.now() / 86400000 - 10957.5); d.check('Cb_ut', true); }
    if (mode === 1) jd -= d.number('Cb_step') / 86400;
    if (mode === 3) jd += d.number('Cb_step') / 86400;
    if (mode === 4 || mode === 7) jd -= 29.53;
    if (mode === 6 || mode === 9) jd += 29.53;
    if (mode >= 4 && mode <= 6) jd = XL.MS_aLon_t2(Math.floor((jd + 8) / 29.5306) * TWO_PI) * 36525;
    if (mode >= 7 && mode <= 9) jd = XL.MS_aLon_t2(Math.floor((jd - 4) / 29.5306) * TWO_PI + Math.PI) * 36525;
    if (mode >= 4 && mode <= 9 && d.checked('Cb_ut')) jd = this.basic.time.tdToLocal(jd);
    this.setDate('Cb', jd);
    if (d.checked('Cb_ut')) jd = this.basic.localToTD(jd);
    msc.calc(jd, longitude, latitude, height);
    d.html('Cal_zb', msc.toHTML(1));
    if (d.checked('Cb_sjzb')) {
      tu1.draw1b('sun', msc.sCJ, msc.sCW, msc.gst); tu1.draw1b('moon', msc.mCJ, msc.mCW, msc.gst);
    } else {
      tu1.draw1('sun', msc.sPJ, msc.sPW, d.checked('Cb_bei')); tu1.draw1('moon', msc.mPJ, msc.mPW, d.checked('Cb_bei'));
    }
    const phase = rad2mrad(msc.mHJ - msc.sHJ);
    if (phase < 3 * DEG || phase > 357 * DEG) {
      const j1 = msc.mCJ2, w1 = msc.mCW2, j2 = msc.sCJ2, w2 = msc.sCW2;
      const sr = msc.sRad, mr = msc.mRad;
      const distance = j1_j2(j1, w1, j2, w2) * rad, radiusSum = mr + sr;
      tu1.draw2a(j1, w1, j2, w2, mr, sr); tu1.draw3(msc.zx_J, msc.zx_W, d.checked('Cb_phSave'));
      let center = '此刻月亮本影中心线不经过地球。';
      if (msc.zx_W !== 100) {
        const j = legacyFixed((msc.zx_J * RAD_TO_DEG), 5), w = legacyFixed((msc.zx_W * RAD_TO_DEG), 5);
        center = `食中心地标：经 ${j}　纬 ${w} <button class="feature-inline-button" data-action="zxsCopy" data-longitude="${j}" data-latitude="${w}">在此地计算</button>`;
      }
      d.html('Cb_zb', `日月站心视半径 ${m2fm(sr, 2, 0)} 及 ${m2fm(mr, 2, 0)}<br>${center}<br>`
        + `日月中心视距 ${m2fm(distance, 2, 0)}　日月半径和 ${m2fm(radiusSum, 2, 0)}　半径差 ${m2fm(sr - mr, 2, 0)}　距外切 ${m2fm(distance - radiusSum, 2, 0)}`);
      rsPL.nasa_r = d.checked('Cb_nasa') ? 1 : 0; rsPL.nbj(jd);
      const names = ['食中心点', '本影北界', '本影南界', '半影北界', '半影南界'];
      let boundaries = `<p>${JD.JD2str(jd + J2000)} TD</p><table><thead><tr><th>界点</th><th>经度</th><th>纬度</th></tr></thead><tbody>`;
      for (let i = 0; i < 5; i++) {
        const exists = rsPL.V[i * 2 + 1] !== 100;
        boundaries += `<tr><th>${names[i]}</th><td>${exists ? legacyFixed((rsPL.V[i * 2]! * RAD_TO_DEG), 5) : '无'}</td><td>${exists ? legacyFixed((rsPL.V[i * 2 + 1]! * RAD_TO_DEG), 5) : '无'}</td></tr>`;
      }
      d.html('Cb_b1', boundaries + `</tbody></table><p>中心类型：${rsPL.Vc}食<br>本影南北界距约 ${rsPL.Vb}</p>`);
      rsPL.nasa_r = d.checked('Cb_nasa') ? 1 : 0;
      rsPL.secMax(jd, longitude, latitude, height);
      const phases = ['初亏', '食甚', '复圆', rsPL.LX === '环' ? '环食始' : '食既', rsPL.LX === '环' ? '环食终' : '生光'];
      let result = `<h4>日${rsPL.LX}食</h4><table><tbody>`;
      for (let i = 0; i < 5; i++) {
        const eventTime = rsPL.sT[i]; if (!eventTime) continue;
        const local = d.checked('Cb_ut');
        const clock = local ? this.basic.time.formatTD(eventTime) : JD.JD2str(eventTime + J2000);
        const scale = local ? `当地时 ${this.basic.time.tdZoneText(eventTime)}` : 'TD';
        result += `<tr><th>${phases[i]}</th><td>${clock} ${scale}</td></tr>`;
      }
      d.html('Cb_b2', result + `</tbody></table><p>时长 ${m2fm(rsPL.dur * 86400, 1, 1)}<br>食分 ${legacyFixed(rsPL.sf, 5)}${rsPL.sflx}<br>`
        + `月日视径比 ${legacyFixed(rsPL.b1, 5)}（全或环食分）<br>NASA 径比 ${rsPL.nasa_r ? '是' : '否'}</p><p class="feature-note">食分指日面直径被遮比例。</p>`);
      return;
    }
    if (phase > 170 * DEG && phase < 190 * DEG) {
      const j1 = msc.mCJ, w1 = msc.mCW, j2 = msc.sCJ + Math.PI, w2 = -msc.sCW;
      const umbra = msc.eShadow, penumbra = msc.eShadow2, moonRadius = msc.e_mRad;
      const distance = j1_j2(j1, w1, j2, w2) * rad, sum = moonRadius + umbra, outerSum = moonRadius + penumbra;
      tu1.draw2b(j1, w1, j2, w2, moonRadius, umbra, penumbra);
      d.html('Cb_zb', `本影半径 ${m2fm(umbra, 2, 0)}　半影半径 ${m2fm(penumbra, 2, 0)}　月亮地心视半径 ${m2fm(moonRadius, 2, 0)}<br>`
        + `影月中心距 ${m2fm(distance, 2, 0)}　影月半径和 ${m2fm(sum, 2, 0)}　距相切 ${m2fm(distance - sum, 2, 0)}　距第二相切 ${m2fm(distance - outerSum, 2, 0)}`);
      ysPL.lecMax(jd);
      const phases = ['初亏', '食甚', '复圆', '半影食始', '半影食终', '食既', '生光'];
      let result = `<h4>月${ysPL.LX}食</h4><table><tbody>`;
      for (let i = 0; i < 7; i++) {
        const eventTime = ysPL.lT[i]; if (!eventTime) continue;
        const local = d.checked('Cb_ut');
        const clock = local ? this.basic.time.formatTD(eventTime) : JD.JD2str(eventTime + J2000);
        const scale = local ? `当地时 ${this.basic.time.tdZoneText(eventTime)}` : 'TD';
        result += `<tr><th>${phases[i]}</th><td>${clock} ${scale}</td></tr>`;
      }
      d.html('Cb_b2', result + `</tbody></table><p>食分 ${legacyFixed(ysPL.sf, 5)}</p><p class="feature-note">食分指月面直径被遮比例。</p>`);
      d.html('Cb_b1', ''); return;
    }
    d.html('Cb_zb', '<p class="feature-note">当前月日黄经差不在日月食放大计算范围内。可选择“朔”或“望”查看对应食象。</p>');
    d.html('Cb_b1', ''); d.html('Cb_b2', '');
  }

  dfRS(mode: number): void {
    const d = this.dom;
    let jd = this.basic.julian('Cc', false);
    if (mode === 1) jd -= 29.53; if (mode === 2) jd += 29.53;
    jd = XL.MS_aLon_t2(Math.floor((jd + 8) / 29.5306) * TWO_PI) * 36525;
    this.setDate('Cc', this.basic.time.tdToLocal(jd), false);
    rsPL.nasa_r = d.checked('Cc_nasa') ? 1 : 0;
    let output = '地名     食分       初亏      食甚      复圆      食既      生光      日出      日落     P1,V1    P2,V2\r\n';
    const entries = d.value('Cc_db').replace(/\n/g, '#').replace(/[ \r]/g, '').split('#');
    for (const entry of entries) {
      if (!entry || entry.startsWith('*')) continue;
      const cells = entry.split(','); if (cells.length <= 3) continue;
      const latitude = Number(cells[1]) * DEG, longitude = Number(cells[2]) * DEG, height = Number(cells[3]) / 1000;
      if (![latitude, longitude, height].every(Number.isFinite)) throw new Error(`地点“${cells[0]}”的纬度、经度或海拔格式不正确。`);
      rsPL.secMax(jd, longitude, latitude, height);
      output += cells[0] + '[' + rsPL.LX + '] ' + legacyFixed(rsPL.sf, 5) + rsPL.sflx;
      for (let i = 0; i < 5; i++) {
        const t = rsPL.sT[i];
        output += t ? '  ' + this.basic.time.formatTD(t).slice(12, 20) : '  --:--:--';
      }
      output += '  ' + JD.timeStr(this.basic.time.utToLocal(rsPL.sun_s) + J2000);
      output += '  ' + JD.timeStr(this.basic.time.utToLocal(rsPL.sun_j) + J2000);
      output += '  ' + legacyFixed((rsPL.P1 * RAD_TO_DEG), 0) + ',' + legacyFixed((rsPL.V1 * RAD_TO_DEG), 0);
      output += '  ' + legacyFixed((rsPL.P2 * RAD_TO_DEG), 0) + ',' + legacyFixed((rsPL.V2 * RAD_TO_DEG), 0) + '\r\n';
    }
    d.set('Cc_tb', output);
  }

  tu2_jxb(): void {
    let jd = this.dom.number('Cp10_jd') - J2000;
    jd = XL.MS_aLon_t2(Math.floor((jd + 8) / 29.5306) * TWO_PI) * 36525;
    rsGS.init(jd, 7); this.dom.html('Cp10_tz', rsGS.jieX3(jd));
  }

  tu2_xx(jd: number): void {
    this.setDate('Cb', jd); this.dom.check('Cb_ut', false); this.navigate(3); this.tu_calc(2);
  }

  tuGL_search(precise: number): void {
    const d = this.dom, count = d.count('Cp10_an'), rows: string[] = [];
    let jd = JD.JD(year2Ayear(d.value('Cp10_y')), d.number('Cp10_m'), 0) - J2000;
    jd = XL.MS_aLon_t2(Math.floor((jd + 8) / 29.5306) * TWO_PI) * 36525;
    for (let i = 0; i < count; i++) {
      const fast = ecFast(jd);
      if (fast.lx === 'NN') { jd += 29.5306; continue; }
      let result: { lx: string; jd: number } = fast;
      if (!fast.ac) { rsGS.init(jd, precise ? 7 : 2); result = rsGS.feature(jd); }
      if (result.lx !== 'N') rows.push(`<button class="feature-eclipse-result" data-action="tu2_calc" data-arg="1" data-jd="${result.jd}"><span>${JD.JD2str(result.jd + J2000).slice(0, 11)}</span><strong>${result.lx}</strong></button>`);
      jd = result.jd + 29.5306;
    }
    d.html('Cp10_b1', rows.length ? `<div class="feature-eclipse-results">${rows.join('')}</div>` : '<p class="feature-note">当前搜索范围内没有日食。</p>');
  }

  private localView(): number[] {
    return ['Cp10_x0', 'Cp10_y0', 'Cp10_dx', 'Cp10_dy'].map((id) => this.dom.number(id) / 10);
  }

  private drawMap(): void {
    if (!this.boundaries) throw new Error('请先勾选“显示界线”并计算日食特征。');
    const d = this.dom, local = this.localView();
    if (local[2] === 0 || local[3] === 0) throw new Error('局部 dx、dy 不能为 0。');
    this.drawings.tu3.init(d.element<HTMLCanvasElement>('Can3'));
    this.drawings.tu3.draw(this.boundaries, d.number('Cp10_J0') * DEG, d.number('Cp10_W0') * DEG,
      d.number('Cp10_eR', 10, 2000), local, d.number('Cp10_tylx'));
  }

  tu2_calc(mode: number, selectedJD?: number): void {
    const d = this.dom, { tu2, tu3 } = this.drawings;
    tu2.init(d.element<HTMLCanvasElement>('Can2'));
    if (mode === 0) return;
    const step = d.number('Cp10_step');
    let jd = d.number('Cp10_jd') - J2000;
    if (mode === 1 && selectedJD !== undefined) jd = selectedJD;
    if (mode === 3) jd -= step; if (mode === 4) jd += step;
    jd = XL.MS_aLon_t2(Math.floor((jd + 8) / 29.5306) * TWO_PI) * 36525;
    d.set('Cp10_jd', legacyFixed((jd + J2000), 6)); d.set('Cp10_jd2', legacyFixed((jd + J2000), 6)); d.text('Cp10_jdstr', JD.JD2str(jd + J2000));
    if (mode >= 1 && mode <= 4) {
      rsGS.init(jd, 7);
      const r = rsGS.feature(jd) as EclipseFeature;
      const names: Record<string, string> = { T: '全食', A: '环食', P: '偏食', T0: '无中心全食', T1: '部分本影有中心全食', A0: '无中心环食', A1: '部分伪本影有中心环食', H: '环全环', H2: '全全环', H3: '环全全' };
      if (r.lx === 'N') d.html('Cp10_tz', '<p>无日食</p>');
      else {
        const event = (label: string, value: number[]): string => `<tr><th>${label}</th><td>${JD.JD2str(value[2]! + J2000)}</td><td>${rad2str2(value[0]!)}, ${rad2str2(value[1]!)}</td></tr>`;
        let times = event('偏食始', r.gk3);
        if (r.gk1[2] !== 0) times += event('中心始', r.gk1);
        if (r.gk5[1] !== 100) times += event('视午食', r.gk5);
        if (r.gk2[2] !== 0) times += event('中心终', r.gk2);
        times += event('偏食终', r.gk4);
        d.html('Cp10_tz', `<div class="feature-two-column"><div><h3>本次日食 · 力学时</h3><table><tbody>${times}</tbody></table></div>`
          + `<div><h3>中心点特征 · ${names[r.lx] || r.lx}</h3><p>影轴地心距 γ = ${legacyFixed(r.D, 4)}<br>`
          + `中心地标 ${ legacyFixed((r.zxJ * RAD_TO_DEG), 2)}, ${legacyFixed((r.zxW * RAD_TO_DEG), 2)}<br>`
          + `中心时刻 ${JD.JD2str(r.jd + J2000)}<br>太阳方位 ${legacyFixed((r.Sdp[0]! * RAD_TO_DEG), 0)}, ${legacyFixed((r.Sdp[1]! * RAD_TO_DEG), 0)}<br>`
          + `日食类型 ${r.lx}<br>食分 ${legacyFixed(r.sf, 4)}　食延 ${m2fm(r.tt * 86400, 0, 2)}　食带 ${legacyFixed(r.dw, 0)} km</p>`
          + `<button class="button feature-btn" data-action="tu2_xx" data-jd="${r.jd}">查看地方食详细图表</button></div></div>`);
      }
      const showBoundaries = d.checked('Cp10_showJX');
      d.element('Can2').hidden = showBoundaries; d.element('Can3').hidden = !showBoundaries;
      if (showBoundaries) {
        tu3.init(d.element<HTMLCanvasElement>('Can3'));
        this.boundaries = rsGS.jieX(jd) as EclipseBoundaries;
        d.set('Cp10_J0', legacyFixed((this.boundaries.zxJ * RAD_TO_DEG), 0)); d.set('Cp10_W0', legacyFixed((this.boundaries.zxW * RAD_TO_DEG), 0));
        this.drawMap();
      } else tu2.line1(r, d.checked('Cp10_hc'));
      return;
    }
    if (mode === 5) {
      d.element('Can2').hidden = false; d.element('Can3').hidden = true;
      const count = d.count('Cp10_bn'), features: EclipseFeature[] = [], rows: string[] = [];
      for (let i = 0; i < count; i++, jd += step) {
        rsGS.init(jd, 3); const r = rsGS.feature(jd) as EclipseFeature;
        if (r.lx === 'N') continue;
        features.push(r);
        rows.push(`<tr><td>${JD.JD2str(r.jd + J2000)}</td><td>${legacyFixed(r.D, 4)}</td><td>${r.lx}</td><td>${legacyFixed((r.zxJ * RAD_TO_DEG), 2)}, ${legacyFixed((r.zxW * RAD_TO_DEG), 2)}</td>`
          + `<td>${legacyFixed((r.Sdp[0]! * RAD_TO_DEG), 0)}, ${legacyFixed((r.Sdp[1]! * RAD_TO_DEG), 0)}</td><td>${legacyFixed(r.sf, 4)}</td><td>${legacyFixed(r.dw, 0)}</td><td>${m2fm(r.tt * 86400, 0, 2)}</td>`
          + `<td><button class="feature-inline-button" data-action="tu2_xx" data-jd="${r.jd}">详细</button></td></tr>`);
      }
      tu2.line1(features, d.checked('Cp10_hc'));
      d.html('Cp10_tz', '<div class="feature-table-wrap"><table><thead><tr><th>力学时</th><th>γ</th><th>型</th><th>中心地标</th><th>方位角</th><th>食分</th><th>食带</th><th>食延</th><th>详表</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
    }
  }

  tu3_xz(mode: number): void {
    if (!this.boundaries) throw new Error('请先勾选“显示界线”并计算日食特征。');
    const d = this.dom;
    let longitude = d.number('Cp10_J0'), latitude = d.number('Cp10_W0');
    if (mode === 0) longitude += 15; if (mode === 1) longitude -= 15;
    if (mode === 2) latitude += 15; if (mode === 3) latitude -= 15;
    d.set('Cp10_J0', longitude); d.set('Cp10_W0', latitude); this.drawMap();
  }

  tu3_yingzi(mode: number): void {
    const d = this.dom;
    let jd = d.number('Cp10_jd2') - J2000;
    if (!this.boundaries) { d.check('Cp10_showJX', true); this.tu2_calc(2); }
    if (mode === 1) jd -= d.number('Cp10_step2') / 86400; if (mode === 2) jd += d.number('Cp10_step2') / 86400;
    d.set('Cp10_jd2', legacyFixed((jd + J2000), 4));
    rsGS.init(jd, 7); const shadow = rsGS.jieX2(jd) as EclipseShadow;
    d.element('Can3').hidden = false;
    this.drawings.tu3.init(d.element<HTMLCanvasElement>('Can3'));
    this.drawings.tu3.draw2(shadow);
  }
}
