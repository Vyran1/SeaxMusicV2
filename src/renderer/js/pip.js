let isPlaying = false;
let currentTime = 0;
let duration = 0;

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateProgress() {
  const fill = document.getElementById('pipProgressFill');
  const timeEl = document.getElementById('pipTime');
  const durationEl = document.getElementById('pipDuration');
  if (timeEl) timeEl.textContent = formatTime(currentTime);
  if (durationEl) durationEl.textContent = formatTime(duration);
  if (fill && duration > 0) {
    fill.style.width = `${(currentTime / duration) * 100}%`;
  }
}

function setPlayingState(state) {
  isPlaying = !!state;
  const playBtn = document.getElementById('pipPlay');
  const icon = playBtn?.querySelector('i');
  if (icon) {
    icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
  }
}

function bindControls() {
  document.getElementById('pipPrev')?.addEventListener('click', () => {
    window.pipAPI?.sendControl('previous');
  });
  document.getElementById('pipNext')?.addEventListener('click', () => {
    window.pipAPI?.sendControl('next');
  });
  document.getElementById('pipPlay')?.addEventListener('click', () => {
    window.pipAPI?.sendControl(isPlaying ? 'pause' : 'play');
  });
  document.getElementById('pipClose')?.addEventListener('click', () => {
    window.pipAPI?.close();
  });
  document.getElementById('pipProgressBar')?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const seekTime = percent * duration;
    if (!Number.isNaN(seekTime)) {
      window.pipAPI?.sendControl('seek', seekTime);
    }
  });
}

function bindPipEvents() {
  window.pipAPI?.onVideoInfo((info) => {
    const title = document.getElementById('pipTitle');
    const artist = document.getElementById('pipArtist');
    const img = document.getElementById('pipVideo');
    const root = document.querySelector('.pip-root');
    if (title && info?.title) title.textContent = info.title;
    if (artist && (info?.channel || info?.artist)) {
      artist.textContent = info.channel || info.artist;
    }
    const thumbnail = info?.thumbnail || (info?.videoId ? `https://i.ytimg.com/vi/${info.videoId}/hqdefault.jpg` : '');
    if (img && thumbnail) {
      img.src = thumbnail;
      root?.classList.add('has-frame');
    }
  });

  window.pipAPI?.onAudioTimeUpdate((timeInfo) => {
    currentTime = timeInfo?.currentTime || 0;
    duration = timeInfo?.duration || 0;
    updateProgress();
  });

  window.pipAPI?.onPlaybackState((state) => {
    setPlayingState(state);
  });
}

bindControls();
bindPipEvents();
