import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CalendarTools } from '../src/features/tools.ts';
import { FeatureDOM, year2Ayear, Ayear2year, timeStr2hour } from '../src/features/dom.ts';
import { comparePrecision, compareInversions, measureSpeed } from '../src/features/diagnostics.ts';
import { fitDiscreteSequence } from '../src/features/fitting.ts';
import { OriginalOracle, assertEquivalent } from './oracle.ts';

interface MemoryField {
  value: string;
  textContent: string;
  innerHTML: string;
  focus(): void;
  getAttribute(name: string): string;
}

/** 我只替换表单的存取边界；π/JD 运算仍走实际生产 CalendarTools。 */
function createMemoryTools(values: Record<string, string> = {}) {
  const fields = new Map<string, MemoryField>();
  const field = (id: string): MemoryField => {
    if (!fields.has(id)) fields.set(id, { value: values[id] ?? '', textContent: '', innerHTML: '', focus() {}, getAttribute() { return id; } });
    return fields.get(id)!;
  };
  const root = { querySelector(selector: string) { return field(selector.match(/\[id="(.+)"\]/)![1]!); } } as unknown as HTMLElement;
  return { tools: new CalendarTools(new FeatureDOM(root)), field };
}

function numericTable(html: string): number[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]!.replace(/<[^>]*>/g, '').trim()))
    .filter((row) => row.length > 0 && /^\d+$/.test(row[0]!))
    .map((row) => row.map(Number));
}

function modernPi(html: string): string {
  const content = html.match(/class="feature-pi-digits">([\s\S]*?)<\/p>/)![1]!;
  return content.replace(/<[^>]+>|\s|π|=/g, '');
}

function originalPi(html: string): string {
  return html.slice(html.indexOf('PI=3.') + 3).replace(/<[^>]+>|\s/g, '');
}

test('year notations and valid clock strings retain their original meaning', () => {
  const original = new OriginalOracle();
  for (const input of ['B212', 'b212', '*212', '-211', 'B1', '*1', '0', '-4712', '2000', '2033', '9999']) {
    assertEquivalent(year2Ayear(input), original.evaluate('year2Ayear(_input)', { _input: input }), `year ${input}`);
  }
  for (const year of [-4712, -211, 0, 1, 2000, 9999]) {
    assertEquivalent(Ayear2year(year), original.evaluate('Ayear2year(_input)', { _input: year }), `year display ${year}`);
  }
  for (const input of ['00:00:00', '12:34:56', '18:17:15.25', '12:30', '123456', '8:5:3', '23:59:59', '24:00:00']) {
    assertEquivalent(timeStr2hour(input), original.evaluate('timeStr2hour(_input)', { _input: input }), `clock ${input}`);
  }
  assert.throws(() => year2Ayear('B0'));
  assert.throws(() => year2Ayear(''));
  assert.throws(() => timeStr2hour('not-a-time'));
});

test('all six polygon π modes preserve every numeric iteration row', () => {
  const original = new OriginalOracle(true);
  original.evaluate('var GJ2_out={innerHTML:""};');
  const { tools, field } = createMemoryTools();
  for (let mode = 0; mode < 6; mode++) {
    tools.GJ2_pi1(mode);
    const expected = original.evaluate<string>('GJ2_pi1(_mode); GJ2_out.innerHTML', { _mode: mode });
    assertEquivalent(numericTable(field('GJ2_out').innerHTML), numericTable(expected), `polygon mode ${mode}`);
    assert.equal(numericTable(field('GJ2_out').innerHTML).length, 30);
  }
});

test('Zu Chongzhi radius simulation preserves the rounded historical calculation', () => {
  const original = new OriginalOracle(true);
  original.evaluate('var GJ2_out={innerHTML:""}; var GJ2_r={value:"100000000"};');
  const { tools, field } = createMemoryTools();
  for (const radius of [1000, 100000, 100000000, 10000000000]) {
    field('GJ2_r').value = String(radius);
    tools.GJ2_pi2();
    const expected = original.evaluate<string>('GJ2_r.value=_radius; GJ2_pi2(); GJ2_out.innerHTML', { _radius: String(radius) });
    assertEquivalent(numericTable(field('GJ2_out').innerHTML), numericTable(expected), `Zu radius ${radius}`);
  }
});

test('modern and Machin π algorithms keep every computed digit, including original tail precision', () => {
  const original = new OriginalOracle(true);
  original.evaluate('var GJ2_out={innerHTML:""}; var GJ2_N={value:"100"};');
  const { tools, field } = createMemoryTools();
  for (const digits of [10, 50, 100, 500, 1000]) {
    field('GJ2_N').value = String(digits);
    tools.GJ2_pi();
    const expected = original.evaluate<string>('GJ2_N.value=_digits; GJ2_pi(); GJ2_out.innerHTML', { _digits: String(digits) });
    assert.equal(modernPi(field('GJ2_out').innerHTML), originalPi(expected), `modern π ${digits}`);
    tools.GJ2_machin();
    const expectedMachin = original.evaluate<string>('GJ2_machin.pi(); GJ2_out.innerHTML');
    assert.equal(modernPi(field('GJ2_out').innerHTML), originalPi(expectedMachin), `Machin π ${digits}`);
  }
  tools.GJ2_cls();
  assert.equal(field('GJ2_out').innerHTML, '');
});

