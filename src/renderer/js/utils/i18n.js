// ===== i18n mínimo - textos centralizados (evitar hardcode) =====
const I18n = (() => {
  const locale = document.documentElement.lang || 'es';
  const dict = {
    es: {
      'search.placeholder': '¿Qué quieres escuchar?',
      'search.aria': 'Buscar música',
      'search.clear': 'Limpiar búsqueda',
      'search.submit': 'Buscar',
      'search.recent': 'Búsquedas recientes',
      'search.clearAll': 'Limpiar todo',
      'search.removeRecent': 'Eliminar',
      'search.noResults': 'No se encontraron resultados',
      'search.explore': 'Explorar'
    },
    en: {
      'search.placeholder': 'What do you want to listen to?',
      'search.aria': 'Search music',
      'search.clear': 'Clear search',
      'search.submit': 'Search',
      'search.recent': 'Recent searches',
      'search.clearAll': 'Clear all',
      'search.removeRecent': 'Remove',
      'search.noResults': 'No results found',
      'search.explore': 'Explore'
    }
  };
  function t(key, fallback) {
    const d = dict[locale] || dict.es;
    return d[key] || dict.es[key] || fallback || key;
  }
  return { t, locale, dict };
})();

if (typeof window !== 'undefined') window.I18n = I18n;
if (typeof module !== 'undefined' && module.exports) module.exports = I18n;
