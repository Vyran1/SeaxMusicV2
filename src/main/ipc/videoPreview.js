const { setVideoOnlyMode } = require('../windows/youtubeWindow');

async function startVideoPreviewInternal(state) {
  const active = state.getActiveYouTubeWindow();
  if (!active || active.isDestroyed() || !state.mainWindow || state.mainWindow.isDestroyed()) {
    return { success: false, error: 'No hay ventana activa' };
  }

  if (state.videoPreviewTimer) {
    return { success: true };
  }

  await setVideoOnlyMode(active, true);
  active.webContents.send('youtube-control', 'fullscreen');

  try {
    state.videoPreviewPrev = {
      bounds: active.getBounds(),
      visible: active.isVisible(),
      opacity: active.getOpacity ? active.getOpacity() : 1,
      skipTaskbar: active.isSkipTaskbar ? active.isSkipTaskbar() : true,
      focusable: active.isFocusable ? active.isFocusable() : true
    };
    active.setBounds({ x: -2000, y: -2000, width: 800, height: 450 });
    if (active.setOpacity) active.setOpacity(0.01);
    if (active.setSkipTaskbar) active.setSkipTaskbar(true);
    if (active.setFocusable) active.setFocusable(false);
    active.showInactive();
  } catch (e) { }

  active.webContents.send('video-preview-start');

  state.videoPreviewTimer = setInterval(async () => {
    try {
      if (!active || active.isDestroyed() || !state.mainWindow || state.mainWindow.isDestroyed()) return;
      const image = await active.webContents.capturePage();
      const dataUrl = image.toDataURL();
      state.mainWindow.webContents.send('video-preview-frame', dataUrl);
    } catch (e) { }
  }, 150);

  return { success: true };
}

async function stopVideoPreviewInternal(state) {
  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    await setVideoOnlyMode(active, false);
    active.webContents.send('video-preview-stop');
    try {
      if (state.videoPreviewPrev) {
        if (active.setOpacity) active.setOpacity(state.videoPreviewPrev.opacity ?? 1);
        if (active.setSkipTaskbar) active.setSkipTaskbar(!!state.videoPreviewPrev.skipTaskbar);
        if (active.setFocusable) active.setFocusable(!!state.videoPreviewPrev.focusable);
        if (state.videoPreviewPrev.visible) {
          active.showInactive();
        } else {
          active.hide();
        }
        if (state.videoPreviewPrev.bounds) {
          active.setBounds(state.videoPreviewPrev.bounds);
        }
      }
    } catch (e) { }
  }
  if (state.videoPreviewTimer) {
    clearInterval(state.videoPreviewTimer);
    state.videoPreviewTimer = null;
  }
  state.videoPreviewPrev = null;
  return { success: true };
}

module.exports = { startVideoPreviewInternal, stopVideoPreviewInternal };
