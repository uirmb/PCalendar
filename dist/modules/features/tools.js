import { JD } from '../engine/engine.js';
import { FeatureDOM, year2Ayear, timeStr2hour } from './dom.js';
class MachinCalculator {
    a = [];
    b = [];
    c = [];
    base = 10_000_000_000;
    add(a, b, count) {
        for (let i = count - 1, carry = 0; i >= 0; i--) {
            a[i] = a[i] + b[i] + carry;
            if (a[i] >= this.base) {
                a[i] -= this.base;
                carry = 1;
            }
            else
                carry = 0;
        }
    }
    subtract(a, b, result, count) {
        for (let i = count - 1, carry = 0; i >= 0; i--) {
            result[i] = a[i] - b[i] - carry;
            if (result[i] < 0) {
                result[i] += this.base;
                carry = 1;
            }
            else
                carry = 0;
        }
    }
    divide(a, denominator, count) {
        for (let i = 0, carry = 0; i < count; i++) {
            const value = a[i] + carry * this.base;
            a[i] = Math.floor((value + 0.1) / denominator);
            carry = value % denominator;
        }
    }
    reciprocal(a, numerator, denominator, count) {
        a[0] = Math.floor(numerator / denominator);
        numerator %= denominator;
        for (let i = 1; i < count; i++) {
            const value = numerator * this.base;
            a[i] = Math.floor((value + 0.1) / denominator);
            numerator = value % denominator;
        }
    }
    arctangent(k, multiplier, sign, count) {
        let i = Math.round(count * 23.1 / Math.log(k * k));
        const total = i;
        for (; i >= 0; i--) {
            const digits = Math.min(count, Math.round((total - i) * count / total) + 1);
            this.reciprocal(this.c, multiplier, 2 * i + 1, digits);
            this.divide(this.b, k * k, digits);
            this.subtract(this.c, this.b, this.b, digits);
        }
        this.divide(this.b, k, count);
        if (sign > 0)
            this.add(this.a, this.b, count);
        else
            this.subtract(this.a, this.b, this.a, count);
    }
    calculate(digits) {
        const count = Math.floor(digits / 10 + 1.5);
        this.a = new Array(count).fill(0);
        this.b = new Array(count).fill(0);
        this.c = new Array(count).fill(0);
        this.arctangent(5, 16, 1, count);
        this.arctangent(239, 4, -1, count);
        return this.a.slice(1).map((value, index) => String(this.base + value).slice(1, 11) + ((index + 1) % 10 === 0 ? '<br>' : ' ')).join('');
    }
}
export class CalendarTools {
    dom;
    constructor(dom) {
        this.dom = dom;
    }
    GJ1_calc1() {
        const jd = this.dom.number('GJ1_jd');
        this.dom.text('GJ1_out', jd < 0 ? '不能为负' : JD.JD2str(jd));
    }
    GJ1_calc2(mode) {
        const d = this.dom;
        const year = year2Ayear(d.value('GJ1_y'));
        let jd = JD.JD(year, d.number('GJ1_m'), d.number('GJ1_d') + timeStr2hour(d.value('GJ1_t')) / 24);
        let result;
        if (mode === 1) {
            jd -= d.number('GJ1_jd');
            result = String(jd) + (jd >= 0 ? ` (${JD.JD2str(jd)})` : '');
        }
        else {
            if (mode === 2)
                jd -= JD.JD(year, 1, 1.5) - 1;
            if (mode === 3)
                jd -= JD.JD(year2Ayear(d.value('GJ1_y2')), d.number('GJ1_m2'), d.number('GJ1_d2') + timeStr2hour(d.value('GJ1_t2')) / 24);
            result = String(jd);
        }
        d.text('GJ1_out', result);
    }
    GJ2_pi1(mode) {
        const sine = '正弦迭代 T=2−√(4−T)', cosine = '余弦迭代 T=2+√T';
        let sides = mode % 2 === 0 ? 6 : 4;
        let t = mode % 2 === 0 ? 1 : mode === 1 ? 0 : 2;
        let pi = 0;
        const title = `刘徽割圆 · ${sides} 边 · ${mode < 2 ? cosine : sine}${mode >= 4 ? ' · 补弧田加速' : ''}`;
        const rows = [];
        for (let i = 0; i < 30; i++) {
            sides *= 2;
            if (mode < 2) {
                t = 2 + Math.sqrt(t);
                pi = sides * Math.sqrt(2 - Math.sqrt(t)) / 2;
            }
            else {
                t /= 2 + Math.sqrt(4 - t);
                pi = sides * Math.sqrt(t) * (mode >= 4 ? 1 + t / 24 : 1) / 2;
            }
            rows.push(`<tr><td>${i + 1}</td><td>${sides}</td><td>${t}</td><td>${pi}</td></tr>`);
        }
        this.dom.html('GJ2_out', `<h3>${title}</h3><table><thead><tr><th>割圆次数</th><th>边数</th><th>T</th><th>π</th></tr></thead><tbody>${rows.join('')}</tbody></table>`);
    }
    rounded(value, precision) {
        const scale = Math.max(1, Math.pow(10, Math.floor(Math.log(value / precision) / 2.3)));
        return Math.floor(value / scale + 0.5) * scale;
    }
    GJ2_pi2() {
        const radius = this.dom.number('GJ2_r', 1);
        let sides = 6, t = radius * radius;
        const rows = [];
        for (let i = 0; i < 25; i++) {
            sides *= 2;
            t /= 2 + Math.sqrt(4 * radius * radius - t) / radius;
            t = this.rounded(t, radius);
            if (t < radius)
                break;
            const chord = this.rounded(Math.sqrt(t), 100);
            const area = this.rounded(chord * chord * chord / 64 * sides / radius / radius, 100);
            const preciseArea = this.rounded(area * 4 / 3, 100);
            const pi = Math.floor(sides * Math.sqrt(t) / 2 + 0.5);
            rows.push(`<tr><td>${i + 1}</td><td>${sides}</td><td>${t}</td><td>${chord}</td><td>${area}</td><td>${preciseArea}</td><td>${pi}</td></tr>`);
        }
        this.dom.html('GJ2_out', '<h3>祖冲之割圆术模拟</h3><p>从六边形开始，T=R²。弦长、差幂按原版方式截断以模拟人工计算；圆周率使用全精度求值。</p>'
            + '<p>差幂 ΔS=aR(H/4R)³，精差幂 ΔJ=4ΔS/3。</p><div class="feature-table-wrap"><table><thead><tr><th>次数</th><th>边数</th><th>T</th><th>弦长 H</th><th>差幂 ΔS</th><th>精差幂 ΔJ</th><th>π（毫）</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
    }
    GJ2_pi() {
        const count = this.dom.count('GJ2_N', 99999) + 1;
        const digits = new Array(count).fill(0);
        let i = Math.round(3.4 * count), denominator = 2 * i + 1;
        for (; i > 0; i--, denominator -= 2, digits[0] += 2) {
            for (let j = 0, carry = 0; j < count; j++) {
                carry = digits[j] * i + carry * 10;
                digits[j] = Math.floor(carry / denominator);
                carry %= denominator;
            }
        }
        for (let j = count - 1; j > 0; j--) {
            digits[j - 1] += Math.floor(digits[j] / 10);
            digits[j] %= 10;
        }
        const formatted = digits.slice(1).map((value, index) => String(value) + ((index + 1) % 10 === 0 ? ' ' : '') + ((index + 1) % 100 === 0 ? '<br>' : '')).join('');
        this.dom.html('GJ2_out', '<h3>现代多精度算法</h3><p>π/2=1+1/3+1·2/(1·3·5)+1·2·3/(1·3·5·7)+…</p>'
            + '<p>提取公因子后迭代 a=2+a·n/(2n+1)，n 从 N 递减至 1。保留原算法精度边界，最后 5 位可能有误。</p>'
            + `<p class="feature-pi-digits">π = 3.<br>${formatted}</p>`);
    }
    GJ2_machin() {
        const digits = this.dom.count('GJ2_N', 99999);
        const value = new MachinCalculator().calculate(digits);
        this.dom.html('GJ2_out', '<h3>Machin 公式 · 百亿进制优化</h3><p>π=16 arctan(1/5)−4 arctan(1/239)。保留原算法精度边界，最后 5 位可能有误。</p>'
            + `<p class="feature-pi-digits">π = 3.<br>${value}</p>`);
    }
    GJ2_cls() { this.dom.html('GJ2_out', ''); }
}
