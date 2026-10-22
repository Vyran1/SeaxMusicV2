const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// dom.js es un script de navegador: lo ejecutamos en un contexto con un `window` simulado
function loadEscapeHtml() {
  const sandbox = { window: {} };
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'js', 'utils', 'dom.js'),
    'utf8'
  );
  vm.runInNewContext(code, sandbox);
  return sandbox.window.escapeHtml;
}

const escapeHtml = loadEscapeHtml();

test('escapeHtml: escapa etiquetas, & y ambas comillas', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml(`Tom & Jerry's`), 'Tom &amp; Jerry&#39;s');
});

test('escapeHtml: un título con comillas no puede cerrar un atributo', () => {
  const title = '" onmouseover="steal()';
  const html = `<p title="${escapeHtml(title)}">x</p>`;
  // Solo las dos comillas que delimitan el valor del atributo deben existir
  assert.equal((html.match(/"/g) || []).length, 2);
});

test('escapeHtml: vacíos y nulos devuelven cadena vacía; números se convierten', () => {
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});
