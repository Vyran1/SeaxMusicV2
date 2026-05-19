const { BrowserWindow, screen } = require('electron');
const path = require('path');
const state = require('../state');

function createPipWindow() {
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.show();
    state.pipWindow.focus();
    return state.pipWindow;
  }

  state.pipWindow = new BrowserWindow({
    width: 340,
    height: 420,
    minWidth: 260,
    minHeight: 340,
    resizable: true,
    frame: false,
    transparent: true, // Permite esquinas redondeadas y vidrios reales del SO
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/scripts/pip-preload.js')
    }
  });

  try {
    state.pipWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch (e) { }

  state.pipWindow.loadFile(path.join(__dirname, '../../renderer/html/pip.html'));
  state.pipWindow.webContents.once('did-finish-load', () => {
    if (state.pipWindow && !state.pipWindow.isDestroyed()) {
      if (state.lastVideoInfo) {
        state.pipWindow.webContents.send('update-video-info', state.lastVideoInfo);
      }
      state.pipWindow.webContents.send(state.isPlaying ? 'video-playing' : 'video-paused');
      
      // Sincronizar color de acento de la app
      if (state.lastAuraColor) {
        state.pipWindow.webContents.send('pip-accent-color', state.lastAuraColor);
      }

      // Sincronizar estado de colapsado en caso de recarga
      if (state.pipCollapsed) {
        const bounds = state.pipWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const { x: dispX, width: dispW } = display.workArea;
        const distLeft = Math.abs(bounds.x - dispX);
        const distRight = Math.abs((bounds.x + bounds.width) - (dispX + dispW));
        const dockEdge = distLeft < distRight ? 'left' : 'right';
        state.pipWindow.webContents.send('pip-dock-state', { collapsed: true, edge: dockEdge });
      }
    }
  });

  state.pipWindow.on('closed', () => {
    state.pipWindow = null;
    state.pipCollapsed = false;
    state.pipRestoreBounds = null;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('pip-closed');
    }
  });

  // Snapping logic: magnet snap to screen borders when dragging the collapsed tab handle
  state.pipWindow.on('moved', () => {
    if (!state.pipWindow || state.pipWindow.isDestroyed()) return;

    const bounds = state.pipWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const { x: dispX, y: dispY, width: dispW, height: dispH } = display.workArea;

    if (!state.pipCollapsed) {
      if (state.pipExpanding) return;

      const distLeft = bounds.x - dispX;
      const distRight = (dispX + dispW) - (bounds.x + bounds.width);

      // Auto collapse if dragged within 15px of screen lateral boundaries
      if (distLeft < 15 || distRight < 15) {
        collapsePip();
      }
    } else {
      const collapsedWidth = 46;
      const collapsedHeight = 100;

      // Determine closest edge (left or right)
      const distLeft = Math.abs(bounds.x - dispX);
      const distRight = Math.abs((bounds.x + bounds.width) - (dispX + dispW));
      const dockEdge = distLeft < distRight ? 'left' : 'right';

      // Snap to tuck position: leaves exactly 22px sticking out (sacado un poco más)
      const targetX = dockEdge === 'left' ? (dispX - 24) : (dispX + dispW - 22);
      const targetY = Math.max(dispY, Math.min(dispY + dispH - collapsedHeight, bounds.y));

      const roundedX = Math.round(targetX);
      const roundedY = Math.round(targetY);

      // Guard: only update bounds and send IPC if there is a real change, preventing infinite moved events loop
      if (bounds.x !== roundedX || bounds.y !== roundedY || bounds.width !== collapsedWidth || bounds.height !== collapsedHeight) {
        state.pipWindow.webContents.send('pip-dock-state', { collapsed: true, edge: dockEdge });
        try {
          state.pipWindow.setBounds({
            x: Math.round(roundedX),
            y: Math.round(roundedY),
            width: Math.round(collapsedWidth),
            height: Math.round(collapsedHeight)
          });
        } catch (e) {
          console.error('[WIDGET] Failed to setBounds in moved event:', e);
        }
      }
    }
  });

  return state.pipWindow;
}

let animationInterval = null;

