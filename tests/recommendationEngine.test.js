const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/renderer/js/core/recommendationEngine.js');

const tracks = [
  { videoId: 'bad-1', artist: 'Bad Bunny' },
  { videoId: 'bad-2', artist: 'Bad Bunny' },
  { videoId: 'bad-3', artist: 'Bad Bunny' },
  { videoId: 'feid-1', artist: 'Feid' },
  { videoId: 'karol-1', artist: 'Karol G' },
  { videoId: 'feid-1', artist: 'Feid' }
];

describe('recommendation engine', () => {
  it('conserva la canción elegida y elimina duplicados de la sesión', () => {
    const queue = engine.diversifyQueue(tracks, { fromIndex: 0, currentTrack: tracks[0] });
    assert.equal(queue[0].videoId, 'bad-1');
    assert.equal(new Set(queue.map(track => track.videoId)).size, queue.length);
  });

  it('intercala artistas cuando hay alternativas disponibles', () => {
    const queue = engine.diversifyQueue(tracks, { fromIndex: 0, currentTrack: tracks[0] });
    assert.notEqual(engine.artistOf(queue[1]), 'bad bunny');
    assert.notEqual(engine.artistOf(queue[2]), engine.artistOf(queue[1]));
  });

  it('penaliza pistas que acaban de sonar al elegir la siguiente', () => {
    const queue = [tracks[0], tracks[1], tracks[3], tracks[4]];
    const index = engine.chooseNextIndex(queue, 0, {
      currentTrack: tracks[0],
      recentHistory: [{ videoId: 'feid-1' }]
    });
    assert.equal(queue[index].videoId, 'karol-1');
  });

  it('normaliza Topic y VEVO como el mismo artista', () => {
    assert.equal(engine.normalizeArtist('  Bad Bunny - Topic '), 'bad bunny');
    assert.equal(engine.normalizeArtist('BAD BUNNY VEVO'), 'bad bunny');
  });

  it('no repite la misma canción con otro videoId o artista (mismo título)', () => {
    const sameName = [
      { videoId: 'a1', title: 'Hola (Official Video)', artist: 'Artista A' },
      { videoId: 'b1', title: 'Hola', artist: 'Artista B' },
      { videoId: 'c1', title: 'Otra canción', artist: 'Artista C' }
    ];
    const unique = engine.uniqueTracks(sameName);
    assert.deepEqual(unique.map(t => t.videoId), ['a1', 'c1']);
  });

  it('penaliza una canción cuyo título acaba de sonar aunque sea otro videoId', () => {
    const queue = [
      { videoId: 'x0', title: 'Hola', artist: 'Artista A' },
      { videoId: 'x1', title: 'Hola (Official Video)', artist: 'Artista B' },
      { videoId: 'x2', title: 'Tema nuevo', artist: 'Artista C' }
    ];
    const index = engine.chooseNextIndex(queue, 0, {
      currentTrack: queue[0],
      recentHistory: [{ videoId: 'x0', title: 'Hola' }]
    });
    assert.equal(queue[index].videoId, 'x2');
  });
});
