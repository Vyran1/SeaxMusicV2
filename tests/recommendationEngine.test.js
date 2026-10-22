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
});
