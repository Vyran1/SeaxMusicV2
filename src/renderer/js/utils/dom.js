window.escapeHtml = (str) => {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};

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
