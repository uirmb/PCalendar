import { ditu1, ditu2, J2000, JD, radd, rsGS } from './engine/engine.js';
import { element, parseYear } from './lib/dom.js';
import { icon } from './lib/icons.js';
import './eclipse-map.css';
const wrapLongitude = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const coordinateText = ({ longitude, latitude }) => `${Math.abs(longitude).toFixed(3)}°${longitude < 0 ? 'W' : 'E'} · ${Math.abs(latitude).toFixed(3)}°${latitude < 0 ? 'S' : 'N'}`;
function eclipseName(code) {
    if (code === 'N')
        return '无日食';
    if (code === 'P')
        return '日偏食';
    if (code.startsWith('A'))
        return '日环食';
    if (code.startsWith('T'))
        return '日全食';
    if (code.startsWith('H'))
        return '全环食';
    return code || '日食';
}
/**
 * 原版「界线图.htm」的离线 Canvas 实现。
 * 我直接绘制 rsGS.jieX 的 L0—L4 经纬度；显示投影不改动计算点。
 * 大地轮廓及国界同样使用随原程序发布的 ditu1/ditu2 历史数据。
 */
export function createEclipseMap(container) {
    const abortController = new AbortController();
    const { signal } = abortController;
    let disposed = false;
    let frame = 0;
    let calculateTimer = 0;
    let width = 1;
    let height = 1;
    let zoomLevel = 1;
    let center = { longitude: 116.397, latitude: 0 };
    let selected;
    let drag;
    let lines = [];
    container.innerHTML = `
    <section class="eclipse-map">
      <form class="card eclipse-map__form" aria-label="日食界线日期">
        <div class="eclipse-map__fields">
          <label class="eclipse-map__field">公元年份
            <input class="input" name="year" value="2009" inputmode="text" autocomplete="off" aria-describedby="eclipse-map-year-help" required>
          </label>
          <label class="eclipse-map__field eclipse-map__field--small">月
            <input class="input" name="month" type="number" min="1" max="12" step="1" value="7" required>
          </label>
          <label class="eclipse-map__field eclipse-map__field--small">日
            <input class="input" name="day" type="number" min="1" max="31" step="1" value="22" required>
          </label>
          <button class="button button--primary" type="submit">${icon('eclipse')}<span>计算界线</span></button>
        </div>
        <p class="eclipse-map__hint" id="eclipse-map-year-help">计算输入日期附近的日食。公元前可输入 B212；默认日期为原版示例 2009 年 7 月 22 日。</p>
        <p class="eclipse-map__error" role="alert" hidden></p>
      </form>

      <section class="card eclipse-map__map-card" aria-label="日食界线地图">
        <header class="eclipse-map__header">
          <div><h2>日食路径</h2><p class="eclipse-map__event" role="status" aria-live="polite">正在计算原版示例…</p></div>
          <div class="eclipse-map__zoom-controls" aria-label="地图缩放">
            <button class="button button--secondary button--icon-only" type="button" data-map-action="zoom-out" aria-label="缩小地图" title="缩小（−）">−</button>
            <output class="eclipse-map__zoom" aria-label="比例等级">1.0 级</output>
            <button class="button button--secondary button--icon-only" type="button" data-map-action="zoom-in" aria-label="放大地图" title="放大（+）">+</button>
            <button class="button button--secondary" type="button" data-map-action="reset" title="重置视图（Home）">${icon('reset')}重置</button>
          </div>
        </header>
        <div class="eclipse-map__stage">
          <canvas class="eclipse-map__canvas" tabindex="0" aria-label="日食路径与地理经纬度交互地图" aria-describedby="eclipse-map-keyboard-help"></canvas>
          <div class="eclipse-map__legend" aria-label="界线图例">
            <span><i class="eclipse-map__line-key eclipse-map__line-key--center"></i>中心线 L0</span>
            <span><i class="eclipse-map__line-key eclipse-map__line-key--umbra"></i>本影边界 L3 / L4</span>
            <span><i class="eclipse-map__line-key eclipse-map__line-key--penumbra"></i>半影边界 L1 / L2</span>
          </div>
        </div>
        <footer class="eclipse-map__footer">
          <span class="eclipse-map__selected" aria-live="polite">点击地图读取经纬度</span>
          <span class="eclipse-map__center"></span>
        </footer>
      </section>

      <div class="eclipse-map__notes">
        <p id="eclipse-map-keyboard-help">拖动平移，滚轮缩放；聚焦地图后可用方向键移动、+ / − 缩放、Home 重置。点击地图显示坐标。</p>
        <p>界线沿用寿星万年历原版高精度计算。底图为原版历史海岸线与国界，采用等距经纬投影；放大只改变显示比例。时刻以力学时 TD 显示。</p>
      </div>
    </section>`;
    const form = element('form', container);
    const submit = element('button[type="submit"]', form);
    const submitLabel = element('button[type="submit"] span', form);
    const errorOutput = element('.eclipse-map__error', container);
    const eventOutput = element('.eclipse-map__event', container);
    const stage = element('.eclipse-map__stage', container);
    const canvas = element('canvas', container);
    const context = canvas.getContext('2d');
    if (!context)
        throw new Error('此浏览器无法创建 Canvas 二维绘图环境。');
    const context2d = context;
    const zoomOutput = element('.eclipse-map__zoom', container);
    const centerOutput = element('.eclipse-map__center', container);
    const selectedOutput = element('.eclipse-map__selected', container);
    const zoomIn = element('[data-map-action="zoom-in"]', container);
    const zoomOut = element('[data-map-action="zoom-out"]', container);
    function pixelsPerDegree() {
        return Math.max(width / 360, height / 180) * 2 ** (zoomLevel - 1);
    }
    function constrainCenter() {
        center.longitude = wrapLongitude(center.longitude);
        const maximumLatitude = Math.max(0, 90 - height / (2 * pixelsPerDegree()));
        center.latitude = clamp(center.latitude, -maximumLatitude, maximumLatitude);
    }
    function screenPoint(point) {
        const scale = pixelsPerDegree();
        return {
            x: width / 2 + wrapLongitude(point.longitude - center.longitude) * scale,
            y: height / 2 - (point.latitude - center.latitude) * scale,
        };
    }
    function geographicPoint(x, y) {
        const scale = pixelsPerDegree();
        return {
            longitude: wrapLongitude(center.longitude + (x - width / 2) / scale),
            latitude: clamp(center.latitude - (y - height / 2) / scale, -90, 90),
        };
    }
    function refreshReadouts() {
        zoomOutput.value = `${zoomLevel.toFixed(1)} 级`;
        centerOutput.textContent = `当前中心 ${coordinateText(center)}`;
        selectedOutput.textContent = selected ? `所选地点 ${coordinateText(selected)}` : '点击地图读取经纬度';
        zoomIn.disabled = zoomLevel >= 8;
        zoomOut.disabled = zoomLevel <= 1;
    }
    function drawPolyline(coordinates, color, lineWidth, dash = []) {
        const worldWidth = 360 * pixelsPerDegree();
        context2d.strokeStyle = color;
        context2d.lineWidth = lineWidth;
        context2d.lineJoin = 'round';
        context2d.lineCap = 'round';
        context2d.setLineDash(dash);
        context2d.beginPath();
        for (const shift of [-worldWidth, 0, worldWidth]) {
            let previousX;
            for (let index = 0; index < coordinates.length;) {
                if (coordinates[index] === 1e7) {
                    previousX = undefined;
                    index++;
                    continue;
                }
                const longitude = coordinates[index++] * radd;
                const latitude = coordinates[index++] * radd;
                if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90.001) {
                    previousX = undefined;
                    continue;
                }
                const point = screenPoint({ longitude, latitude });
                if (previousX === undefined || Math.abs(previousX - point.x) > worldWidth / 2) {
                    context2d.moveTo(point.x + shift, point.y);
                }
                else {
                    context2d.lineTo(point.x + shift, point.y);
                }
                previousX = point.x;
            }
        }
        context2d.stroke();
        context2d.setLineDash([]);
    }
    function draw() {
        frame = 0;
        if (disposed)
            return;
        const bounds = stage.getBoundingClientRect();
        if (bounds.width < 1 || bounds.height < 1)
            return;
        width = bounds.width;
        height = bounds.height;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
        const pixelWidth = Math.round(width * pixelRatio);
        const pixelHeight = Math.round(height * pixelRatio);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        constrainCenter();
        context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context2d.clearRect(0, 0, width, height);
        const styles = getComputedStyle(stage);
        const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
        const text = color('--text', '#1b2235');
        const muted = color('--muted', '#738096');
        const grid = color('--eclipse-map-grid', '#e0e6ed');
        const coast = color('--eclipse-map-coast', '#7c8fa6');
        const border = color('--eclipse-map-country', '#b6c2cf');
        const centerColor = color('--eclipse-map-center', '#df495f');
        const edgeColor = color('--eclipse-map-edge', '#208b68');
        context2d.fillStyle = color('--eclipse-map-ocean', '#f4f7fa');
        context2d.fillRect(0, 0, width, height);
        const gridStep = zoomLevel < 2.5 ? 30 : zoomLevel < 4.5 ? 10 : zoomLevel < 6.5 ? 2 : 1;
        const scale = pixelsPerDegree();
        context2d.strokeStyle = grid;
        context2d.lineWidth = 1;
        context2d.beginPath();
        context2d.font = '11px system-ui, sans-serif';
        context2d.fillStyle = muted;
        for (let longitude = -180; longitude < 180; longitude += gridStep) {
            const { x } = screenPoint({ longitude, latitude: 0 });
            if (x < 0 || x > width)
                continue;
            context2d.moveTo(x, 0);
            context2d.lineTo(x, height);
            context2d.fillText(`${Math.abs(longitude)}°${longitude < 0 ? 'W' : longitude > 0 ? 'E' : ''}`, x + 5, height - 9);
        }
        for (let latitude = -90; latitude <= 90; latitude += gridStep) {
            const { y } = screenPoint({ longitude: 0, latitude });
            if (y < 0 || y > height)
                continue;
            context2d.moveTo(0, y);
            context2d.lineTo(width, y);
            if (y > 14 && y < height - 20)
                context2d.fillText(`${Math.abs(latitude)}°${latitude < 0 ? 'S' : latitude > 0 ? 'N' : ''}`, 8, y - 6);
        }
        context2d.stroke();
        drawPolyline(ditu2, border, 0.75);
        drawPolyline(ditu1, coast, 1.1);
        for (const line of lines.filter((entry) => entry.kind !== 'center')) {
            drawPolyline(line.coordinates, edgeColor, line.kind === 'umbra' ? 1.55 : 1.2, line.kind === 'penumbra' ? [5, 4] : []);
        }
        for (const line of lines.filter((entry) => entry.kind === 'center')) {
            drawPolyline(line.coordinates, centerColor, 2.2);
        }
        if (selected) {
            const point = screenPoint(selected);
            context2d.strokeStyle = text;
            context2d.fillStyle = color('--surface', '#ffffff');
            context2d.lineWidth = 1.7;
            context2d.beginPath();
            context2d.arc(point.x, point.y, 5, 0, Math.PI * 2);
            context2d.fill();
            context2d.stroke();
            context2d.beginPath();
            context2d.moveTo(point.x - 11, point.y);
            context2d.lineTo(point.x - 7, point.y);
            context2d.moveTo(point.x + 7, point.y);
            context2d.lineTo(point.x + 11, point.y);
            context2d.moveTo(point.x, point.y - 11);
            context2d.lineTo(point.x, point.y - 7);
            context2d.moveTo(point.x, point.y + 7);
            context2d.lineTo(point.x, point.y + 11);
            context2d.stroke();
        }
        const rulerDegrees = gridStep;
        const rulerWidth = rulerDegrees * scale;
        if (rulerWidth > 20 && rulerWidth < width / 2) {
            const x = width - rulerWidth - 20;
            context2d.strokeStyle = muted;
            context2d.lineWidth = 1.5;
            context2d.beginPath();
            context2d.moveTo(x, height - 41);
            context2d.lineTo(x, height - 35);
            context2d.lineTo(x + rulerWidth, height - 35);
            context2d.lineTo(x + rulerWidth, height - 41);
            context2d.stroke();
            context2d.fillStyle = muted;
            context2d.fillText(`${rulerDegrees}° 经度`, x + 2, height - 45);
        }
        refreshReadouts();
    }
    function redraw() {
        if (!disposed && !frame)
            frame = requestAnimationFrame(draw);
    }
    function zoom(nextLevel, x = width / 2, y = height / 2) {
        const anchor = geographicPoint(x, y);
        zoomLevel = clamp(nextLevel, 1, 8);
        const scale = pixelsPerDegree();
        center.longitude = anchor.longitude - (x - width / 2) / scale;
        center.latitude = anchor.latitude + (y - height / 2) / scale;
        constrainCenter();
        redraw();
    }
    function reset() {
        zoomLevel = 1;
        center = { longitude: 116.397, latitude: 0 };
        selected = undefined;
        redraw();
    }
    function displayResult(result) {
        lines = [
            { coordinates: result.L1, kind: 'penumbra' },
            { coordinates: result.L2, kind: 'penumbra' },
            { coordinates: result.L3, kind: 'umbra' },
            { coordinates: result.L4, kind: 'umbra' },
            { coordinates: result.L0, kind: 'center' },
        ];
        const time = JD.JD2str(result.jd + J2000).trim();
        eventOutput.textContent = result.lx === 'N'
            ? `输入日期附近的这次朔无日食 · ${time.slice(0, 10)}`
            : `${eclipseName(result.lx)} · 食甚 ${time} TD · 原版类型 ${result.lx}`;
        canvas.setAttribute('aria-label', `${eclipseName(result.lx)}地图，${time.slice(0, 10)}，中心线为红色、本影和半影边界为绿色`);
        redraw();
    }
    function calculate() {
        if (disposed || submit.disabled)
            return;
        errorOutput.hidden = true;
        errorOutput.textContent = '';
        let julianDay;
        try {
            const year = parseYear(element('[name="year"]', form).value);
            const month = Number(element('[name="month"]', form).value);
            const day = Number(element('[name="day"]', form).value);
            if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
                throw new Error('请输入有效月份和日期。');
            }
            julianDay = JD.JD(year, month, day);
            const checked = JD.DD(julianDay);
            if (checked.Y !== year || checked.M !== month || checked.D !== day) {
                throw new Error('该日期不存在，请检查月份天数或 1582 年改历跳日。');
            }
        }
        catch (error) {
            errorOutput.hidden = false;
            errorOutput.textContent = error instanceof Error ? error.message : '日期读取失败。';
            return;
        }
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submitLabel.textContent = '正在计算…';
        calculateTimer = window.setTimeout(() => {
            calculateTimer = 0;
            if (disposed)
                return;
            try {
                const jd = julianDay - J2000;
                rsGS.init(jd, 7);
                displayResult(rsGS.jieX(jd));
            }
            catch (error) {
                errorOutput.hidden = false;
                errorOutput.textContent = error instanceof Error ? error.message : '界线计算失败，请检查日期。';
            }
            finally {
                submit.disabled = false;
                submit.removeAttribute('aria-busy');
                submitLabel.textContent = '计算界线';
            }
        }, 0);
    }
    form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); }, { signal });
    container.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-map-action]') : null;
        if (!target)
            return;
        if (target.dataset.mapAction === 'zoom-in')
            zoom(zoomLevel + 1);
        if (target.dataset.mapAction === 'zoom-out')
            zoom(zoomLevel - 1);
        if (target.dataset.mapAction === 'reset')
            reset();
    }, { signal });
    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const bounds = canvas.getBoundingClientRect();
        zoom(zoomLevel + (event.deltaY < 0 ? 0.3 : -0.3), event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false, signal });
    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || drag)
            return;
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, center: { ...center }, moved: false };
        canvas.classList.add('is-dragging');
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId)
            return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4)
            drag.moved = true;
        center.longitude = drag.center.longitude - dx / pixelsPerDegree();
        center.latitude = drag.center.latitude + dy / pixelsPerDegree();
        constrainCenter();
        redraw();
    }, { signal });
    function finishPointer(event) {
        if (!drag || drag.pointerId !== event.pointerId)
            return;
        if (event.type === 'pointerup' && !drag.moved) {
            const bounds = canvas.getBoundingClientRect();
            selected = geographicPoint(event.clientX - bounds.left, event.clientY - bounds.top);
        }
        if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
        drag = undefined;
        canvas.classList.remove('is-dragging');
        redraw();
    }
    canvas.addEventListener('pointerup', finishPointer, { signal });
    canvas.addEventListener('pointercancel', finishPointer, { signal });
    canvas.addEventListener('keydown', (event) => {
        const step = 50 / pixelsPerDegree();
        const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(event.key);
        if (!handled)
            return;
        event.preventDefault();
        if (event.key === 'ArrowLeft')
            center.longitude -= step;
        if (event.key === 'ArrowRight')
            center.longitude += step;
        if (event.key === 'ArrowUp')
            center.latitude += step;
        if (event.key === 'ArrowDown')
            center.latitude -= step;
        if (event.key === '+' || event.key === '=')
            zoom(zoomLevel + 1);
        if (event.key === '-' || event.key === '_')
            zoom(zoomLevel - 1);
        if (event.key === 'Home')
            reset();
        constrainCenter();
        redraw();
    }, { signal });
    const resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(stage);
    const themeObserver = new MutationObserver(redraw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    redraw();
    calculate();
    return {
        redraw,
        destroy() {
            disposed = true;
            abortController.abort();
            resizeObserver.disconnect();
            themeObserver.disconnect();
            if (frame)
                cancelAnimationFrame(frame);
            if (calculateTimer)
                window.clearTimeout(calculateTimer);
            if (drag && canvas.hasPointerCapture(drag.pointerId))
                canvas.releasePointerCapture(drag.pointerId);
            container.replaceChildren();
        },
    };
}
