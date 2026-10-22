// Feedback de favorito: movimiento corto, físico y respetuoso de reduced-motion.
(function () {
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function getLiveRegion() {
    let region = document.getElementById('likeLiveRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'likeLiveRegion';
      region.className = 'sr-only';
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }

  function createSpark(button, index) {
    const rect = button.getBoundingClientRect();
    const spark = document.createElement('span');
    const angle = (-145 + index * 72) * (Math.PI / 180);
    const distance = 22 + (index % 2) * 8;

    spark.className = 'like-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.textContent = '♥';
    spark.style.left = `${rect.left + rect.width / 2}px`;
    spark.style.top = `${rect.top + rect.height / 2}px`;
    spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance - 12}px`);
    spark.style.setProperty('--spark-delay', `${index * 22}ms`);
    document.body.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
  }

  window.playLikeAnimation = (button, label = 'Añadida a favoritos') => {
    if (!button) return;
    getLiveRegion().textContent = label;
    button.classList.remove('like-confirmed');
    void button.offsetWidth;
    button.classList.add('like-confirmed');

    if (prefersReducedMotion()) return;
    for (let index = 0; index < 5; index++) createSpark(button, index);
  };
})();
