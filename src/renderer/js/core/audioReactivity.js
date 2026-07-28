window.initAudioReactivity = (domCache) => {
  if (!window.electronAPI || !window.electronAPI.onAudioFrequencyData) return;
  window.electronAPI.onAudioFrequencyData((data) => {
    const isPlaying = window.musicPlayer && window.musicPlayer.isPlaying;
    const appState = window.appState;

    if (!isPlaying) {
      const miniVizs = domCache.queryAll('.mini-visualizer', 'miniVisualizers');
      miniVizs.forEach(container => {
        const bars = container.querySelectorAll('.mini-bar');
        bars.forEach(bar => bar.style.transform = 'scaleY(0.2)');
      });

      const trackImage = domCache.get('trackImage');
      if (trackImage) {
        trackImage.style.boxShadow = 'none';
        trackImage.style.transform = 'scale(1)';
      }

      const npCovers = domCache.queryAll('.nowplaying-cover', 'nowPlayingCovers');
      npCovers.forEach(img => {
        img.style.boxShadow = 'none';
        img.style.transform = 'scale(1.15)';
      });

      const djPulseRing = domCache.get('djPulseRing');
      if (djPulseRing) {
        djPulseRing.style.opacity = '0';
        djPulseRing.style.transform = 'scale(1)';
      }

      document.documentElement.style.setProperty('--audio-pulse-intensity', '0');
      return;
    }

    const nowPlayingPage = domCache.get('nowPlayingPage');
    const isNowPlayingActive = nowPlayingPage && nowPlayingPage.classList.contains('active');
    const bassIntensity = (data[0] + data[1] + data[2]) / 3;
    const normalizedPulse = Math.pow(bassIntensity / 255, 1.1);

    const miniVizs = domCache.queryAll('.mini-visualizer', 'miniVisualizers');
    miniVizs.forEach(container => {
      if (!container.classList.contains('real-visualizer-active')) {
        container.classList.add('real-visualizer-active');
      }
      const bars = container.querySelectorAll('.mini-bar');
      bars.forEach((bar, i) => {
        if (data[i] !== undefined) {
          bar.style.transform = `scaleY(${0.2 + (data[i] / 255) * 1.2})`;
        }
      });
    });

    const trackImage = domCache.get('trackImage');
    if (trackImage) {
      const intensity = 0.35 + (normalizedPulse * 0.45);
      const blur = 12 + (normalizedPulse * 30);
      const spread = 4 + (normalizedPulse * 15);
      trackImage.style.boxShadow = `
        0 0 0 2px rgba(var(--accent-rgb), 0.25),
        0 0 ${blur}px ${spread}px rgba(var(--accent-rgb), ${intensity}),
        0 8px 30px rgba(0, 0, 0, 0.5)
      `;
      trackImage.style.transform = `scale(${1.0 + normalizedPulse * 0.04})`;
    }

    const djPulseRing = domCache.get('djPulseRing');
    if (djPulseRing) {
      if (!appState.djMixEnabled) {
        djPulseRing.style.opacity = '0';
        djPulseRing.style.transform = 'scale(1)';
      } else {
        const pulseBass = (data[0] + data[1]) / 2;
        const normalizedPulseBass = Math.pow(pulseBass / 255, 1.2);
        djPulseRing.style.transform = `scale(${1.0 + normalizedPulseBass * 0.5})`;
        djPulseRing.style.opacity = (0.35 + normalizedPulseBass * 0.55).toString();
        djPulseRing.style.borderWidth = `${1.5 + normalizedPulseBass * 2.5}px`;
      }
    }

    if (isNowPlayingActive) {
      const npVizs = domCache.queryAll('.nowplaying-visualizer', 'nowPlayingVisualizers');
      npVizs.forEach(container => {
        if (!container.classList.contains('real-visualizer-active')) {
          container.classList.add('real-visualizer-active');
        }
        const bars = container.querySelectorAll('.visualizer-bar');
        bars.forEach((bar, i) => {
          if (data[i] !== undefined) {
            bar.style.transform = `scaleY(${0.2 + (data[i] / 255) * 1.5})`;
          }
        });
      });

      const npCovers = domCache.queryAll('.nowplaying-cover', 'nowPlayingCovers');
      npCovers.forEach(img => {
        if (img.classList.contains('aura-active')) {
          const intensity = 0.35 + (normalizedPulse * 0.45);
          const blur = 12 + (normalizedPulse * 30);
          const spread = 4 + (normalizedPulse * 15);
          img.style.boxShadow = `
            0 0 0 2px rgba(var(--accent-rgb), 0.25),
            0 0 ${blur}px ${spread}px rgba(var(--accent-rgb), ${intensity}),
            0 8px 30px rgba(0, 0, 0, 0.5)
          `;
          img.style.transform = `scale(${1.15 + normalizedPulse * 0.04})`;
        }
      });
    }

    if (Math.abs(normalizedPulse - appState._lastPulseIntensity) > 0.05) {
      document.documentElement.style.setProperty('--audio-pulse-intensity', normalizedPulse.toString());
      appState._lastPulseIntensity = normalizedPulse;
    }
  });
};
