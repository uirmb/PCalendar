import { ditu0, ditu1, ditu2, touY, rad, rad2mrad, rad2rrad } from '../engine/engine.js';
const TWO_PI = 2 * Math.PI;
function circle(ctx, x, y, radius, color, fill = false) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0)
        return;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TWO_PI);
    ctx.closePath();
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    }
    else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}
function line(ctx, x1, y1, x2, y2, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.closePath();
}
function text(ctx, x, y, value, color = '#334155', font = '12px system-ui') {
    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
}
class CanvasDrawing {
    canvas;
    ctx;
    width = 0;
    height = 0;
    init(canvas) {
        if (this.canvas === canvas)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('当前浏览器无法建立 Canvas 2D 绘图上下文。');
        this.canvas = canvas;
        this.ctx = ctx;
        this.width = canvas.width;
        this.height = canvas.height;
        this.ctx.lineWidth = 1;
    }
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
/** 我保留原图的角度刻度、缩放倍率和投影方程，只更新图形配色。 */
export class SunMoonDrawing extends CanvasDrawing {
    x0 = 0;
    y0 = 0;
    dx = 0;
    dy = 0;
    vs = 0;
    vx = 0;
    vy = 0;
    path = [];
    landmarks = [
        [116.4, 40, '北京'], [119, 25.4, '莆田'], [91, 29.7, '拉萨'], [-73, 41, '纽约'],
        [151, -34, '悉尼'], [37, 56, '莫斯科'], [30, -20, '非洲南部'], [-56, -33, '乌拉圭'],
    ];
    showzb() {
        const dx = this.dx = Math.floor(this.width / 8.5);
        const dy = this.dy = Math.floor(this.height / 8);
        const x0 = this.x0 = Math.floor((this.width - dx * 8) / 2);
        const y0 = this.y0 = Math.floor(dy * 6) + 3;
        this.vs = dx;
        this.vx = x0 + 4 * dx;
        this.vy = y0 - 3 * dy;
        this.clear();
        this.ctx.beginPath();
        this.ctx.fillStyle = '#e2e8f0';
        for (let i = 0; i < ditu0.length; i += 2) {
            const move = ditu0[i] === 1e7;
            if (move)
                i++;
            const x = x0 + 8 * dx * Number(ditu0[i]) / 2009;
            const y = y0 - 6 * dy * (1 - Number(ditu0[i + 1]) / 970);
            if (move)
                this.ctx.moveTo(x, y);
            else
                this.ctx.lineTo(x, y);
        }
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#cbd5e1';
        for (let i = 0; i <= 6; i++) {
            const y = y0 - i * dy + 0.5;
            this.ctx.moveTo(x0, y);
            this.ctx.lineTo(x0 + dx * 8, y);
            if (i)
                text(this.ctx, x0 + 2, y, `${15 * i}(${i > 3 ? '+' : ''}${30 * (i - 3)})`);
        }
        for (let i = 0; i <= 8; i++) {
            const x = x0 + i * dx + 0.5;
            this.ctx.moveTo(x, y0);
            this.ctx.lineTo(x, y0 - dy * 6);
            if (i > 0 && i < 8)
                text(this.ctx, x - 10, y0, `${30 * (i - 4)}(${i <= 4 ? 45 * i : 45 * i - 360})`);
        }
        this.ctx.stroke();
        for (const [longitude, latitude, name] of this.landmarks) {
            const j = (longitude < 0 ? longitude + 360 : longitude) / 45;
            const w = latitude / 30 + 3;
            text(this.ctx, x0 + dx * j - 5, y0 - dy * w - 8, `·${name}`);
        }
    }
    draw1(body, longitude, latitude, north) {
        if (north)
            longitude -= Math.PI;
        const j = rad2rrad(longitude) * 180 / Math.PI / 30 + 4;
        const w = latitude * 180 / Math.PI / 15;
        circle(this.ctx, this.x0 + j * this.dx, this.y0 - w * this.dy, 4, body === 'sun' ? '#ef4444' : '#ca8a04', true);
    }
    draw1b(body, longitude, latitude, siderealTime) {
        const w = latitude * 180 / Math.PI / 30 + 3;
        const j = rad2mrad(longitude - siderealTime) * 180 / Math.PI / 45;
        circle(this.ctx, this.x0 + j * this.dx, this.y0 - w * this.dy, 4, body === 'sun' ? '#ef4444' : '#ca8a04', true);
    }
    draw2a(j1, w1, j2, w2, moonRadius, sunRadius) {
        const v = this.vs;
        const dj = -rad2rrad(j1 - j2) * Math.cos((w1 + w2) / 2) * rad * v / 32 / 60;
        const dw = (w1 - w2) * rad * v / 32 / 60;
        if (Math.abs(dj) > 3.5 * this.dx || Math.abs(dw) > 2.5 * this.dy)
            return;
        circle(this.ctx, this.vx, this.vy, v / 32 * sunRadius / 60, '#ef4444', true);
        circle(this.ctx, this.vx + dj, this.vy - dw, v / 32 * moonRadius / 60, '#b6a630', true);
    }
    draw2b(j1, w1, j2, w2, moonRadius, umbra, penumbra) {
        const v = this.vs / 2;
        const dj = -rad2rrad(j1 - j2) * Math.cos((w1 + w2) / 2) * rad * v / 32 / 60;
        const dw = (w1 - w2) * rad * v / 32 / 60;
        if (Math.abs(dj) > 3.5 * this.dx || Math.abs(dw) > 2.5 * this.dy)
            return;
        circle(this.ctx, this.vx + dj, this.vy - dw, v / 32 * moonRadius / 60, '#b6a630', true);
        circle(this.ctx, this.vx, this.vy, v / 32 * penumbra / 60, 'rgba(15,23,42,.2)', true);
        circle(this.ctx, this.vx, this.vy, v / 32 * umbra / 60, 'rgba(15,23,42,.4)', true);
    }
    draw3(longitude, latitude, preserve) {
        if (!preserve)
            this.path.length = 0;
        if (Math.abs(longitude) <= TWO_PI || Math.abs(latitude) <= Math.PI) {
            const j = rad2mrad(longitude) / Math.PI * 180 / 45;
            const w = latitude / Math.PI * 180 / 30 + 3;
            this.path.push(this.x0 + this.dx * j - 3, this.y0 - this.dy * w);
        }
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#ef4444';
        for (let i = 0; i < this.path.length; i += 2) {
            const x = this.path[i], y = this.path[i + 1];
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x - 3, y + 8);
            this.ctx.lineTo(x + 3, y + 8);
            this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
        this.ctx.closePath();
    }
}
export class BesselDrawing extends CanvasDrawing {
    line1(features, ecliptic) {
        const rows = Array.isArray(features) ? features : [features];
        const radius = 140, outerRadius = radius * 1.2, x0 = 240, y0 = 210;
        this.clear();
        circle(this.ctx, x0, y0, radius, '#334155');
        line(this.ctx, x0 - outerRadius, y0, x0 + outerRadius, y0, '#64748b');
        line(this.ctx, x0, y0 + outerRadius, x0, y0 - outerRadius, '#64748b');
        for (const row of rows) {
            if (row.d > 1.6)
                continue;
            let xc = row.xc, yc = row.yc, slope = row.k;
            if (ecliptic) {
                const distance = Math.sqrt(xc * xc + yc * yc);
                const angle = Math.atan2(yc, xc) + row.ds, dk = Math.tan(row.ds);
                xc = distance * Math.cos(angle);
                yc = distance * Math.sin(angle);
                slope = (slope + dk) / (1 - slope * dk);
                text(this.ctx, 390, 210, '贝黄交线', '#dc2626', '16px system-ui');
            }
            else {
                const angle = Math.PI / 2 - row.I[1];
                circle(this.ctx, x0, y0 - radius * Math.cos(angle), 3, angle > 0 ? '#0ea5e9' : '#0f172a', true);
                text(this.ctx, 390, 210, '贝赤交线', '#dc2626', '16px system-ui');
            }
            text(this.ctx, 10, 30, '影轴 · 贝塞尔交线', '#dc2626', '16px system-ui');
            line(this.ctx, x0 - outerRadius, y0 - (slope * (-1.2 - xc) + yc) * radius, x0 + outerRadius, y0 - (slope * (1.2 - xc) + yc) * radius, '#334155');
        }
    }
}
export class EclipseMapDrawing extends CanvasDrawing {
    radius = 250;
    x0 = 350;
    y0 = 260;
    lineArray(data, color) {
        const projected = touY.lineArr(data);
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        for (let i = 0; i < projected.length; i += 2) {
            const move = projected[i] === 1e7;
            if (move)
                i++;
            const x = this.x0 + this.radius * projected[i];
            const y = this.y0 - this.radius * projected[i + 1];
            if (move)
                this.ctx.moveTo(x, y);
            else
                this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }
    grid(n, m) {
        const points = [], count = 96;
        for (let k = 0; k < m; k++) {
            for (let i = 0; i <= count; i++) {
                points[2 * i] = i * TWO_PI / count;
                points[2 * i + 1] = (k + 1) * Math.PI / (m + 1) - Math.PI / 2;
            }
            this.lineArray(points, '#e2e8f0');
        }
        for (let k = 0; k < n; k++) {
            for (let i = 0; i <= count; i++) {
                points[2 * i] = k * TWO_PI / n;
                points[2 * i + 1] = i * Math.PI / count - Math.PI / 2;
            }
            this.lineArray(points, '#e2e8f0');
        }
    }
    connect(p1, n1, p2, n2, color) {
        if (!p1.length || !p2.length)
            return;
        if (n1 === -1)
            n1 = p1.length - 2;
        if (n2 === -1)
            n2 = p2.length - 2;
        this.lineArray([p1[n1], p1[n1 + 1], p2[n2], p2[n2 + 1]], color);
    }
    draw(boundaries, longitude, latitude, radius, local, projection) {
        const primary = '#ef6262', secondary = '#16a34a';
        touY.setlx(projection, longitude, latitude, local);
        this.radius = radius;
        this.x0 = this.width * radius / 250 / 2;
        this.y0 = this.height * radius / 250 / 2;
        this.canvas.width = this.width * radius / 250;
        this.canvas.height = this.height * radius / 250;
        this.clear();
        this.lineArray(ditu1, '#94a3b8');
        this.lineArray(ditu2, '#c7d2fe');
        this.grid(24, 11);
        for (const key of ['p1', 'p2', 'p3', 'p4', 'q1', 'q2', 'q3', 'q4', 'L0', 'L1', 'L2', 'L3', 'L4'])
            this.lineArray(boundaries[key], primary);
        this.connect(boundaries.p1, 0, boundaries.p2, 0, primary);
        this.connect(boundaries.p1, boundaries.p1.length - 2, boundaries.p2, boundaries.p1.length - 2, primary);
        this.connect(boundaries.p3, 0, boundaries.p4, 0, primary);
        this.connect(boundaries.p3, boundaries.p3.length - 2, boundaries.p4, boundaries.p3.length - 2, primary);
        this.lineArray(boundaries.L5, secondary);
        this.lineArray(boundaries.L6, secondary);
        if (!([3, 4, 5, 6].includes(projection) || local[2] < 1 || local[3] < 1))
            circle(this.ctx, this.x0, this.y0, this.radius, '#334155');
    }
    draw2(shadow) {
        this.lineArray(shadow.p3, '#818cf8');
        this.lineArray(shadow.p1, '#0f172a');
        this.lineArray(shadow.p2, '#0f172a');
    }
}
export function createDrawings() {
    return { tu1: new SunMoonDrawing(), tu2: new BesselDrawing(), tu3: new EclipseMapDrawing() };
}
