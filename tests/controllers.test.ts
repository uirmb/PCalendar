import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Calculations } from '../src/features/calculations.ts';
import { EclipseCalculations } from '../src/features/eclipses.ts';
import { FeatureDOM } from '../src/features/dom.ts';
import type { FeatureContext } from '../src/features/types.ts';
import { OriginalOracle } from './oracle.ts';

const originalHTML = readFileSync(new URL('./fixtures/original/index.htm', import.meta.url), 'utf8');
const source = [...originalHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
// 原 fixture 的顶层函数采用行首声明、行首结束大括号；只抽取声明，不执行页面启动代码。
const functions = new Map<string, string>();
for (const match of source.matchAll(/^function\s+(\w+)\([^)]*\)\s*\{([^\r\n]*)/gm)) {
  const start = match.index!;
  const singleLine = match[0].trimEnd().endsWith('}');
  const end = singleLine ? start + match[0].length : source.indexOf('\n}', start) + 2;
  assert.ok(end > start, `Original declaration not found: ${match[1]}`);
  functions.set(match[1]!, source.slice(start, end));
}

interface Field {
  value: string;
  checked: boolean;
  innerHTML: string;
  textContent: string;
  selectedIndex: number;
  options: Array<{ value: string }>;
  hidden: boolean;
  style: Record<string, string>;
  width: number;
  height: number;
  getContext(type: string): unknown;
  focus(): void;
  getAttribute(name: string): string;
}

function createHarness() {
  const canvasContext = new Proxy<Record<string, unknown>>({}, {
    get(target, property: string) { return target[property] ?? (() => undefined); },
    set(target, property: string, value: unknown) { target[property] = value; return true; },
  });
  const fields = new Map<string, Field>();
  const field = (id: string): Field => {
    if (!fields.has(id)) {
      let value = '';
      const element: Field = {
        get value() { return value; },
        set value(next: string) { value = String(next); this.options[0]!.value = value; },
        checked: false, innerHTML: '', textContent: '', selectedIndex: 0, options: [{ value: '' }], hidden: false,
        style: {}, width: 700, height: 520,
        getContext() { return canvasContext; }, focus() {}, getAttribute() { return id; },
      };
      fields.set(id, element);
    }
    return fields.get(id)!;
  };
  for (const match of originalHTML.matchAll(/\bid\s*=\s*["']?([a-zA-Z_][\w]*)/gi)) field(match[1]!);
  field('Cp8_angle');
  const root = { querySelector(selector: string) { return field(selector.match(/\[id="(.+)"\]/)![1]!); } } as unknown as HTMLElement;
  const context: FeatureContext = { year: 2009, month: 7, day: 22, longitude: 121.46, latitude: 31.23, timezone: 8 };
  const dom = new FeatureDOM(root);
  const calculations = new Calculations(dom, context);
  const eclipse = new EclipseCalculations(dom, context, calculations, () => undefined);
  const original = new OriginalOracle();
  const drawing = new Proxy({}, { get: () => () => undefined });
  const originals = Object.fromEntries([...fields.keys()].map((id) => [id, { value: '', checked: false, innerHTML: '', textContent: '', selectedIndex: 0, options: [{ value: '' }], style: {} }]));
  original.evaluate([...functions.values()].join('\n'), {
    ...originals, curTZ: -8, document: { all: originals }, tu1: drawing, tu2: drawing, tu3: drawing,
    window: { event: null }, prompt: () => '37.5', showHelp: () => undefined,
  });
  const set = (values: Record<string, string | number | boolean>): void => {
    for (const [id, value] of Object.entries(values)) {
      const modern = field(id);
      const reference = originals[id] ?? (originals[id] = { value: '', checked: false, innerHTML: '', textContent: '', selectedIndex: 0, options: [{ value: '' }], style: {} });
      if (typeof value === 'boolean') { modern.checked = value; reference.checked = value; }
      else { modern.value = String(value); reference.value = String(value); reference.options[0]!.value = String(value); }
    }
    original.evaluate('void 0', originals);
  };
  const timezone = (offset: number): void => { context.timezone = offset; original.evaluate('curTZ=_offset', { _offset: -offset }); };
  return { calculations, eclipse, original, field, set, timezone };
}

function dates(value: string): string[] {
  return [...value.matchAll(/-?\d{4,5}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g)].map((match) => match[0].replace(/\s+/, ' '));
}

function clocks(value: string): string[] {
  return [...value.matchAll(/\b\d{2}:\d{2}:\d{2}\b/g)].map((match) => match[0]);
}

/** 1.1 将原 UT 短列改成完整当地日期并增加偏移标签；只还原这些明确的显示变化。 */
function originalEventLayout(value: string): string {
  return value.replace(/\(TD \/ 当地时\)/g, '(TD UT)')
    .replace(/ TD　([ \d-]{5}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) 当地时 UTC[+−]\d{2}:\d{2}　/g, (_whole, local: string) => ` TD ${local.slice(9, 20)} UT `);
}

function withoutLocalMetadata(value: string): string { return value.replace(/^当地时 [^\r\n]*\r?\n/gm, ''); }

test('all 45 event controller operations preserve ordered, formatted multi-event reports', () => {
  const h = createHarness();
  for (const year of [-721, 0, 1582, 2000, 2009, 2026, 2033, 9999]) {
    h.set({ Ce_y: year, Ce_m: 1, Ce_d: 1, Ce_n: 3 });
    for (const timezone of [-3, 0, 8]) {
      h.timezone(timezone);
      for (let event = 1; event <= 15; event++) {
        const planets = event <= 10 ? [0] : [1, 2, 3, 4, 5, 6, 7];
        for (const planet of planets) {
          h.calculations.tianXiang(event, planet);
          const expected = h.original.evaluate<string>('tianXiang(_event,_planet); Ce_tab.value', { _event: event, _planet: planet });
          assert.equal(originalEventLayout(h.field('Ce_tab').value), expected, `event ${event}/${planet}, year ${year}, UTC${timezone}`);
        }
      }
    }
  }
});

test('ephemeris and star controllers preserve local/TD conversion and interval sequencing', () => {
  const h = createHarness();
  for (const year of [0, 1582, 2000, 2009, 2026, 2033]) {
    h.set({ Cd_y: year, Cd_m: 7, Cd_d: 22, Cd_t: '18:17:15.25', Cd_dt: 1.25, Cd_n: 2, Cd_J: 121.46, Cd_W: 31.23 });
    h.set({ Cf_y: year, Cf_m: 7, Cf_d: 22, Cf_t: '18:17:15.25', Cf_dt: 1.25, Cf_n: 2, Cf_J: 121.46, Cf_W: 31.23 });
    for (const timezone of [-3, 8]) {
      h.timezone(timezone);
      for (const localTime of [false, true]) {
        h.set({ Cd_ut: localTime, Cf_ut: localTime });
        for (let planet = 1; planet <= 10; planet++) {
          h.set({ Cd_xt: planet });
          h.calculations.pCalc();
          assert.equal(withoutLocalMetadata(h.field('Cd_tab').value), h.original.evaluate('pCalc();Cd_tab.value'), `ephemeris ${year}/${planet}/${timezone}/${localTime}`);
          assert.equal(h.field('Cd_tab').value.match(/^当地时 /gm)?.length, 2, 'one local-time header per original ephemeris');
        }
        for (const catalog of [0, 1, 1000]) {
          h.calculations.showHXK(catalog);
          h.original.evaluate('showHXK(_catalog)', { _catalog: catalog });
          assert.equal(h.field('Cf_db').value, h.original.evaluate('Cf_db.value'), 'star selected library');
          for (const mode of [0, 1, 2]) {
            for (const shortPeriod of [false, true]) {
              h.set({ Cf_lx: mode, Cf_nsn: shortPeriod });
              h.calculations.aCalc();
              assert.equal(withoutLocalMetadata(h.field('Cf_xl').value), h.original.evaluate('aCalc();Cf_xl.value'), `star ${year}/${mode}/${timezone}/${localTime}`);
              assert.equal(h.field('Cf_xl').value.match(/^当地时 /gm)?.length, 2, 'one local-time header per original star report');
            }
          }
        }
      }
    }
  }
});

test('phase, term and pentad controller tables preserve exact ordered timestamps', () => {
  const h = createHarness();
  for (const year of [-721, 0, 1582, 2000, 2026, 2033, 9999]) {
    h.set({ Cp8_y: year, Cp8_n: 24, Cp8_angle: 37.5 });
    for (const angle of [0, 90, 180, 270, -1]) {
      h.calculations.suoCalc(angle);
      const expected = h.original.evaluate<string>('suoCalc(_angle);Cp8_out.innerHTML', { _angle: angle });
      assert.deepEqual(dates(h.field('Cp8_out').innerHTML), dates(expected), `phase times ${year}/${angle}`);
      const distances = (value: string): string[] => [...value.matchAll(/(\d+\.\d+)\s*千米/g)].map((match) => match[1]!);
      assert.deepEqual(distances(h.field('Cp8_out').innerHTML), distances(expected), `phase distances ${year}/${angle}`);
    }
    h.calculations.qiCalc();
    assert.deepEqual(dates(h.field('Cp8_out').innerHTML), dates(h.original.evaluate('qiCalc();Cp8_out.innerHTML')), `solar terms ${year}`);
    h.calculations.houCalc();
    assert.deepEqual(dates(h.field('Cp8_out').innerHTML), dates(h.original.evaluate('houCalc();Cp8_out.innerHTML')), `pentads ${year}`);
  }
});

test('rise/set controller preserves local solar noon and original Beijing output convention', () => {
  const h = createHarness();
  for (const [longitude, latitude] of [[121.46, 31.23], [-46.63, -23.55], [18.95, 69.65]]) {
    for (const year of [1582, 2000, 2026]) {
      h.set({ Cp9_J: longitude!, Cp9_W: latitude!, Cp9_y: year, Cp9_m: 6, Cp9_d: 21 });
      h.calculations.shengjiang();
      const expected = h.original.evaluate<string>('shengjiang();Cp9_out.innerHTML');
      assert.deepEqual(dates(h.field('Cp9_out').innerHTML), dates(expected), 'rise, transit, setting and all twilight timestamps');
      assert.deepEqual(clocks(h.field('Cp9_out').innerHTML).sort(), clocks(expected).sort(), 'daily duration and clock values');
    }
  }
});

test('local eclipse table controller preserves contacts, angles and both radius settings', () => {
  const h = createHarness();
  const cities = '*地名,纬度,经度,海拔(米)\n上海,31.23,121.46,5 # 北京,39.93,116.37,31 # 拉萨,29.66,91.13,3658\n纽约,40.71,-74.01,10';
  for (const [year, month, day] of [[2009, 7, 22], [2024, 4, 8], [2026, 8, 12]]) {
    for (const nasa of [false, true]) {
      for (const timezone of [-3, 8]) {
        h.timezone(timezone);
        for (const mode of [0, 1, 2]) {
          h.set({ Cc_y: year!, Cc_m: month!, Cc_d: day!, Cc_nasa: nasa, Cc_db: cities });
          h.eclipse.dfRS(mode);
          const expected = h.original.evaluate<string>('dfRS(_mode);Cc_tb.value', { _mode: mode });
          assert.equal(h.field('Cc_tb').value, expected, `local eclipse ${year}/${month}/${day}, NASA=${nasa}, UTC=${timezone}, mode=${mode}`);
          for (const id of ['Cc_y', 'Cc_m', 'Cc_d']) assert.equal(h.field(id).value, String(h.original.evaluate(`${id}.value`)), `eclipse date navigation ${id}`);
        }
      }
    }
  }
});

test('sun/moon eclipse controller preserves contact timestamps across step, phase and time modes', () => {
  const h = createHarness();
  for (const [year, month, day, time] of [[2009, 7, 22, '09:40:00'], [2022, 11, 8, '19:00:00'], [2024, 4, 8, '18:00:00']]) {
    for (const mode of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const localTime of [false, true]) {
        h.timezone(8);
        h.set({ Cb_y: year!, Cb_m: month!, Cb_d: day!, Cb_t: time!, Cb_J: 121.46, Cb_W: 31.23, Cb_high: 0.005, Cb_step: 300, Cb_ut: localTime, Cb_nasa: true, Cb_bei: false, Cb_sjzb: false, Cb_phSave: false });
        h.eclipse.tu_calc(mode);
        const expected = h.original.evaluate<string>('tu_calc(_mode);Cb_b2.innerHTML', { _mode: mode });
        assert.deepEqual(dates(h.field('Cb_b2').innerHTML), dates(expected), `eclipse contacts ${year}, mode ${mode}, local ${localTime}`);
        for (const id of ['Cb_y', 'Cb_m', 'Cb_d', 'Cb_t']) assert.equal(h.field(id).value, String(h.original.evaluate(`${id}.value`)), `eclipse input ${id}`);
      }
    }
  }
});
