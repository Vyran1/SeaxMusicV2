// Escapa para texto y atributos (incluye comillas). Usar en todo dato externo dentro de innerHTML.
const ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
window.escapeHtml = (str) => {
  if (str === null || str === undefined || str === '') return '';
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_HTML_MAP[ch]);
};

// Plantilla HTML segura: cada valor interpolado se escapa por defecto.
// Solo HTML ya construido y confiable (íconos, markup propio) debe envolverse con raw().
const RAW_MARKER = Symbol('rawHtml');
window.raw = (value) => ({ [RAW_MARKER]: true, value: value === null || value === undefined ? '' : String(value) });
window.html = (strings, ...values) => strings.reduce((out, str, i) => {
  if (i === 0) return str;
  const v = values[i - 1];
  const piece = v && typeof v === 'object' && v[RAW_MARKER] ? v.value : window.escapeHtml(v);
  return out + piece + str;
}, '');

window.domCache = (initial = {}) => ({
  ...initial,
  get(id) {
    if (!this[id]) {
      this[id] = document.getElementById(id);
    }
    return this[id];
  },
  queryAll(selector, key) {
    if (!this[key]) {
      this[key] = document.querySelectorAll(selector);
    }
    return this[key];
  },
});

window.getEl = (id) => document.getElementById(id);
