import { escapeHTML } from './dom';
import type { FeatureContext } from './types';
import { CONSTANTS_HTML, HELP_CONTENT } from './reference-content';

export const FEATURE_TITLES: Record<number, string> = {
  2: '年历', 3: '日月食', 4: '地方食', 5: '行星星历', 6: '天象', 7: '恒星星历',
  8: '气朔', 9: '升降', 10: '日食概略', 11: '八字', 12: '工具', 13: '天文常数',
};

function input(id: string, label: string, value: string | number, wide = false): string {
  return `<label class="feature-field${wide ? ' feature-field--wide' : ''}"><span>${escapeHTML(label)}</span><input id="${id}" class="input" aria-label="${escapeHTML(label)}" value="${escapeHTML(value)}" autocomplete="off" spellcheck="false"></label>`;
}
function check(id: string, label: string, checked = false): string {
  return `<label class="feature-check"><input id="${id}" type="checkbox"${checked ? ' checked' : ''}><span>${escapeHTML(label)}</span></label>`;
}
function button(label: string, action: string, arg?: number, arg2?: number, primary = false): string {
  return `<button type="button" class="button feature-btn${primary ? ' feature-btn--primary' : ''}" data-action="${action}"${arg !== undefined ? ` data-arg="${arg}"` : ''}${arg2 !== undefined ? ` data-arg2="${arg2}"` : ''}>${escapeHTML(label)}</button>`;
}
function select(id: string, label: string, options: Array<[string | number, string]>, action?: string): string {
  return `<label class="feature-field feature-field--select"><span>${escapeHTML(label)}</span><select id="${id}" class="select" aria-label="${escapeHTML(label)}"${action ? ` data-change="${action}"` : ''}>${options.map(([value, name]) => `<option value="${value}">${escapeHTML(name)}</option>`).join('')}</select></label>`;
}
function row(content: string): string { return `<div class="feature-form-row">${content}</div>`; }
function group(title: string, content: string, note = ''): string {
  return `<div class="feature-card"><h3>${title}</h3>${note ? `<p class="feature-note">${note}</p>` : ''}${content}</div>`;
}
function output(id: string, label = '计算结果', textarea = false, readonly = true): string {
  return textarea
    ? `<label class="feature-output-label"><span>${label}</span><textarea id="${id}" class="feature-text-output" aria-label="${label}" rows="16" spellcheck="false"${readonly ? ' readonly' : ''}></textarea></label>`
    : `<div id="${id}" class="feature-result" role="region" aria-label="${label}" aria-live="polite"></div>`;
}
function date(prefix: string, ctx: FeatureContext, time = true, timeValue = '00:00:00'): string {
  return input(`${prefix}_y`, '年份', ctx.year) + input(`${prefix}_m`, '月份', ctx.month) + input(`${prefix}_d`, '日期', ctx.day)
    + (time ? input(`${prefix}_t`, '时间', timeValue, true) : '');
}
function position(prefix: string, ctx: FeatureContext): string {
  return input(`${prefix}_J`, '经度（东经为正）', ctx.longitude, true) + input(`${prefix}_W`, '纬度（北纬为正）', ctx.latitude, true);
}
function help(id: number): string {
  return HELP_CONTENT[id] ? `<details class="feature-help"><summary>参数与计算说明</summary><div>${HELP_CONTENT[id]}</div></details>` : '';
}
function page(id: number, subtitle: string, content: string, title = FEATURE_TITLES[id]): string {
  return `<section id="feature-page-${id}" class="feature-page" data-feature-page="${id}" hidden><header class="feature-page-heading"><div><span class="feature-eyebrow">SXWNL · ASTRONOMY</span><h2>${title}</h2><p>${subtitle}</p></div><span class="feature-badge">经典算法 · TypeScript</span></header>${content}</section>`;
}

