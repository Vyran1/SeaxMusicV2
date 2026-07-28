window.SEAX = {
  DJ_MIX_DEFAULT_MS: 600,
  DJ_MIX_LEAD_SEC: 180,
  DJ_MIX_CROSSFADE_MS: 10000,
  DJ_MIX_LEAD_START_SEC: 4,
  AUDIO_PULSE_THRESHOLD: 0.05,
  LYRIC_SYNC_INTERVAL: 200,
  VIDEO_PREVIEW_INTERVAL: 150,
  AUDIO_IPC_INTERVAL: 33,
  LOCAL_STORAGE: {
    DJ_MIX: 'seaxmusic_djmix',
    REPEAT: 'seaxmusic_repeat',
    SHUFFLE: 'seaxmusic_shuffle',
    VOLUME: 'seaxmusic_volume',
    LIKED: 'seaxmusic_liked',
    HISTORY: 'seaxmusic_history',
  },
  IPC_CHANNELS: {
    ALLOWED_SEND: new Set([
      'audio-control', 'seek-audio', 'update-volume', 'play-audio',
      'set-current-playlist', 'clear-current-playlist',
      'dj-set-mode', 'dj-set-window-volume', 'dj-control-window',
      'video-preview-start', 'video-preview-stop',
      'aura-color-update',
    ]),
  },
};
