const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function normalizeArtistDJ(name) { return (name || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function getRecentPlayedSet(hist, limit = 20) { return new Set(hist.slice(0, limit).map(h => h.videoId)); }

function diversifyQueueByArtist(queue, fromIndex, currentTrack, hist) {
  if (!queue || queue.length <= 3) return queue;
  const recentSet = getRecentPlayedSet(hist || [], 20);
  const played = queue.slice(0, fromIndex + 1);
  let pool = queue.slice(fromIndex + 1);
  const diversified = [];
  let lastArtist = '';
  if (played.length) lastArtist = normalizeArtistDJ(played[played.length - 1]?.artist || '');
  const curArtist = normalizeArtistDJ(currentTrack?.artist || '');
  if (curArtist) lastArtist = curArtist;
  while (pool.length) {
    let idx = pool.findIndex(t => {
      const a = normalizeArtistDJ(t.artist || t.channel);
      return a !== lastArtist && a !== '' && !recentSet.has(t.videoId);
    });
    if (idx === -1) idx = pool.findIndex(t => normalizeArtistDJ(t.artist || t.channel) !== lastArtist && normalizeArtistDJ(t.artist || t.channel) !== '');
    if (idx === -1) idx = pool.findIndex(t => !recentSet.has(t.videoId));
    if (idx === -1) idx = 0;
    const [next] = pool.splice(idx, 1);
    diversified.push(next);
    lastArtist = normalizeArtistDJ(next.artist || next.channel);
  }
  return [...played, ...diversified];
}

function getNextTrackForDjMix(queue, idx, currentTrack, hist) {
  const DJ_CONFIG = { WINDOW_SIZE: 12 };
  const windowSize = Math.min(DJ_CONFIG.WINDOW_SIZE, queue.length - (idx + 1));
  const currentArtist = normalizeArtistDJ(currentTrack?.artist || '');
  const recentSet = getRecentPlayedSet(hist || [], 20);
  let bestIdx = -1;
  for (let off = 0; off < windowSize; off++) {
    const t = queue[idx + 1 + off];
    const a = normalizeArtistDJ(t.artist || t.channel);
    if (!a || a === currentArtist) continue;
    if (recentSet.has(t.videoId)) continue;
    bestIdx = idx + 1 + off; break;
  }
  if (bestIdx === -1) {
    for (let off = 0; off < windowSize; off++) {
      const t = queue[idx + 1 + off];
      const a = normalizeArtistDJ(t.artist || t.channel);
      if (a && a !== currentArtist) { bestIdx = idx + 1 + off; break; }
    }
  }
  if (bestIdx === -1) {
    for (let off = 0; off < windowSize; off++) {
      const t = queue[idx + 1 + off];
      if (!recentSet.has(t.videoId)) { bestIdx = idx + 1 + off; break; }
    }
  }
  if (bestIdx !== -1 && bestIdx !== idx + 1) {
    const [chosen] = queue.splice(bestIdx, 1);
    queue.splice(idx + 1, 0, chosen);
  }
  return queue[idx + 1] || null;
}

describe('queue DJ: diversifyQueueByArtist', () => {
  it('respeta startIndex y diversifica resto', () => {
    const queue = [
      { videoId: '1', artist: 'Bad Bunny' },
      { videoId: '2', artist: 'Bad Bunny' },
      { videoId: '3', artist: 'Bad Bunny' },
      { videoId: '4', artist: 'Feid' },
      { videoId: '5', artist: 'Feid' },
      { videoId: '6', artist: 'Karol G' },
    ];
    const out = diversifyQueueByArtist(queue, 0, { artist: 'Bad Bunny' }, []);
    assert.equal(out[0].videoId, '1', 'preserva startIndex');
    assert.notEqual(normalizeArtistDJ(out[1].artist), 'bad bunny', 'siguiente no es mismo artista');
  });

  it('evita recientes', () => {
    const queue = [
      { videoId: '1', artist: 'Bad Bunny' },
      { videoId: '2', artist: 'Bad Bunny' },
      { videoId: '3', artist: 'Feid' },
      { videoId: '4', artist: 'Karol G' },
    ];
    const hist = [{ videoId: '2' }];
    const out = diversifyQueueByArtist(queue, -1, null, hist);
    // 2 es reciente, no debe ir primero si hay alternativa
    assert.notEqual(out[0].videoId, '2');
  });
});

describe('queue DJ: getNextTrackForDjMix lookahead', () => {
  it('salta mismo artista y reciente', () => {
    const queue = [
      { videoId: 'c1', artist: 'Bad Bunny' },
      { videoId: 'c2', artist: 'Bad Bunny' }, // mismo + reciente
      { videoId: 'c3', artist: 'Feid' },
      { videoId: 'c4', artist: 'Karol G' },
    ];
    const hist = [{ videoId: 'c2' }];
    const q = [...queue];
    const next = getNextTrackForDjMix(q, 0, { artist: 'Bad Bunny' }, hist);
    assert.equal(next.videoId, 'c3', 'debe saltar c2 y elegir Feid');
    assert.equal(q[1].videoId, 'c3', 'queue reordenada');
  });

  it('fallback a siguiente si no hay diverso', () => {
    const queue = [
      { videoId: '1', artist: 'Drake' },
      { videoId: '2', artist: 'Drake' },
      { videoId: '3', artist: 'Drake' },
    ];
    const q = [...queue];
    const next = getNextTrackForDjMix(q, 0, { artist: 'Drake' }, []);
    assert.equal(next.videoId, '2', 'sin alternativa, devuelve siguiente');
  });
});

describe('DJ_CONFIG centralizado', () => {
  it('valores por defecto', () => {
    const DJ_CONFIG = { MIX_MS: 600, LEAD_SEC: 180, CROSSFADE_MS: 6000, WINDOW_SIZE: 12 };
    assert.equal(DJ_CONFIG.MIX_MS, 600);
    assert.equal(DJ_CONFIG.CROSSFADE_MS, 6000);
    assert.equal(DJ_CONFIG.WINDOW_SIZE, 12);
  });
});
