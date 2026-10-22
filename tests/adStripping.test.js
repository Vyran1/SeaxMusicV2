const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// La función de parche vive dentro de backend-preload.js (se inyecta en la página con webFrame).
// La extraemos del fuente para probar exactamente el código que se envía.
function loadInjectedPatch() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'preload', 'scripts', 'backend-preload.js'),
    'utf8'
  );
  const start = src.indexOf('function stripAdsInPage()');
  const end = src.indexOf('}.toString()})();', start);
  assert.ok(start > 0 && end > start, 'no se encontró stripAdsInPage en backend-preload.js');
  const body = src.slice(start, end + 1);
  return new Function('window', 'Headers', 'Response', `return (${body});`);
}

function makeWindow(payloadForUrl) {
  return {
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      const payload = payloadForUrl(url);
      return {
        url,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json', 'content-length': '999' }),
        clone() { return this; },
        json: async () => JSON.parse(JSON.stringify(payload)),
      };
    },
  };
}

const AD_PAYLOAD = {
  videoDetails: { title: 'Mi canción' },
  adPlacements: [{ adSlot: 1 }],
  playerAds: [{ ad: 2 }],
  adSlots: [{ slot: 3 }],
};

test('quita adPlacements, playerAds y adSlots de /youtubei/v1/player', async () => {
  const win = makeWindow(() => AD_PAYLOAD);
  loadInjectedPatch()(win, Headers, Response)();
  const res = await win.fetch('https://www.youtube.com/youtubei/v1/player?key=x');
  const data = await res.json();
  assert.equal(data.adPlacements, undefined);
  assert.equal(data.playerAds, undefined);
  assert.equal(data.adSlots, undefined);
  assert.equal(data.videoDetails.title, 'Mi canción');
});

test('quita los anuncios también de /youtubei/v1/next', async () => {
  const win = makeWindow(() => AD_PAYLOAD);
  loadInjectedPatch()(win, Headers, Response)();
  const res = await win.fetch('https://www.youtube.com/youtubei/v1/next?key=x');
  const data = await res.json();
  assert.equal(data.adPlacements, undefined);
});

test('no toca otras peticiones', async () => {
  const win = makeWindow(() => AD_PAYLOAD);
  loadInjectedPatch()(win, Headers, Response)();
  const res = await win.fetch('https://www.youtube.com/youtubei/v1/browse?key=x');
  const data = await res.json();
  assert.deepEqual(data.adPlacements, [{ adSlot: 1 }]);
});

test('elimina content-length porque el cuerpo cambia de tamaño', async () => {
  const win = makeWindow(() => AD_PAYLOAD);
  loadInjectedPatch()(win, Headers, Response)();
  const res = await win.fetch('https://www.youtube.com/youtubei/v1/player?key=x');
  assert.equal(res.headers.get('content-length'), null);
});