function animateWindowX(targetX, duration = 180) {
  if (!state.pipWindow || state.pipWindow.isDestroyed()) return;
  
  // Strict validation: targetX must be a number, otherwise abort to prevent NaN propagation
  if (typeof targetX !== 'number' || isNaN(targetX)) {
    console.error('[WIDGET] animateWindowX targetX is invalid:', targetX);
    return;
  }

  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }

  const startBounds = state.pipWindow.getBounds();
  if (!startBounds || typeof startBounds.x !== 'number' || isNaN(startBounds.x) || 
      typeof startBounds.y !== 'number' || isNaN(startBounds.y) ||
      typeof startBounds.width !== 'number' || isNaN(startBounds.width) ||
      typeof startBounds.height !== 'number' || isNaN(startBounds.height)) {
    console.error('[WIDGET] animateWindowX startBounds is invalid:', startBounds);
    return;
  }

  const startX = startBounds.x;
  const startTime = Date.now();

  animationInterval = setInterval(() => {
    if (!state.pipWindow || state.pipWindow.isDestroyed()) {
      clearInterval(animationInterval);
      animationInterval = null;
      return;
    }

    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    
    // Cubic ease-out decryption
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentX = Math.round(startX + (targetX - startX) * ease);

    const finalX = Math.round(currentX);
    const finalY = Math.round(startBounds.y);
    const finalW = Math.round(startBounds.width);
    const finalH = Math.round(startBounds.height);

    if (isNaN(finalX) || isNaN(finalY) || isNaN(finalW) || isNaN(finalH)) {
      clearInterval(animationInterval);
      animationInterval = null;
      console.error('[WIDGET] Animation tick aborted due to NaN bounds:', { finalX, finalY, finalW, finalH });
      return;
    }

    try {
      state.pipWindow.setBounds({
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH
      });
    } catch (err) {
      console.error('[WIDGET] Failed to setBounds in animation tick:', err);
      clearInterval(animationInterval);
      animationInterval = null;
    }

    if (progress >= 1) {
      clearInterval(animationInterval);
      animationInterval = null;
    }
  }, 10);
}

function collapsePip() {
  if (!state.pipWindow || state.pipWindow.isDestroyed() || state.pipCollapsed) return;

  const bounds = state.pipWindow.getBounds();
  state.pipRestoreBounds = bounds;
  state.pipCollapsed = true;

  const display = screen.getDisplayMatching(bounds);
  const { x: dispX, y: dispY, width: dispW, height: dispH } = display.workArea;

  const collapsedWidth = 46;
  const collapsedHeight = 100;

  // Determine closest edge (left or right)
  const distLeft = Math.abs(bounds.x - dispX);
  const distRight = Math.abs((bounds.x + bounds.width) - (dispX + dispW));
  const dockEdge = distLeft < distRight ? 'left' : 'right';

  // Tuck position: leaves exactly 22px sticking out (sacado un poco más)
  const targetX = dockEdge === 'left' ? (dispX - 24) : (dispX + dispW - 22);
  const targetY = Math.max(dispY, Math.min(dispY + dispH - collapsedHeight, bounds.y + Math.round((bounds.height - collapsedHeight) / 2)));

  // Send to renderer that we are collapsing and which edge we are docking to
  state.pipWindow.webContents.send('pip-dock-state', { collapsed: true, edge: dockEdge });

  // Update bounds and styling
  state.pipWindow.setResizable(false);
  
  // Set dimensions and center Y first, then slide off-screen smoothly
  try {
    state.pipWindow.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(targetY),
      width: Math.round(collapsedWidth),
      height: Math.round(collapsedHeight)
    });
  } catch (e) {
    console.error('[WIDGET] Failed to setBounds in collapsePip:', e);
  }

  animateWindowX(Math.round(targetX), 220);
}

