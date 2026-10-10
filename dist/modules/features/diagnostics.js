import { JD, J2000, XL, dt_T, msc } from '../engine/engine.js';
function checkInputs(year, count) {
    if (!Number.isInteger(year) || year < -4712 || year > 9999) {
        throw new Error('年份需为 -4712 至 9999 的整数；0 年表示公元前 1 年。');
    }
    if (!Number.isInteger(count) || count < 1 || count > 10000) {
        throw new Error('计算个数需为 1 至 10000 的整数。');
    }
}
/** 我保留原诊断的 i/24 采样与向下取整，便于与原版逐项比较。 */
export function comparePrecision(kind, year, count) {
    checkInputs(year, count);
    const offset = year - 2000;
    const start = kind === 'solar-term' ? offset : Math.floor(offset * (365.2422 / 29.53058886));
    let maxDifferenceSeconds = 0;
    for (let i = 0; i < count; i++) {
        const longitude = (start + i / 24) * 2 * Math.PI;
        const difference = kind === 'solar-term'
            ? XL.S_aLon_t2(longitude) - XL.S_aLon_t(longitude)
            : XL.MS_aLon_t2(longitude) - XL.MS_aLon_t(longitude);
        maxDifferenceSeconds = Math.max(maxDifferenceSeconds, Math.floor(Math.abs(difference * 36525 * 86400)));
    }
    return { kind, year, count, maxDifferenceSeconds };
}
/** 我保留高低精度各 1000 次的原测试规模，耗时取当前机器的实测值。 */
export function measureSpeed(kind) {
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        if (kind === 'solar-term')
            XL.S_aLon_t(0);
        else
            XL.MS_aLon_t(0);
    }
    const middle = performance.now();
    for (let i = 0; i < iterations; i++) {
        if (kind === 'solar-term')
            XL.S_aLon_t2(0);
        else
            XL.MS_aLon_t2(0);
    }
    const end = performance.now();
    return { kind, iterations, accurateMilliseconds: middle - start, approximateMilliseconds: end - middle };
}
export function compareInversions(julianDays) {
    if (!Number.isFinite(julianDays))
        throw new Error('儒略日必须是有限数值。');
    const century = julianDays / 36525;
    const moonLongitude = XL.M_Lon(century, -1);
    const earthLongitude = XL.E_Lon(century, -1);
    const difference = XL.MS_aLon(century, -1, 60);
    return [
        { name: '月球黄经', longitude: moonLongitude, reconstructedJulianDays: XL.M_Lon_t(moonLongitude) * 36525 },
        { name: '地球黄经', longitude: earthLongitude, reconstructedJulianDays: XL.E_Lon_t(earthLongitude) * 36525 },
        { name: '月日黄经差', longitude: difference, reconstructedJulianDays: XL.MS_aLon_t(difference) * 36525 },
    ].map((row) => ({
        ...row,
        inputJulianDays: julianDays,
        errorSeconds: (row.reconstructedJulianDays - julianDays) * 86400,
    }));
}
/** 独立诊断面板，返回卸载函数。 */
export function mountDiagnostics(container) {
    const panel = document.createElement('section');
    panel.className = 'feature-card diagnostic-section';
    panel.innerHTML = `
    <div class="feature-heading"><div><h3>算法诊断</h3><p>保留原版的粗精气朔对比、运行速度和黄经反算验证。</p></div></div>
    <div class="feature-form-row">
      <label class="feature-field"><span>起始年份（天文纪年）</span><input class="input" type="number" name="diagnostic-year" value="2000" min="-4712" max="9999"></label>
      <label class="feature-field"><span>采样个数</span><input class="input" type="number" name="diagnostic-count" value="24" min="1" max="10000"></label>
    </div>
    <div class="feature-form-row">
      <button class="button feature-btn" type="button" data-diagnostic="term-precision">粗定气误差</button>
      <button class="button feature-btn" type="button" data-diagnostic="moon-precision">粗定朔误差</button>
      <button class="button feature-btn" type="button" data-diagnostic="term-speed">定气速度</button>
      <button class="button feature-btn" type="button" data-diagnostic="moon-speed">定朔速度</button>
      <button class="button feature-btn" type="button" data-diagnostic="clear">清空</button>
    </div>
    <details class="diagnostic-coordinates"><summary>太阳、月亮坐标与反算诊断</summary>
      <div class="feature-form-row">
        <label class="feature-field"><span>JDE / JD</span><input class="input" type="number" name="diagnostic-jd" value="2451545" step="any"></label>
        <label class="feature-field"><span>东经（度）</span><input class="input" type="number" name="diagnostic-longitude" value="116.3833" min="-180" max="180" step="any"></label>
        <label class="feature-field"><span>北纬（度）</span><input class="input" type="number" name="diagnostic-latitude" value="39.9" min="-90" max="90" step="any"></label>
        <label class="feature-field"><span>输入时标</span><select class="select" name="diagnostic-timescale"><option value="td">力学时 TD</option><option value="beijing">北京时间</option></select></label>
      </div>
      <div class="feature-form-row"><button class="button feature-btn" type="button" data-diagnostic="coordinates">计算坐标与反算误差</button></div>
    </details>
    <div class="feature-result diagnostic-output" role="status" aria-live="polite">选择一项诊断开始计算。</div>
  `;
    container.append(panel);
    const output = panel.querySelector('.diagnostic-output');
    const input = (name) => {
        const element = panel.querySelector(`[name="diagnostic-${name}"]`);
        if (element.value.trim() === '')
            throw new Error('请填写完整的计算参数。');
        const value = Number(element.value);
        if (!Number.isFinite(value))
            throw new Error('计算参数必须是有限数值。');
        return value;
    };
    const handleClick = async (event) => {
        const button = event.target.closest('[data-diagnostic]');
        if (!button || !panel.contains(button))
            return;
        const action = button.dataset.diagnostic;
        if (action === 'clear') {
            output.textContent = '选择一项诊断开始计算。';
            return;
        }
        const buttons = Array.from(panel.querySelectorAll('button'));
        buttons.forEach((item) => { item.disabled = true; });
        output.textContent = '正在计算…';
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
            if (action === 'term-precision' || action === 'moon-precision') {
                const kind = action === 'term-precision' ? 'solar-term' : 'new-moon';
                const result = comparePrecision(kind, input('year'), input('count'));
                const name = kind === 'solar-term' ? '节气' : '朔日';
                output.textContent = `${result.year} 年之后 ${result.count} 个${name}采样，粗算与精算的最大差异：${result.maxDifferenceSeconds} 秒。`;
            }
            else if (action === 'term-speed' || action === 'moon-speed') {
                const result = measureSpeed(action === 'term-speed' ? 'solar-term' : 'new-moon');
                output.textContent = `高精度：${result.accurateMilliseconds.toFixed(2)} 毫秒 / ${result.iterations} 次；低精度：${result.approximateMilliseconds.toFixed(2)} 毫秒 / ${result.iterations} 次。`;
            }
            else if (action === 'coordinates') {
                const longitude = input('longitude');
                const latitude = input('latitude');
                if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90)
                    throw new Error('经度需在 -180 至 180，纬度需在 -90 至 90 之间。');
                let julianDays = input('jd') - J2000;
                const scale = panel.querySelector('[name="diagnostic-timescale"]').value;
                if (scale === 'beijing')
                    julianDays += dt_T(julianDays) - 8 / 24;
                const year = JD.DD(julianDays + J2000).Y;
                checkInputs(year, 1);
                msc.calc(julianDays, longitude * Math.PI / 180, latitude * Math.PI / 180, 0);
                const rows = compareInversions(julianDays);
                const table = '<table><thead><tr><th>项目</th><th>黄经（弧度）</th><th>反算日数</th><th>误差（秒）</th></tr></thead><tbody>'
                    + rows.map((row) => `<tr><td>${row.name}</td><td>${row.longitude}</td><td>${row.reconstructedJulianDays}</td><td>${row.errorSeconds}</td></tr>`).join('')
                    + '</tbody></table>';
                output.innerHTML = msc.toHTML(1) + table;
            }
        }
        catch (error) {
            output.textContent = error instanceof Error ? error.message : '计算失败，请检查参数。';
        }
        finally {
            buttons.forEach((item) => { item.disabled = false; });
        }
    };
    panel.addEventListener('click', handleClick);
    return () => {
        panel.removeEventListener('click', handleClick);
        panel.remove();
    };
}
