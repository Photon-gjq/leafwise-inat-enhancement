import fs from 'node:fs';
import path from 'node:path';
import * as OpenCC from 'opencc-js';

export function translations(root) {
  const directory = path.join(root, 'src/i18n');
  const read = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const source = read('source.json');
  const names = read('locales.json');
  const required = read('required-keys.json');
  const english = Object.fromEntries(Object.values(source).map(text => [text, text]));
  const locales = { en: english };
  const chinese = Object.fromEntries(Object.entries(source).map(([text, key]) => [key, text]));
  const simplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
  for (const [code, target] of [['zh-CN', 'cn'], ['zh-TW', 'tw'], ['zh-HK', 'hk']]) {
    const convert = target === 'cn' ? simplified : OpenCC.Converter({ from: 'cn', to: target });
    locales[code] = Object.fromEntries(Object.entries(chinese).map(([key, text]) => [key, convert(simplified(text))]));
  }
  for (const code of Object.keys(names)) {
    if (Object.hasOwn(locales, code)) continue;
    const file = path.join(directory, `${code}.json`);
    if (fs.existsSync(file)) locales[code] = read(`${code}.json`);
    else if (code.includes('-') && Object.hasOwn(names, code.split('-')[0])) locales[code] = {};
    else throw new Error(`Missing translation catalog: ${code}`);
  }
  for (const file of ['place-settings.json', 'notification-filter.json']) {
    for (const [code, catalog] of Object.entries(read(file))) {
      if (!Object.hasOwn(locales, code)) throw new Error(`Unsupported ${file} locale: ${code}`);
      Object.assign(locales[code], catalog);
    }
  }
  const slots = value => [...String(value).matchAll(/\{\d+\}/g)].map(match => match[0]).sort().join(',');
  // These accessibility labels intentionally reuse the same translated nouns
  // as their adjacent controls. Keep aliases explicit, not substring-based.
  const aliases = {
    'Select observation source': 'Observation source',
    'Select comparison user': 'Comparison user',
    'Other comparison user': 'Other user…',
    'Select saved taxon': 'Saved taxa',
    'Other taxon ID': 'Taxon ID',
    'Saved search name': 'Search name',
    'Filter results by common or scientific name': 'Find common or scientific name…',
    'Leafwise upload AI assistant': 'Leafwise · Batch AI suggestions',
    'AI combined-score threshold': 'Combined score',
    'Saved iNaturalist usernames': 'Saved users',
    'Saved taxon IDs and names': 'Saved taxa',
    'Saved region IDs and names': 'Saved regions'
  };
  for (const [code, catalog] of Object.entries(locales)) {
    if (code === 'en' || code.startsWith('zh-') || !Object.keys(catalog).length) continue;
    const base = locales[code.split('-')[0]] || {};
    for (const [alias, key] of Object.entries(aliases)) {
      if (!Object.hasOwn(catalog, alias)) catalog[alias] = catalog[key] ?? base[key];
    }
    catalog['Combined score >'] ??= `${catalog['Combined score'] ?? base['Combined score']} >`;
    catalog['All; e.g. 3,4,5'] ??= `${catalog.All ?? base.All} · 3,4,5`;
    catalog['{0}; expand user filters'] ??= `{0}; ${catalog['Expand user filters'] ?? base['Expand user filters']}`;
  }
  for (const [code, catalog] of Object.entries(locales)) {
    for (const [key, value] of Object.entries(catalog)) {
      if (!Object.hasOwn(english, key)) throw new Error(`Unknown i18n key in ${code}: ${key}`);
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Empty i18n value in ${code}: ${key}`);
      if (slots(key) !== slots(value)) throw new Error(`Placeholder mismatch in ${code}: ${key}`);
    }
    for (const key of required) {
      if (!Object.hasOwn(english, key)) throw new Error(`Unknown required i18n key: ${key}`);
      if (!Object.hasOwn(catalog, key) && !Object.hasOwn(locales[code.split('-')[0]] || {}, key)) {
        throw new Error(`Missing required i18n key in ${code}: ${key}`);
      }
    }
  }
  return { source, locales, names };
}

export function writeTranslations(root, destination) {
  const data = translations(root);
  fs.writeFileSync(path.join(destination, 'scripts/i18n-catalog.js'),
    `/* Generated from src/i18n; edit the source catalogs, not this file. */\n` +
    `(function(root){if(!root.LeafwiseTranslations)root.LeafwiseTranslations=${JSON.stringify(data)};})(globalThis);\n`);
  // Catalog source is not needed in the installed extension. Keep one compiled
  // data file; no remote translation service or extra extension permissions.
  fs.rmSync(path.join(destination, 'i18n'), { recursive: true });
}
