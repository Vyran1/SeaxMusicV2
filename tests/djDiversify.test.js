const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Helpers copiados de djEngine.js / app.js para test unitario puro (sin DOM)
function normalize(name) { return (name || '').toLowerCase().trim().replace(/\s+/g, ' '); }

function diversifyByArtist(tracks, recentHistory = []) {
  if (!tracks || tracks.length <= 2) return [...(tracks || [])];
  const recentIds = new Set((recentHistory.slice(0, 20)).map(h => h.videoId));
  const pool = [...tracks];
  const result = [];
  let lastArtist = '';
  while (pool.length) {
    let idx = pool.findIndex(t => {
      const a = normalize(t.artist || t.channel);
      return a && a !== lastArtist && !recentIds.has(t.videoId);
    });
    if (idx === -1) idx = pool.findIndex(t => normalize(t.artist || t.channel) !== lastArtist && normalize(t.artist || t.channel) !== '');
    if (idx === -1) idx = pool.findIndex(t => !recentIds.has(t.videoId));
    if (idx === -1) idx = 0;
    const [next] = pool.splice(idx, 1);
    result.push(next);
    lastArtist = normalize(next.artist || next.channel);
  }
  return result;
}

describe('djEngine: diversifyByArtist', () => {
  it('evita mismo artista consecutivo', () => {
    const tracks = [
      { videoId: '1', artist: 'Bad Bunny' },
      { videoId: '2', artist: 'Bad Bunny' },
      { videoId: '3', artist: 'Bad Bunny' },
      { videoId: '4', artist: 'Feid' },
      { videoId: '5', artist: 'Feid' },
      { videoId: '6', artist: 'Karol G' },
    ];
    const out = diversifyByArtist(tracks, []);
    for (let i = 1; i < out.length; i++) {
      assert.notEqual(normalize(out[i].artist), normalize(out[i - 1].artist), `consecutivos ${out[i - 1].artist} -> ${out[i].artist} en ${i}`);
    }
  });

  it('evita canciones recientes', () => {
    const tracks = [
      { videoId: '1', artist: 'Bad Bunny' },
      { videoId: '2', artist: 'Feid' },
      { videoId: '3', artist: 'Karol G' },
      { videoId: '4', artist: 'Anuel' },
    ];
    const recent = [{ videoId: '1' }, { videoId: '2' }];
    const out = diversifyByArtist(tracks, recent);
    // primer elemento no debe ser 1 ni 2 si hay alternativas
    assert.ok(out[0].videoId !== '1' && out[0].videoId !== '2', 'evita reciente al inicio');
  });

  it('interleaves cuando un artista domina', () => {
    const tracks = [
      { videoId: 'a', artist: 'Drake' },
      { videoId: 'b', artist: 'Drake' },
      { videoId: 'c', artist: 'Drake' },
      { videoId: 'd', artist: 'Kendrick' },
    ];
    const out = diversifyByArtist(tracks, []);
    assert.equal(normalize(out[1].artist), 'kendrick', 'Kendrick debe ir segundo para romper racha');
  });

  it('retorna copia y no muta original', () => {
    const tracks = [{ videoId: '1', artist: 'X' }];
    const out = diversifyByArtist(tracks, []);
    assert.notEqual(out, tracks);
    assert.equal(tracks.length, 1);
  });
});

describe('normalize', () => {
  it('case-insensitive y trim', () => {
    assert.equal(normalize('  Bad Bunny  '), 'bad bunny');
    assert.equal(normalize('FEID'), 'feid');
    assert.equal(normalize(''), '');
  });
});
