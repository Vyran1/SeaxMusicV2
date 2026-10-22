const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDom() {
  const sandbox = { window: {} };
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'js', 'utils', 'dom.js'),
    'utf8'
  );
  vm.runInNewContext(code, sandbox);
  return sandbox.window;
}

const { html, raw } = loadDom();

test('html: escapa valores interpolados por defecto', () => {
  const title = '<img src=x onerror="boom()">';
  assert.equal(html`<p>${title}</p>`, '<p>&lt;img src=x onerror=&quot;boom()&quot;&gt;</p>');
});

test('html: raw() inserta HTML confiable sin escapar', () => {
  const icon = raw('<i class="fas fa-play"></i>');
  assert.equal(html`<button>${icon} ${'Play & pausa'}</button>`,
    '<button><i class="fas fa-play"></i> Play &amp; pausa</button>');
});

test('html: nulos y undefined son cadena vacía; números se mantienen', () => {
  assert.equal(html`<span>${null}${undefined}${42}</span>`, '<span>42</span>');
});

test('html: un atributo no puede cerrarse desde un dato externo', () => {
  const alt = '" onerror="steal()';
  const out = html`<img alt="${alt}">`;
  assert.equal((out.match(/"/g) || []).length, 2);
});