test('Julian tools retain all modes, positive/negative differences and BCE input', () => {
  const original = new OriginalOracle(true);
  const base = {
    GJ1_jd: '2451545', GJ1_y: '2026', GJ1_m: '10', GJ1_d: '6', GJ1_t: '12:00:00',
    GJ1_y2: '2000', GJ1_m2: '1', GJ1_d2: '1', GJ1_t2: '12:00:00',
  };
  const { tools, field } = createMemoryTools(base);
  for (const year of ['2026', '1582', 'B212', 'B1', '9999']) {
    const values = { ...base, GJ1_y: year };
    for (const [id, value] of Object.entries(values)) field(id).value = value;
    const bindings = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
    original.evaluate('var GJ1_out={innerHTML:""};', bindings);
    for (let mode = 0; mode < 4; mode++) {
      tools.GJ1_calc2(mode);
      const expected = original.evaluate<unknown>('GJ1_calc2(_mode); GJ1_out.innerHTML', { _mode: mode });
      assert.equal(field('GJ1_out').textContent.replace(/\s+/g, ''), String(expected).replace(/\s+/g, ''), `JD tool ${year}/${mode}`);
    }
  }
  for (const jd of ['-1', '0', '2299160.5', '2451545', '3000000.25']) {
    field('GJ1_jd').value = jd;
    tools.GJ1_calc1();
    assert.equal(field('GJ1_out').textContent, original.evaluate('GJ1_jd.value=_jd;GJ1_calc1();GJ1_out.innerHTML', { _jd: jd }));
  }
});

test('hidden precision diagnostics retain original source sampling and max error', () => {
  const original = new OriginalOracle();
  const html = readFileSync(new URL('./fixtures/original/index.htm', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('function dingQi_cmp'), html.indexOf('function K_show'));
  original.evaluate('var year={value:"2000"}; var testN={value:"24"};var out={innerHTML:""};\n' + source);
  for (const year of [-4712, -721, 0, 1582, 1900, 2000, 2026, 2033, 9999]) {
    for (const count of [1, 24, 100]) {
      for (const kind of ['solar-term', 'new-moon'] as const) {
        const functionName = kind === 'solar-term' ? 'dingQi_cmp' : 'dingSuo_cmp';
        const report = original.evaluate<string>(`year.value=_year;testN.value=_count;${functionName}();out.innerHTML`, { _year: year, _count: count });
        const maximum = Number(report.match(/最大差异:(\d+)秒/)![1]);
        assert.equal(comparePrecision(kind, year, count).maxDifferenceSeconds, maximum);
      }
    }
  }
});

test('solar and lunar inverse diagnostics reproduce the original forward/inverse calculation', () => {
  const original = new OriginalOracle();
  for (const days of [-1000000, -152384.5, 0, 2926.5, 9775.123456, 365250]) {
    const result = compareInversions(days);
    const expected = original.evaluate(`
      var _functions=[['M_Lon','M_Lon_t'],['E_Lon','E_Lon_t'],['MS_aLon','MS_aLon_t']];
      _functions.map(function(f){var L=XL[f[0]](_days/36525,-1,60);var T=XL[f[1]](L)*36525;return {longitude:L,inputJulianDays:_days,reconstructedJulianDays:T,errorSeconds:(T-_days)*86400};})
    `, { _days: days });
    assertEquivalent(result, expected, 'inverse diagnostics');
  }
});

test('diagnostic speed uses 1000 actual calculations per precision and validates parameters', () => {
  for (const kind of ['solar-term', 'new-moon'] as const) {
    const result = measureSpeed(kind);
    assert.equal(result.iterations, 1000);
    assert.ok(Number.isFinite(result.accurateMilliseconds) && result.accurateMilliseconds >= 0);
    assert.ok(Number.isFinite(result.approximateMilliseconds) && result.approximateMilliseconds >= 0);
  }
  assert.throws(() => comparePrecision('solar-term', 10000, 24));
  assert.throws(() => comparePrecision('new-moon', 2000, 0));
  assert.throws(() => compareInversions(Number.NaN));
});

test('interactive help chapter six fitting example matches the original algorithm', () => {
  const original = new OriginalOracle();
  const html = readFileSync(new URL('./fixtures/original/sm6.htm', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('function nihe'), html.indexOf('progText.innerText'));
  original.evaluate(source);
  for (const [slope, intercept, count, initial, width] of [
    [29.5306, 0.35789, 3000, 29.5, 0.99998], [365.2422, 0.12, 2000, 365.2, 0.9998],
    [12.34, 0.99, 500, 12.3, 0.9998], [-2.123, 4.6, 1000, -2.1, 0.9998],
    [1, 0, 12, 1, 0.99998], [29.53, 0.35, 100, 0, 0.1],
  ]) {
    const sequence = Array.from({ length: count! }, (_, index) => Math.floor(index * slope! + intercept!));
    const expected = original.evaluate('var _copy=_sequence.slice();var _status=nihe(_copy,_k,0,_a);({status:_status,slope:_copy.gk,intercept:_copy.gb,halfWidth:_copy.gh})', { _sequence: sequence, _k: initial, _a: width });
    assertEquivalent(fitDiscreteSequence(sequence, initial!, 0, width!), expected, 'help fitting example');
  }
});
