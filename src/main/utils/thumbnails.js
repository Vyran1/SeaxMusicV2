function getMaxResThumbnail(thumbnail, videoId) {
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  if (!thumbnail) return null;
  return thumbnail
    .replace(/\/default\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/mqdefault\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/hqdefault\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/sddefault\.jpg$/, '/maxresdefault.jpg')
    .replace('/mqdefault', '/maxresdefault')
    .replace('/hqdefault', '/maxresdefault')
    .replace('/sddefault', '/maxresdefault');
}

function getBestThumbnail(videoId, url = '') {
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return url.replace(/\/(?:default|mqdefault|hqdefault|sddefault)\.jpg$/, '/maxresdefault.jpg');
}

module.exports = { getMaxResThumbnail, getBestThumbnail };