function expandPip() {
  if (!state.pipWindow || state.pipWindow.isDestroyed() || !state.pipCollapsed) return;

  state.pipExpanding = true;
  state.pipCollapsed = false;

  let restoreBounds = state.pipRestoreBounds || { width: 340, height: 420 };
  
  if (!state.pipRestoreBounds) {
    const display = screen.getDisplayMatching(state.pipWindow.getBounds());
    const { x, y, width, height } = display.workArea;
    restoreBounds = {
      x: Math.round(x + (width - 340) / 2),
      y: Math.round(y + (height - 420) / 2),
      width: 340,
      height: 420
    };
  } else {
    const currentBounds = state.pipWindow.getBounds();
    const display = screen.getDisplayMatching(currentBounds);
    const { x: dispX, width: dispW } = display.workArea;
    const distRight = Math.abs((currentBounds.x + currentBounds.width) - (dispX + dispW));
    
    // Snapping adjustment: keep docked edge position reference when expanding
    if (distRight < 60) { // Docked on the right
      restoreBounds.x = dispX + dispW - restoreBounds.width;
    } else {
      restoreBounds.x = currentBounds.x;
    }
    restoreBounds.y = Math.round(currentBounds.y + (currentBounds.height / 2) - (restoreBounds.height / 2));
  }

  // Stop any running animations
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  stopHoverCheck();

  state.pipWindow.setResizable(true);
  try {
    state.pipWindow.setBounds({
      x: Math.round(restoreBounds.x),
      y: Math.round(restoreBounds.y),
      width: Math.round(restoreBounds.width),
      height: Math.round(restoreBounds.height)
    });
  } catch (e) {
    console.error('[WIDGET] Failed to setBounds in expandPip:', e);
  }

  // Send to renderer that we are expanding
  state.pipWindow.webContents.send('pip-dock-state', { collapsed: false });

  // Temporarily ignore moved snap events right after expanding to prevent snapping loops
  setTimeout(() => {
    state.pipExpanding = false;
  }, 1000);
}

function isCursorInWindow() {
  if (!state.pipWindow || state.pipWindow.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const bounds = state.pipWindow.getBounds();
  
  return (
    cursor.x >= bounds.x &&
    cursor.x <= bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y <= bounds.y + bounds.height
  );
}

let hoverCheckInterval = null;

function startHoverCheck() {
  if (hoverCheckInterval) return;
  
  hoverCheckInterval = setInterval(() => {
    if (!state.pipWindow || state.pipWindow.isDestroyed() || !state.pipCollapsed) {
      stopHoverCheck();
      return;
    }
    
    // Check if the cursor is physically no longer inside the window
    const bounds = state.pipWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const { x: dispX, width: dispW } = display.workArea;
    const distLeft = Math.abs(bounds.x - dispX);
    const distRight = Math.abs((bounds.x + bounds.width) - (dispX + dispW));
    const dockEdge = distLeft < distRight ? 'left' : 'right';
    
    // Check if we are currently in revealed mode (i.e. window is not in tuck position)
    const isTucked = dockEdge === 'left' 
      ? (bounds.x <= dispX - 10) 
      : (bounds.x >= dispX + dispW - 30);
      
    if (!isTucked && !isCursorInWindow()) {
      // Mouse left but no mouseleave event was received or processed. Tuck it back!
      const targetX = dockEdge === 'left' ? (dispX - 24) : (dispX + dispW - 22);
      animateWindowX(Math.round(targetX), 180);
      stopHoverCheck();
    }
  }, 150);
}

function stopHoverCheck() {
  if (hoverCheckInterval) {
    clearInterval(hoverCheckInterval);
    hoverCheckInterval = null;
  }
}

function handlePipHover(isHovering) {
  if (!state.pipWindow || state.pipWindow.isDestroyed() || !state.pipCollapsed) return;

  if (isHovering) {
    startHoverCheck();
  } else {
    // If we receive a mouseleave event but the cursor is still physically inside the bounds,
    // it is a false event triggered by Electron/Chromium window programmatic movement. Ignore it!
    if (isCursorInWindow()) {
      return;
    }
    stopHoverCheck();
  }

  const bounds = state.pipWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const { x: dispX, width: dispW } = display.workArea;

  const collapsedWidth = 46;

  const distLeft = Math.abs(bounds.x - dispX);
  const distRight = Math.abs((bounds.x + bounds.width) - (dispX + dispW));
  const dockEdge = distLeft < distRight ? 'left' : 'right';

  let targetX;
  if (isHovering) {
    // Reveal mode: fully on-screen
    targetX = dockEdge === 'left' ? dispX : (dispX + dispW - collapsedWidth);
  } else {
    // Tuck mode: leaves exactly 22px sticking out (sacado un poco más)
    targetX = dockEdge === 'left' ? (dispX - 24) : (dispX + dispW - 22);
  }

  animateWindowX(Math.round(targetX), 180);
}

module.exports = { createPipWindow, collapsePip, expandPip, handlePipHover };
