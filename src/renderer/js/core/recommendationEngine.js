// Motor de cola inteligente compartido entre el reproductor y el DJ.
// No inventa pistas: ordena las disponibles para reducir repeticiones reales.
(function (root) {
  const RECENT_TRACK_LIMIT = 20;
  const ARTIST_COOLDOWN = 2;

  function normalizeArtist(value) {
    return String(value || '')
      .trim()
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function artistOf(track) {
    return normalizeArtist(track?.artist || track?.channel);
  }

  // Mismo criterio que el DJ: sin paréntesis, corchetes ni "feat.", en minúsculas.
  // Dos subidas de la misma canción tienen distinto videoId pero el mismo título.
  function normalizeTitle(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, '')
      .replace(/feat\.|ft\.|featuring/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleOf(track) {
    return normalizeTitle(track?.title);
  }

  function recentTrackIds(history = [], limit = RECENT_TRACK_LIMIT) {
    return new Set(history.slice(0, limit).map(track => track?.videoId).filter(Boolean));
  }

  // Títulos ya sonados recientemente (independiente del artista o del videoId)
  function recentTitles(history = [], limit = RECENT_TRACK_LIMIT) {
    return new Set(history.slice(0, limit).map(titleOf).filter(Boolean));
  }

  // Quita repeticiones por videoId y por título: no se repite la misma canción aunque cambie el artista
  function uniqueTracks(tracks = []) {
    const ids = new Set();
    const titles = new Set();
    return tracks.filter(track => {
      if (!track?.videoId || ids.has(track.videoId)) return false;
      const title = titleOf(track);
      if (title && titles.has(title)) return false;
      ids.add(track.videoId);
      if (title) titles.add(title);
      return true;
    });
  }

  function candidateScore(track, artistTrail, recentIds, recentTitleSet = new Set()) {
    const artist = artistOf(track);
    let score = 0;
    if (recentIds.has(track.videoId)) score -= 100;
    if (titleOf(track) && recentTitleSet.has(titleOf(track))) score -= 100;
    if (!artist) score -= 8;
    const previous = artistTrail[artistTrail.length - 1];
    const prior = artistTrail.slice(-ARTIST_COOLDOWN);
    if (artist && artist === previous) score -= 80;
    else if (artist && prior.includes(artist)) score -= 25;
    return score;
  }

  function takeBest(pool, artistTrail, recentIds, recentTitleSet) {
    let highest = -Infinity;
    let choices = [];
    pool.forEach((track, index) => {
      const score = candidateScore(track, artistTrail, recentIds, recentTitleSet);
      if (score > highest) {
        highest = score;
        choices = [index];
      } else if (score === highest) {
        choices.push(index);
      }
    });

    // Entre alternativas igual de buenas, variar el orden evita sesiones idénticas.
    const index = choices[Math.floor(Math.random() * choices.length)];
    return pool.splice(index, 1)[0];
  }

  function diversifyQueue(tracks, options = {}) {
    const fromIndex = Math.max(-1, options.fromIndex ?? -1);
    const source = uniqueTracks(tracks);
    if (source.length <= 1) return source;

    const locked = source.slice(0, fromIndex + 1);
    const pool = source.slice(fromIndex + 1);
    const recentIds = recentTrackIds(options.recentHistory, options.recentLimit);
    const recentTitleSet = recentTitles(options.recentHistory, options.recentLimit);
    const artistTrail = locked.map(artistOf).filter(Boolean).slice(-ARTIST_COOLDOWN);
    const currentArtist = artistOf(options.currentTrack);
    if (currentArtist && artistTrail.at(-1) !== currentArtist) artistTrail.push(currentArtist);
    const currentTitle = titleOf(options.currentTrack);
    if (currentTitle) recentTitleSet.add(currentTitle);

    const result = [...locked];
    while (pool.length) {
      const next = takeBest(pool, artistTrail, recentIds, recentTitleSet);
      result.push(next);
      const artist = artistOf(next);
      if (artist) artistTrail.push(artist);
      if (artistTrail.length > ARTIST_COOLDOWN) artistTrail.shift();
    }
    return result;
  }

  function chooseNextIndex(queue, fromIndex, options = {}) {
    const start = fromIndex + 1;
    if (!Array.isArray(queue) || start >= queue.length) return -1;
    const end = Math.min(queue.length, start + (options.windowSize || 12));
    const recentIds = recentTrackIds(options.recentHistory, options.recentLimit);
    const recentTitleSet = recentTitles(options.recentHistory, options.recentLimit);
    const currentTitle = titleOf(options.currentTrack);
    if (currentTitle) recentTitleSet.add(currentTitle);
    const trail = [artistOf(options.currentTrack)].filter(Boolean);
    let bestScore = -Infinity;
    let bestIndex = start;

    for (let index = start; index < end; index++) {
      const score = candidateScore(queue[index], trail, recentIds, recentTitleSet);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  const api = { normalizeArtist, normalizeTitle, artistOf, titleOf, recentTrackIds, recentTitles, uniqueTracks, diversifyQueue, chooseNextIndex };
  root.RecommendationEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
