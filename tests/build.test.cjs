const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');
const project = path.join(__dirname, '..');
const read = file => fs.readFileSync(file, 'utf8');
const manifest = JSON.parse(read(path.join(extension, 'manifest.json')));

test('built version has one source and all manifest/HTML script references resolve', () => {
  assert.equal(manifest.version, JSON.parse(read(path.join(project, 'package.json'))).version);
  assert.equal(manifest.version, JSON.parse(read(path.join(project, 'package-lock.json'))).version);
  assert.equal(JSON.parse(read(path.join(project, 'src/manifest.json'))).version, undefined);
  const referenced = manifest.content_scripts.flatMap(group => group.js);
  referenced.push(...(manifest.background.scripts || [manifest.background.service_worker]), manifest.options_page);
  for (const file of referenced) assert.ok(fs.existsSync(path.join(extension, file)), file);
  const html = read(path.join(extension, manifest.options_page));
  for (const [, script] of html.matchAll(/<script src="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.resolve(extension, path.dirname(manifest.options_page), script)), script);
  }
  assert.deepEqual(manifest.content_scripts[0].js.slice(0, 3), ['scripts/uploader-ai-core.js', 'scripts/uploader-page-data.js', 'scripts/uploader-ai-adapter.js']);
});

test('Firefox keeps its existing extension ID; targets keep their respective background model', () => {
  const firefox = JSON.parse(read(path.join(project, 'build/firefox/manifest.json')));
  const chrome = JSON.parse(read(path.join(project, 'build/chrome/manifest.json')));
  assert.equal(firefox.browser_specific_settings.gecko.id, '{ae19f2b4-7bb2-4974-bbda-c0d14e09428a}');
  assert.equal(firefox.background.service_worker, undefined);
  assert.equal(chrome.background.scripts, undefined);
  assert.equal(chrome.browser_specific_settings, undefined);
  assert.deepEqual(firefox.host_permissions, chrome.host_permissions);
  assert.deepEqual(firefox.permissions, chrome.permissions);
});

test('all feature scripts are shared across browsers after namespace and background prelude normalization', () => {
  for (const file of fs.readdirSync(path.join(project, 'src/scripts'))) {
    const chrome = read(path.join(project, 'build/chrome/scripts', file)).replace(/^importScripts\([^\n]+\);\n\n/, '');
    const firefox = read(path.join(project, 'build/firefox/scripts', file)).replace(/\bbrowser\./g, 'chrome.');
    assert.equal(firefox, chrome, file);
  }
});

test('page data adapter reads the correct page wrapper and handles unavailable jQuery', () => {
  const isFirefox = process.env.LEAFWISE_TARGET === 'firefox';
  const actualElement = { marker: 'page element' };
  const isolatedElement = { wrappedJSObject: actualElement };
  const page = { jQuery: element => ({ data: name => ({ element, name }) }) };
  const context = vm.createContext({ window: isFirefox ? { wrappedJSObject: page } : page });
  vm.runInContext(read(path.join(extension, 'scripts/uploader-page-data.js')), context);
  const result = context.LeafwiseUploadPageData(isFirefox ? isolatedElement : actualElement, 'uiAutocomplete');
  assert.equal(result.element, actualElement);
  assert.equal(result.name, 'uiAutocomplete');
  delete page.jQuery;
  assert.equal(context.LeafwiseUploadPageData(actualElement, 'uiAutocomplete'), null);
});