const LOCAL_CITIES = `*地名,纬度,经度,海拔(米)
北京,39.93,116.37,31 # 天津,39.14,117.19,3 # 太原,37.87,112.56,778
沈阳,41.78,123.41,41 # 长春,43.89,125.31,237 # 上海,31.23,121.46,5
南京,32.05,118.76,9 # 杭州,30.29,120.17,42 # 拉萨,29.66,91.13,3658
莆田,25.43,119.02,30 # 西安,34.27,108.95,397 # 银川,38.46,106.26,1112
香港,22.28,114.15,32 # 乌市,43.79,87.61,918 # 洛阳,34.62,112.45,353
开封,34.80,114.30,75 # 安阳,36.10,114.38,800 # 咸阳,34.33,108.70,386
曲阜,35.58,116.98,150 # 成都,30.67,104.07,506 # 重庆,29.57,106.55,260
武汉,30.60,114.30,25 # 广州,23.13,113.27,7 # 昆明,25.05,102.72,1891
台北,25.03,121.50,9 # 哈市,45.80,126.53,150`;

export function currentObserverLocations(context: FeatureContext): string {
  const name = (context.locationName?.trim() || '当前观测点').replace(/[,#*\r\n]+/g, ' ');
  return `*地名,纬度,经度,海拔(米)\n${name},${context.latitude},${context.longitude},0`;
}

export function defaultLocalEclipseLocations(context: FeatureContext): string {
  return (context.calendarRegion ?? 'CN') === 'CN' ? LOCAL_CITIES : currentObserverLocations(context);
}

export function createFeatureMarkup(context: FeatureContext): string {
  const chineseCalendar = (context.calendarRegion ?? 'CN') === 'CN';
  const americanCalendar = context.calendarRegion === 'US';
  const eclipse = { ...context, year: 2008, month: 8, day: 1 };
  const planetNames = ['水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星', '太阳', '月亮'];
  const planets: Array<[number, string]> = planetNames.map((name, i) => [i + 1, name]);
  const markup: string[] = [];

  markup.push(page(2, '按农历月份展开全年，查看朔日、节气时刻与干支。',
    group('年份与显示', row(input('Cp2_y', '年份', context.year) + check('Cp2_tg', '显示精确时刻（关闭时显示干支）', true)
      + button('生成年历', 'getNianLi', 0, undefined, true) + button('上一年', 'getNianLi', -1) + button('下一年', 'getNianLi', 1))
      + row(input('Cp2_n', '连续年数', 2) + button('生成多年年历', 'getNianLiN'))) + output('Cal7')));

  markup.push(page(3, '计算日月坐标、食甚时刻与南北界，查看地平位置和食象放大图。',
    group('观测地点与时间', row(position('Cb', context) + input('Cb_high', '海拔（千米）', 0)
      + check('Cb_bei', '北为方位零点') + check('Cb_sjzb', '时角坐标'))
      + row(date('Cb', eclipse, true, '18:17:15') + check('Cb_ut', '输入为当地时间', true) + check('Cb_nasa', 'NASA 径比') + button('此刻', 'tu_calc', 0))
      + row(button('上一朔', 'tu_calc', 4) + button('朔', 'tu_calc', 5) + button('下一朔', 'tu_calc', 6)
        + button('上一望', 'tu_calc', 7) + button('望', 'tu_calc', 8) + button('下一望', 'tu_calc', 9))
      + row(input('Cb_step', '步长（秒）', 300) + button('后退一步', 'tu_calc', 1) + button('计算日月食', 'tu_calc', 2, undefined, true)
        + button('前进一步', 'tu_calc', 3) + check('Cb_phSave', '保留日食路径') + check('Cal_pause', '暂停实时坐标', true)))
    + help(2) + '<div class="feature-two-column">'
    + group('日月坐标', output('Cal_zb'))
    + group('地平与食象', '<div class="feature-canvas-wrap"><canvas id="Can1" width="480" height="350" role="img" aria-label="日月坐标与日月食放大图"></canvas></div>' + output('Cb_zb'))
    + '</div><div class="feature-two-column">' + group('南北界数据', output('Cb_b1')) + group('食象时间表', output('Cb_b2')) + '</div>'));

  markup.push(page(4, '为多个观测地点批量计算同一次日食，保留自定义地点文本输入。',
    group('日食日期', row(date('Cc', eclipse, false) + button('上一朔', 'dfRS', 1) + button('计算地方食', 'dfRS', 0, undefined, true)
      + button('下一朔', 'dfRS', 2) + check('Cc_nasa', 'NASA 径比')))
    + group('地点数据', row(button('使用当前观测点', 'useCurrentObserver')) + `<label class="feature-output-label"><span>地名、纬度、经度、海拔（米）</span><textarea id="Cc_db" class="feature-text-output" aria-label="地方食地点数据" rows="10" spellcheck="false">${escapeHTML(defaultLocalEclipseLocations(context))}</textarea></label>`, '每行一个地点；也可使用 # 分隔。以 * 开头的行是注释。未编辑的默认列表跟随地区切换；手动编辑后保留。使用当前观测点会替换列表，默认海拔为 0 米，可再编辑。')
    + group('地方日食表', output('Cc_tb', '地方食计算结果', true), '各地点使用表内的经纬度与海拔，结果时刻统一换算为所选地区在事件发生日期的当地时间。')
    + '<p class="feature-note">P1、P2 从日面北点向东测量初亏与复圆方位；V1、V2 从地平坐标中的日面顶点起算。食分中的 * 表示日没时食分，# 表示日出时食分。环食时“食既／生光”两列对应环食始／环食终。</p>'));

  markup.push(page(5, '逐时计算八大行星、冥王星与日月的黄道、赤道和地平坐标。',
    group('星体与历元', row(select('Cd_xt', '星体', planets) + date('Cd', context) + check('Cd_ut', '输入为当地时间', true))
      + row(position('Cd', context) + input('Cd_dt', '间隔（天）', 1) + input('Cd_n', '个数', 10) + button('生成星历', 'pCalc', undefined, undefined, true)),
      '当地时输入按所选地区和输入日期换算。批量间隔以连续 24 小时为一天，TD/JDE 保留力学时；每条结果同时显示对应当地时间。')
    + help(4) + output('Cd_tab', '行星星历结果', true)));

  const baseEvents = ['月亮近点', '月亮远点', '月亮升交', '月亮降交', '地球近日', '地球远日', '水星东大距', '水星西大距', '金星东大距', '金星西大距'];
  let eventActions = group('月亮、地球与大距', row(baseEvents.map((name, i) => button(name, 'tianXiang', i + 1, 0)).join('')));
  const eventGroups: Array<[number, string]> = [[11, '赤经合月'], [12, '黄经合日（地内行星上合）'], [13, '黄经冲日（地内行星下合）'], [14, '行星顺留'], [15, '行星逆留']];
  for (const [event, title] of eventGroups) eventActions += `<div class="feature-event-row"><span>${title}</span><div>${planetNames.slice(0, 7).map((name, i) => button(name, 'tianXiang', event, i + 1)).join('')}</div></div>`;
  markup.push(page(6, '查找月亮近远地点、交点、行星大距、合冲与留等 45 组天象。',
    group('搜索起点', row(date('Ce', context, false) + '<span class="feature-badge">TD 力学时</span>' + input('Ce_n', '个数', 10)))
    + eventActions + help(5) + '<p class="feature-note">TD 为力学时；当地时列按所选地区在事件日期的时区显示完整日期与时刻，包含夏令时。</p>' + output('Ce_tab', '天象计算结果', true)));

  markup.push(page(7, '按星库或 88 星座选择恒星，可编辑自行、视差与参与计算的星表。',
    group('星库与坐标', row(select('Cf_xk', '星库 / 星座', [], 'showHXK') + select('Cf_lx', '坐标类型', [[0, '视位置'], [1, '站坐标'], [2, '平位置']]))
      + row(date('Cf', context) + check('Cf_ut', '输入为当地时间', true) + check('Cf_nsn', '略短周期章动'))
      + row(position('Cf', context) + input('Cf_dt', '间隔（天）', 10) + input('Cf_n', '个数', 10) + button('计算恒星', 'aCalc', undefined, undefined, true)),
      '当地时输入按所选地区和输入日期换算；计算间隔沿用连续 24 小时制，结果同时标注当地时间和力学时历元。')
    + help(6) + output('Cf_db', '恒星数据库（可编辑，带 * 的行参与计算）', true, false) + output('Cf_xl', '恒星星历结果', true)));

  markup.push(page(8, chineseCalendar ? '高精度计算定朔、定望、上下弦、二十四节气与七十二候。' : americanCalendar ? '推算北半球四季转换、新月、满月、上下弦及任意月日相位的当地时刻。' : '推算新月、满月、上弦月、下弦月及任意月日黄经差时刻。',
    group('起始年份与数量', row(input('Cp8_y', '年份', context.year) + input('Cp8_n', chineseCalendar ? '个数 / 节气数' : '个数', 24))
      + row(button(chineseCalendar ? '定朔' : '新月', 'suoCalc', 0, undefined, true) + button(chineseCalendar ? '定望' : '满月', 'suoCalc', 180) + button(chineseCalendar ? '上弦' : '上弦月', 'suoCalc', 90) + button(chineseCalendar ? '下弦' : '下弦月', 'suoCalc', 270)
        + input('Cp8_angle', '任意黄经差（度）', 0, true) + button('任意角', 'suoCalc', -1)
        + `<span data-chinese-calendar${chineseCalendar ? '' : ' hidden'}>${button('定气', 'qiCalc')}${button('定候', 'houCalc')}</span>`
        + `<span data-us-calendar${americanCalendar ? '' : ' hidden'}>${button('全年四季转换', 'seasonCalc')}</span>`),
      '时刻按所选地区在事件日期的时区显示，包含夏令时。任意角可输入 0、90、180、270 或其他角度。')
    + `<p class="feature-note" data-us-calendar${americanCalendar ? '' : ' hidden'}>全年四季转换使用上方年份，按北半球天文季节计算，不使用月相个数。</p>`
    + output('Cp8_out'), chineseCalendar ? '气朔' : americanCalendar ? '季节与月相' : '月相推算'));

  markup.push(page(9, '计算日月升降、中天与晨昏时刻，以及全年太阳升降和真平太阳时差。',
    group('地点与日期', row(position('Cp9', context) + date('Cp9', context, false))
      + row(button('日月升降', 'shengjiang', undefined, undefined, true) + button('太阳年度升降', 'shengjiang2') + button('年度时差表', 'shengjiang3')),
      '日期按所选经度取地方日；结果按所选地区在事件日期的时区显示。年度时差表按该地区每天当地时间 12 点计算。') + output('Cp9_out')));

  const projections: Array<[number, string]> = ['斜轴正射方位投影', '斜轴等距方位投影', '斜轴等积方位投影', '斜轴等角方位投影', '摩尔威特等积投影', '正轴等距圆柱投影', '正轴等角圆柱投影', '正轴多圆锥投影', '中国灯笼投影'].map((name, i) => [i, name]);
  markup.push(page(10, '搜索全球日食，比较沙罗周期，并在九种地图投影中观察食带与月影。',
    group('日食搜索', row(input('Cp10_y', '起始年份', 2008) + input('Cp10_m', '起始月份', 8) + input('Cp10_an', '搜索月数', 200)
      + button('搜索', 'tuGL_search', 0, undefined, true) + button('精搜索', 'tuGL_search', 1)) + output('Cp10_b1', '搜索结果'))
    + group('日食特征与周期', '<p class="feature-note">选定时刻：<strong id="Cp10_jdstr">2008-08-01 10:14:30</strong> TD</p>'
      + row(input('Cp10_jd', 'JDE', 2454679.926741, true) + input('Cp10_step', '步长（天，可为负）', 6585.32, true)
        + select('Cp10_cycle', '周期', [[6585.32, '沙罗周期'], [29.5306, '朔望月'], [346.620, '食年']], 'eclipseCycle') + check('Cp10_showJX', '显示界线', true))
      + row(button('前一步', 'tu2_calc', 3) + button('计算特征', 'tu2_calc', 2, undefined, true) + button('后一步', 'tu2_calc', 4) + button('界线表', 'tu2_jxb')
        + check('Cp10_hc', '黄道坐标') + input('Cp10_bn', '多步个数', 10) + button('多步对比', 'tu2_calc', 5)))
    + output('Cp10_tz') + '<div class="feature-canvas-wrap"><canvas id="Can2" width="480" height="420" role="img" aria-label="日食贝塞尔基面与月影轴"></canvas></div>'
    + group('地图投影', row(input('Cp10_J0', '中心经度', 0) + input('Cp10_W0', '中心纬度', 0) + input('Cp10_eR', '球半径', 250) + select('Cp10_tylx', '投影方式', projections))
      + row(button('经度 ＋15°', 'tu3_xz', 0) + button('经度 −15°', 'tu3_xz', 1) + button('纬度 ＋15°', 'tu3_xz', 2) + button('纬度 −15°', 'tu3_xz', 3) + button('更新地图', 'tu3_xz', 4))
      + row(input('Cp10_x0', '局部 x0', 0) + input('Cp10_y0', '局部 y0', 0) + input('Cp10_dx', '局部 dx', 10) + input('Cp10_dy', '局部 dy', 10)),
      '局部显示参数以 0.1 个球半径为单位。开启“显示界线”并计算后，可调整地图中心与投影。')
    + group('瞬时月影', row(input('Cp10_jd2', '影子 JDE', 2454679.926741, true) + input('Cp10_step2', '影子步长（秒）', 180)
      + button('后退', 'tu3_yingzi', 1) + button('显示影子', 'tu3_yingzi', 0) + button('前进', 'tu3_yingzi', 2)))
    + '<div class="feature-canvas-wrap"><canvas id="Can3" width="700" height="520" role="img" aria-label="全球日食界线地图"></canvas></div>'
    + '<details class="feature-help"><summary>图例与食型说明</summary><p>北极点向阳时高亮、背阳时变暗。站在日心观测，斜线为白道，水平线为赤道或黄道，竖线经过地心自转轴或黄轴。大圆为贝塞尔基面上的地球圆面。全食的食分采用月日视径比，食带宽度单位为千米。</p><p>T 全食；T0 无中心全食；T1 部分本影的有中心全食；A 环食；A0 无中心环食；A1 部分伪本影的有中心环食；P 偏食；H 环全环；H2 全全环；H3 环全全。部分简略计算采用二点插值，γ 较大的偏食精度相对较低。</p></details>'));

  markup.push(page(11, '依据经度与出生时刻计算干支四柱、真太阳时和一日时辰。',
    group('日期与时间', row(input('Cp11_J', '经度（东经为正）', context.longitude, true) + input('Cml_y', '年份', context.year)
      + input('Cml_m', '月份', context.month) + input('Cml_d', '日期', context.day) + input('Cml_his', '当地时间', '12:00:00', true))
      + row(button('计算八字', 'ML_calc', undefined, undefined, true) + button('此刻', 'ML_settime')),
      '保留原版干支历法与真太阳时计算，时区采用顶部全局设置。') + output('Cal6')));

  const secondDate = input('GJ1_y2', '第二日期年份', 2000) + input('GJ1_m2', '第二日期月份', 1) + input('GJ1_d2', '第二日期日', 1) + input('GJ1_t2', '第二日期时间', '12:00:00', true);
  markup.push(page(12, '儒略日与日期互转、日期差值，以及经典和现代圆周率算法演示。',
    group('儒略日计算', row(input('GJ1_jd', '儒略日 JD', 2451545, true) + button('转为日期', 'GJ1_calc1', undefined, undefined, true))
      + row(date('GJ1', context, true, '12:00:00') + button('转儒略日', 'GJ1_calc2', 0) + button('减去上行 JD', 'GJ1_calc2', 1) + button('年内积日', 'GJ1_calc2', 2))
      + row(secondDate + button('两日期相减', 'GJ1_calc2', 3)) + output('GJ1_out', '儒略日计算结果'))
    + group('圆周率 · 割圆术', row(['6 边 C', '4 边 C', '6 边 S', '4 边 S', '6 边快速', '4 边快速'].map((label, i) => button(label, 'GJ2_pi1', i)).join(''))
      + row(input('GJ2_r', '半径 R（毫）', 100000000, true) + button('祖冲之算法', 'GJ2_pi2')))
    + group('圆周率 · 多精度', row(input('GJ2_N', '位数', 100) + button('现代算法', 'GJ2_pi') + button('Machin 算法（现代 2）', 'GJ2_machin', undefined, undefined, true) + button('清除结果', 'GJ2_cls')))
    + output('GJ2_out', '圆周率计算结果') + '<div id="feature-diagnostics"></div>'));

  markup.push(page(13, '保存原版天文常数、行星质量与年月长度资料，便于核对经典计算。',
    `<div class="feature-card feature-reference">${CONSTANTS_HTML}</div>`));

  return `<div class="feature-feedback" role="status" aria-live="polite" hidden></div>${markup.join('')}`;
}
