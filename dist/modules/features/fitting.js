export function fitDiscreteSequence(sequence, slope, intercept, width) {
    let k = slope;
    let b = intercept;
    const A = 1;
    let k1 = k - 1;
    let k2 = k + 1;
    let iteration = 0;
    for (; iteration < 10; iteration++) {
        let f1 = -1e9;
        let f2 = 1e9;
        let x1 = -1;
        for (let i = 0; i < sequence.length; i++) {
            const value = sequence[i] - (k * i + b);
            if (value > f1) {
                f1 = value;
                x1 = i;
            }
            if (value < f2)
                f2 = value;
        }
        if (f2 + width - f1 > 0) {
            const halfWidth = (f2 + A - f1) / 2;
            b += f1 + halfWidth;
            return { status: 'ok', slope: k, intercept: b, halfWidth };
        }
        for (let i = 0; i < sequence.length; i++) {
            if (i === x1)
                continue;
            const value = (sequence[i] + width - sequence[x1]) / (i - x1);
            if (i < x1 && value > k1)
                k1 = value;
            if (i > x1 && value < k2)
                k2 = value;
            if (k1 > k2)
                return { status: '无解' };
        }
        k = (k1 + k2) / 2;
    }
    return { status: `查找${iteration}次未找到解` };
}
export function mountFitting(root) {
    const result = root.querySelector('#Cjg');
    if (!result)
        return () => undefined;
    result.readOnly = true;
    result.setAttribute('aria-live', 'polite');
    const source = root.querySelector('#progText');
    if (source) {
        source.style.whiteSpace = 'pre-wrap';
        source.textContent = '拟合函数 TypeScript 迁移后运行代码：\n' + fitDiscreteSequence.toString();
    }
    const read = (id) => {
        const element = root.querySelector(`#${id}`);
        if (!element || !element.value.trim())
            throw new Error('请填写完整的拟合参数。');
        const value = Number(element.value);
        if (!Number.isFinite(value))
            throw new Error('参数必须是有限数值。');
        return value;
    };
    const handle = (event) => {
        const button = event.target.closest('[data-action="fit"]');
        if (!button || !root.contains(button))
            return;
        try {
            const generatorSlope = read('Ck');
            const generatorIntercept = read('Cb');
            const count = read('Cn');
            if (!Number.isInteger(count) || count < 1 || count > 100000) {
                throw new Error('序列长度 N 需为 1 至 100000 的整数。');
            }
            const k = read('Ck0');
            const b = read('Cb0');
            const a = read('Ca0');
            if (a <= 0)
                throw new Error('上下线纵向差 a 必须大于 0。');
            const sequence = Array.from({ length: count }, (_, index) => Math.floor(index * generatorSlope + generatorIntercept));
            const fit = fitDiscreteSequence(sequence, k, b, a);
            result.value = fit.status === 'ok'
                ? `k=${fit.slope} b=${fit.intercept} h=${fit.halfWidth}`
                : fit.status;
        }
        catch (error) {
            result.value = error instanceof Error ? error.message : '拟合失败。';
        }
    };
    root.addEventListener('click', handle);
    return () => root.removeEventListener('click', handle);
}
