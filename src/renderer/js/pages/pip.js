    // State indicators
    let isPlaying = false;
    let duration = 0;
    let currentTime = 0;
    let isDraggingScrubber = false;
    let dockEdge = 'right'; // 'left' o 'right'

    // Elements Cache
    const el = {
      wrapper: document.getElementById('pipWrapper'),
      bgBlur: document.getElementById('pipBgBlur'),
      cover: document.getElementById('pipCover'),
      coverGlow: document.getElementById('pipCoverGlow'),
      miniCover: document.getElementById('pipMiniCover'),
      miniPulse: document.getElementById('pipMiniPulse'),
      miniChevronIcon: document.getElementById('pipMiniChevronIcon'),
      miniDiskWrapper: document.getElementById('pipMiniDiskWrapper'),
      title: document.getElementById('pipTitle'),
      titleContainer: document.getElementById('pipTitleContainer'),
      artist: document.getElementById('pipArtist'),
      currentTimeText: document.getElementById('pipCurrentTime'),
      durationText: document.getElementById('pipDuration'),
      progressFill: document.getElementById('pipProgressFill'),
      scrubberBar: document.getElementById('pipScrubberBar'),
      playPauseBtn: document.getElementById('pipPlayPauseBtn'),
      playIcon: document.getElementById('pipPlayIcon'),
      prevBtn: document.getElementById('pipPrevBtn'),
      nextBtn: document.getElementById('pipNextBtn'),
      closeBtn: document.getElementById('pipCloseBtn'),
      collapseBtn: document.getElementById('pipCollapseBtn')
    };

    // Initialize API bindings if available
    if (window.pipAPI) {
      console.log('[WIDGET] pipAPI cargada con éxito en el preload');

      // 1. Sincronizar info de la canción
      window.pipAPI.onVideoInfo((info) => {
        console.log('[WIDGET] Info de vídeo recibida:', info);
        if (!info) return;

        // Metadatos
        el.title.dataset.text = info.title || 'Cargando...';
        el.title.textContent = el.title.dataset.text;
        el.artist.textContent = info.artist || info.channel || 'SeaxMusic';

        // Check if text overflow happens to trigger sliding marquee animation
        setTimeout(checkMarquee, 100);

        // Portada
        const coverUrl = info.thumbnail || '../assets/img/icon.png';
        el.cover.src = coverUrl;
        el.miniCover.src = coverUrl;
        el.bgBlur.style.backgroundImage = `url("${coverUrl}")`;
        el.coverGlow.style.backgroundImage = `url("${coverUrl}")`;
      });

      // 2. Sincronizar tiempo de audio
      window.pipAPI.onAudioTimeUpdate((timeInfo) => {
        if (isDraggingScrubber) return; // Ignore updates while dragging
        if (timeInfo.currentTime !== undefined) {
          currentTime = timeInfo.currentTime;
          el.currentTimeText.textContent = formatTime(currentTime);
        }
        if (timeInfo.duration !== undefined && timeInfo.duration > 0) {
          duration = timeInfo.duration;
          el.durationText.textContent = formatTime(duration);
        }

        if (duration > 0) {
          const percent = (currentTime / duration) * 100;
          el.progressFill.style.width = percent + '%';
        }
      });

      // 3. Sincronizar estado de reproducción
      window.pipAPI.onPlaybackState((state) => {
        console.log('[WIDGET] Playback state:', state);
        isPlaying = state;
        updatePlayPauseUI();
      });

      // 4. Sincronizar estado de colapsado (Pegatina)
      window.pipAPI.onDockState((dockInfo) => {
        console.log('[WIDGET] Dock state updated:', dockInfo);
        if (dockInfo.collapsed) {
          dockEdge = dockInfo.edge || 'right';
          el.wrapper.classList.add('collapsed');
          el.wrapper.classList.remove('dock-left', 'dock-right');
          el.wrapper.classList.add(`dock-${dockEdge}`);
          
          // Cambiar dirección del chevron de expansión según el borde acoplado
          if (dockEdge === 'left') {
            el.miniChevronIcon.className = 'fas fa-chevron-right';
          } else {
            el.miniChevronIcon.className = 'fas fa-chevron-left';
          }
        } else {
          el.wrapper.classList.remove('collapsed', 'dock-left', 'dock-right');
          setTimeout(checkMarquee, 200); // Recalcular marquesina
        }
      });

      // 5. Sincronizar colores dinámicos (Aura Engine de SeaxMusic)
      window.pipAPI.onAccentColor((rgb) => {
        if (!rgb) return;
        const { r, g, b } = rgb;
        
        // Generar colores variantes para el degradado y brillos
        const brightR = Math.min(255, r + 25);
        const brightG = Math.min(255, g + 25);
        const brightB = Math.min(255, b + 25);
        
        const root = document.documentElement;
        
        // Actualizar variables de CSS
        root.style.setProperty('--accent-gradient', `linear-gradient(135deg, rgb(${r}, ${g}, ${b}), rgb(${brightR}, ${brightG}, ${brightB}))`);
        root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.4)`);
        root.style.setProperty('--glass-border', `rgba(${r}, ${g}, ${b}, 0.16)`);
        
        console.log(`[WIDGET] 🎨 Color de acento actualizado a: rgb(${r}, ${g}, ${b})`);
      });

      // Action Handlers for controls
      el.playPauseBtn.addEventListener('click', () => {
        window.pipAPI.sendControl(isPlaying ? 'pause' : 'play');
      });

      el.prevBtn.addEventListener('click', () => {
        window.pipAPI.sendControl('previous');
      });

      el.nextBtn.addEventListener('click', () => {
        window.pipAPI.sendControl('next');
      });

      el.closeBtn.addEventListener('click', () => {
        window.pipAPI.close();
      });

      // Collapse trigger
      el.collapseBtn.addEventListener('click', () => {
        window.pipAPI.sendControl('collapse');
      });

      // Expand trigger from mini disk
      el.miniDiskWrapper.addEventListener('click', () => {
        window.pipAPI.sendControl('expand');
      });

      // Hover events for collapsed sticker tab slide out drawer behavior
      el.wrapper.addEventListener('mouseenter', () => {
        if (el.wrapper.classList.contains('collapsed') && window.pipAPI && window.pipAPI.sendHover) {
          window.pipAPI.sendHover(true);
        }
      });

      el.wrapper.addEventListener('mouseleave', () => {
        if (el.wrapper.classList.contains('collapsed') && window.pipAPI && window.pipAPI.sendHover) {
          window.pipAPI.sendHover(false);
        }
      });

      // Scrubber Interaction Setup
      el.scrubberBar.addEventListener('mousedown', (e) => {
        isDraggingScrubber = true;
        handleScrubberSeek(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingScrubber) {
          handleScrubberSeek(e);
        }
      });

      window.addEventListener('mouseup', () => {
        isDraggingScrubber = false;
      });

    } else {
      console.warn('[WIDGET] pipAPI no disponible. Corriendo en modo mock para testing.');
      // Mock setups for manual testing / loading checks
      el.title.textContent = 'Demo Track - Premium Glassmorphism Widget';
      el.artist.textContent = 'Antigravity Visuals';
      duration = 240;
      el.durationText.textContent = formatTime(duration);
      setInterval(() => {
        if (isPlaying && !isDraggingScrubber) {
          currentTime = (currentTime + 1) % duration;
          el.currentTimeText.textContent = formatTime(currentTime);
          el.progressFill.style.width = (currentTime / duration * 100) + '%';
        }
      }, 1000);
      
      el.playPauseBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        updatePlayPauseUI();
      });
      el.closeBtn.addEventListener('click', () => {
        alert('Cerrar widget interactivo');
      });
      el.collapseBtn.addEventListener('click', () => {
        // Mock collapse
        dockEdge = 'left';
        el.wrapper.classList.toggle('collapsed');
        el.wrapper.classList.toggle('dock-left');
        el.miniChevronIcon.className = 'fas fa-chevron-right';
      });
      el.miniDiskWrapper.addEventListener('click', () => {
        // Mock expand
        el.wrapper.classList.remove('collapsed', 'dock-left', 'dock-right');
      });
    }

    // Helper functions
    function formatTime(seconds) {
      if (isNaN(seconds) || seconds === null) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function updatePlayPauseUI() {
      if (isPlaying) {
        el.playIcon.className = 'fas fa-pause';
        el.playPauseBtn.title = 'Pausar';
        el.miniCover.classList.add('playing');
        el.miniPulse.classList.remove('paused');
      } else {
        el.playIcon.className = 'fas fa-play';
        el.playPauseBtn.title = 'Reproducir';
        el.miniCover.classList.remove('playing');
        el.miniPulse.classList.add('paused');
      }
    }

    function checkMarquee() {
      // Volver al texto original antes de medir
      const text = el.title.dataset.text || '';
      el.title.classList.remove('marquee');
      el.title.textContent = text;

      const titleWidth = el.title.offsetWidth;
      const containerWidth = el.titleContainer.offsetWidth;

      if (titleWidth > containerWidth - 10) {
        // Dos copias del texto: la animación desplaza exactamente una copia y vuelve sin saltos
        el.title.textContent = '';
        for (let i = 0; i < 2; i++) {
          const copy = document.createElement('span');
          copy.className = 'pip-title-copy';
          copy.textContent = text;
          el.title.appendChild(copy);
        }

        el.title.classList.add('marquee');
      }
    }

    function handleScrubberSeek(e) {
      if (!duration) return;
      const rect = el.scrubberBar.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, offsetX / rect.width));
      const targetTime = pct * duration;

      // Update UI instantly for hyper-tactility
      el.progressFill.style.width = (pct * 100) + '%';
      el.currentTimeText.textContent = formatTime(targetTime);

      if (window.pipAPI) {
        window.pipAPI.sendControl('seek', targetTime);
      }
    }

    // Recalcular el texto en rotación o cambio de tamaño de ventana
    window.addEventListener('resize', checkMarquee);
