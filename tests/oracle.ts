import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createContext, runInContext, type Context } from 'node:vm';
import assert from 'node:assert/strict';

/**
 * 我只在隔离的 VM 中执行原始 JS，让其原型扩展和脚本全局留在基准环境。
 * 生产页面不会导入此目录。fixture 的哈希用于防止把改写后的源码误当作基准。
 */
export class OriginalOracle {
  private readonly context: Context;

  constructor(includeTools = false) {
    this.context = createContext({ console, alert: (_message: string) => undefined });
    const manifestUrl = new URL('./fixtures/original/manifest.json', import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as {
      files: Array<{ file: string; sha256: string; bytes: number }>;
    };
    for (const source of manifest.files) {
      if (!includeTools && source.file === 'page_gj.js') continue;
      const url = new URL(`./fixtures/original/${source.file}`, import.meta.url);
      const data = readFileSync(url);
      assert.equal(createHash('sha256').update(data).digest('hex'), source.sha256,
        `Original fixture modified: ${source.file}`);
      assert.equal(data.length, source.bytes);
      if (!source.file.endsWith('.js')) continue;
      runInContext(data.toString('utf8'), this.context, { filename: fileURLToPath(url) });
    }
  }

  evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
    Object.assign(this.context, bindings);
    return runInContext(source, this.context) as T;
  }
}

/** 我按原始对象实际输出的字段逐个比较，也保留 Array 上挂载的命名属性。 */
export function assertEquivalent(actual: unknown, expected: unknown, path = 'result'): void {
  if (typeof expected === 'function') return;
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number', `${path}: result type`);
    if (Number.isNaN(expected)) {
      assert.ok(Number.isNaN(actual), `${path}: expected original NaN`);
    } else {
      assert.ok(actual === expected,
        `${path}: ${String(actual)} !== original ${String(expected)}`);
    }
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    assert.equal(actual, expected, path);
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object', `${path}: expected object`);
  const reference = expected as Record<string, unknown>;
  const observed = actual as Record<string, unknown>;
  for (const key of Object.keys(reference)) {
    if (typeof reference[key] === 'function') continue;
    assertEquivalent(observed[key], reference[key], `${path}.${key}`);
  }
}

export function deterministicYears(count: number): number[] {
  let seed = 0x5a17c0de;
  return Array.from({ length: count }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return -4712 + (seed % 14712);
  });
}
