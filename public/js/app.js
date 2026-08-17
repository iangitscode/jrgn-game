// ==========================================================================
// jrgn - Main Application Logic & TV Display / Spectator Host Engine
// ==========================================================================

class AcronymGameApp {
  constructor() {
    this.socket = null;
    this.state = {
      roomCode: null,
      playerId: null,
      sessionToken: null,
      playerName: '',
      avatar: '🚀',
      isHost: false,
      isTvMode: false,
      currentScreen: 'screen-welcome',
      roomData: null,
      activeIdeaCardIndex: null,
      selectedVoteOptionId: null,
      activeCategoryFilter: 'ALL',
      lastRenderedGuessRoundKey: null,
      lastRenderedVoteRoundKey: null,
      lastRenderedAcronym: null,
      knownPlayersCount: 0,
      hasShownVotingShuffle: false,
      lastRevealAcronym: null,
      revealStep: 0,
      revealTimer: null
    };

    this.avatars = ['🚀', '💡', '👾', '🔬', '🎯', '⚡', '🦊', '🍕', '🎩', '🦄', '💎', '🎲'];
  }

  init() {
    this.initSocket();
    this.renderAvatarGrid();
    this.initUrlParams();
    this.checkSavedSession();
    this.updateSoundButtonState();
  }

  // -------------------------------------------------------------
  // SOCKET SETUP
  // -------------------------------------------------------------
  initSocket() {
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('Connected to server with socket ID:', this.socket.id);
      // Auto-reconnect if session exists
      const saved = this.getSavedSession();
      if (saved && saved.roomCode) {
        if (saved.isTvMode) {
          this.joinTvRoom(saved.roomCode, true);
        } else if (saved.playerId && saved.sessionToken && this.state.roomCode) {
          this.executeRejoin(true);
        }
      }
    });

    this.socket.on('roomStateUpdate', (roomState) => {
      console.log('Room State Update:', roomState);
      this.handleRoomStateUpdate(roomState);
    });

    this.socket.on('timerTick', ({ timeLeft }) => {
      this.handleTimerTick(timeLeft);
    });

    this.socket.on('disconnect', () => {
      console.warn('Socket disconnected.');
    });
  }

  // -------------------------------------------------------------
  // SESSION PERSISTENCE (LocalStorage)
  // -------------------------------------------------------------
  getSavedSession() {
    try {
      const data = localStorage.getItem('jrgn_session') || localStorage.getItem('acro_party_session');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveSession(data) {
    try {
      localStorage.setItem('jrgn_session', JSON.stringify(data));
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }

  clearSession() {
    try {
      localStorage.removeItem('jrgn_session');
      localStorage.removeItem('acro_party_session');
    } catch (e) {}
  }

  checkSavedSession() {
    const saved = this.getSavedSession();
    if (saved && saved.roomCode) {
      if (saved.isTvMode) {
        this.enableTvMode(false);
        const castInput = document.getElementById('tv-cast-code-input');
        if (castInput) castInput.value = saved.roomCode;
        return;
      }

      if (saved.sessionToken && saved.playerId) {
        const banner = document.getElementById('reconnect-banner');
        const recCode = document.getElementById('rec-room-code');
        const recName = document.getElementById('rec-player-name');
        if (banner && recCode && recName) {
          recCode.textContent = saved.roomCode;
          recName.textContent = saved.playerName || 'Player';
          banner.classList.remove('hidden');
        }

        // Pre-fill nickname & avatar
        if (saved.playerName) {
          const nameInput = document.getElementById('player-name');
          if (nameInput) nameInput.value = saved.playerName;
        }
        if (saved.avatar) {
          this.selectAvatar(saved.avatar);
        }
      }
    }
  }

  dismissReconnect() {
    this.clearSession();
    const banner = document.getElementById('reconnect-banner');
    if (banner) banner.classList.add('hidden');
    this.showToast('Session cleared', 'info');
  }

  executeRejoin(isSilent = false) {
    const saved = this.getSavedSession();
    if (!saved || !saved.roomCode || !saved.playerId || !saved.sessionToken) {
      if (!isSilent) this.showToast('No valid session to restore', 'error');
      return;
    }

    this.socket.emit('rejoinRoom', {
      roomCode: saved.roomCode,
      playerId: saved.playerId,
      sessionToken: saved.sessionToken
    }, (res) => {
      if (res && res.success) {
        this.state.roomCode = res.roomCode;
        this.state.playerId = res.playerId;
        this.state.sessionToken = res.sessionToken;
        this.state.playerName = saved.playerName;
        this.state.avatar = saved.avatar;
        this.state.isTvMode = false;

        this.updateHeaderRoomPill(res.roomCode);
        this.handleRoomStateUpdate(res.roomState);
        this.showToast(`Rejoined room ${res.roomCode}!`, 'success');
      } else {
        this.clearSession();
        const banner = document.getElementById('reconnect-banner');
        if (banner) banner.classList.add('hidden');
        if (!isSilent) this.showToast((res && res.error) || 'Could not rejoin room.', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // URL PARAMETERS & TV MODE DETECTION
  // -------------------------------------------------------------
  initUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const isTvUrl = modeParam === 'tv' || params.has('tv') || window.location.pathname.startsWith('/tv');
    const roomParam = (params.get('room') || params.get('code') || '').trim().toUpperCase();

    if (isTvUrl) {
      this.enableTvMode(true);
      if (roomParam) {
        const castInput = document.getElementById('tv-cast-code-input');
        if (castInput) castInput.value = roomParam;
        this.joinTvRoom(roomParam);
      }
    } else if (roomParam) {
      const codeInput = document.getElementById('room-code-input');
      if (codeInput) {
        codeInput.value = roomParam;
      }
      this.switchWelcomeTab('join');
    }
  }

  // -------------------------------------------------------------
  // TV MODE LAUNCHER & HOST CONTROLS
  // -------------------------------------------------------------
  enableTvMode(showToastNotice = true) {
    this.state.isTvMode = true;
    document.body.classList.add('mode-tv');

    const tvPill = document.getElementById('header-tv-pill');
    if (tvPill) tvPill.classList.remove('hidden');

    const tvLauncher = document.getElementById('tv-welcome-launcher');
    const playerSection = document.getElementById('player-welcome-section');
    if (tvLauncher) tvLauncher.classList.remove('hidden');
    if (playerSection) playerSection.classList.add('hidden');

    if (showToastNotice) {
      this.showToast('📺 TV Host Display Mode Activated', 'info');
    }
  }

  createTvRoom() {
    this.socket.emit('createTvRoom', {
      options: { wordsPerPlayer: 2, guessTimeLimit: 45, voteTimeLimit: 30 }
    }, (res) => {
      if (res && res.success) {
        this.state.roomCode = res.roomCode;
        this.state.isTvMode = true;
        this.state.isHost = true;
        this.state.playerId = null;
        this.state.sessionToken = null;

        document.body.classList.add('mode-tv');

        this.saveSession({
          roomCode: res.roomCode,
          isTvMode: true
        });

        this.updateHeaderRoomPill(res.roomCode);
        this.handleRoomStateUpdate(res.roomState);
        this.showToast(`TV Host Room [${res.roomCode}] Created!`, 'success');
      } else {
        this.showToast((res && res.error) || 'Failed to create TV room', 'error');
      }
    });
  }

  joinTvRoomByInput() {
    const input = document.getElementById('tv-cast-code-input');
    const code = (input ? input.value : '').trim().toUpperCase();
    if (!code || code.length < 3) {
      this.showToast('Please enter a 4-letter room code', 'error');
      return;
    }
    this.joinTvRoom(code);
  }

  joinTvRoom(roomCode, isSilent = false) {
    const code = (roomCode || '').trim().toUpperCase();
    this.socket.emit('joinTvRoom', { roomCode: code }, (res) => {
      if (res && res.success) {
        this.state.roomCode = res.roomCode;
        this.state.isTvMode = true;
        this.state.isHost = Boolean(res.isTvHost);
        this.state.playerId = null;

        document.body.classList.add('mode-tv');

        this.saveSession({
          roomCode: res.roomCode,
          isTvMode: true
        });

        this.updateHeaderRoomPill(res.roomCode);
        this.handleRoomStateUpdate(res.roomState);
        if (!isSilent) this.showToast(`Joined Room [${res.roomCode}] on TV!`, 'success');
      } else {
        if (!isSilent) this.showToast((res && res.error) || 'Room not found for TV join', 'error');
      }
    });
  }

  // Sound toggle
  toggleSound() {
    if (window.soundEngine) {
      const isMuted = window.soundEngine.toggleMute();
      this.updateSoundButtonState();
      this.showToast(isMuted ? '🔇 Sound Muted' : '🔊 Sound Enabled', 'info');
    }
  }

  updateSoundButtonState() {
    const btn = document.getElementById('btn-toggle-sound');
    if (btn && window.soundEngine) {
      btn.textContent = window.soundEngine.isMuted ? '🔇' : '🔊';
      btn.title = window.soundEngine.isMuted ? 'Unmute Sound' : 'Mute Sound';
    }
  }

  // Fullscreen toggle
  toggleFullscreen() {
    const btn = document.getElementById('btn-toggle-fullscreen');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        if (btn) btn.textContent = '🗗';
      }).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          if (btn) btn.textContent = '⛶';
        }).catch(() => {});
      }
    }
  }

  // -------------------------------------------------------------
  // WELCOME FORM & AVATAR PICKER
  // -------------------------------------------------------------
  renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    this.avatars.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avatar-opt ${emoji === this.state.avatar ? 'selected' : ''}`;
      btn.textContent = emoji;
      btn.onclick = () => this.selectAvatar(emoji);
      grid.appendChild(btn);
    });
  }

  selectAvatar(emoji) {
    this.state.avatar = emoji;
    const input = document.getElementById('selected-avatar');
    if (input) input.value = emoji;

    const opts = document.querySelectorAll('.avatar-opt');
    opts.forEach(opt => {
      if (opt.textContent === emoji) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  }

  switchWelcomeTab(mode) {
    const tabJoin = document.getElementById('tab-join');
    const tabCreate = document.getElementById('tab-create');
    const tabTv = document.getElementById('tab-tv');
    const groupRoomCode = document.getElementById('group-room-code');
    const btnText = document.getElementById('btn-welcome-text');
    const roomCodeInput = document.getElementById('room-code-input');
    const tvLauncher = document.getElementById('tv-welcome-launcher');
    const playerSection = document.getElementById('player-welcome-section');

    if (mode === 'tv') {
      if (tabTv) tabTv.classList.add('active');
      if (tabJoin) tabJoin.classList.remove('active');
      if (tabCreate) tabCreate.classList.remove('active');
      if (tvLauncher) tvLauncher.classList.remove('hidden');
      if (playerSection) playerSection.classList.add('hidden');
    } else {
      if (tabTv) tabTv.classList.remove('active');
      if (tvLauncher) tvLauncher.classList.add('hidden');
      if (playerSection) playerSection.classList.remove('hidden');

      if (mode === 'join') {
        if (tabJoin) tabJoin.classList.add('active');
        if (tabCreate) tabCreate.classList.remove('active');
        if (groupRoomCode) groupRoomCode.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Join Room';
        if (roomCodeInput) roomCodeInput.setAttribute('required', 'true');
      } else {
        if (tabCreate) tabCreate.classList.add('active');
        if (tabJoin) tabJoin.classList.remove('active');
        if (groupRoomCode) groupRoomCode.classList.add('hidden');
        if (btnText) btnText.textContent = 'Create Room';
        if (roomCodeInput) roomCodeInput.removeAttribute('required');
      }
    }
  }

  setSegmentVal(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const buttons = container.querySelectorAll('.segment-btn');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-val') == value) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  handleWelcomeSubmit(e) {
    e.preventDefault();

    const nameInput = document.getElementById('player-name');
    const playerName = (nameInput ? nameInput.value : '').trim();
    const isJoin = document.getElementById('tab-join').classList.contains('active');

    if (!playerName) {
      this.showToast('Please enter your nickname', 'error');
      return;
    }

    this.state.playerName = playerName;

    if (isJoin) {
      const codeInput = document.getElementById('room-code-input');
      const roomCode = (codeInput ? codeInput.value : '').trim().toUpperCase();

      if (!roomCode || roomCode.length < 3) {
        this.showToast('Please enter a valid 4-letter room code', 'error');
        return;
      }

      this.socket.emit('joinRoom', {
        roomCode,
        playerName,
        avatar: this.state.avatar
      }, (res) => {
        if (res && res.success) {
          this.state.roomCode = res.roomCode;
          this.state.playerId = res.playerId;
          this.state.sessionToken = res.sessionToken;
          this.state.isTvMode = false;

          this.saveSession({
            roomCode: res.roomCode,
            playerId: res.playerId,
            sessionToken: res.sessionToken,
            playerName,
            avatar: this.state.avatar,
            isTvMode: false
          });

          this.updateHeaderRoomPill(res.roomCode);
          this.handleRoomStateUpdate(res.roomState);
          this.showToast(`Joined Room ${res.roomCode}!`, 'success');
        } else {
          this.showToast((res && res.error) || 'Failed to join room', 'error');
        }
      });
    } else {
      // Create Room as Player Host
      this.socket.emit('createRoom', {
        playerName,
        avatar: this.state.avatar,
        options: { wordsPerPlayer: 2 }
      }, (res) => {
        if (res && res.success) {
          this.state.roomCode = res.roomCode;
          this.state.playerId = res.playerId;
          this.state.sessionToken = res.sessionToken;
          this.state.isHost = true;
          this.state.isTvMode = false;

          this.saveSession({
            roomCode: res.roomCode,
            playerId: res.playerId,
            sessionToken: res.sessionToken,
            playerName,
            avatar: this.state.avatar,
            isTvMode: false
          });

          this.updateHeaderRoomPill(res.roomCode);
          this.handleRoomStateUpdate(res.roomState);
          this.showToast(`Room ${res.roomCode} Created!`, 'success');
        } else {
          this.showToast((res && res.error) || 'Failed to create room', 'error');
        }
      });
    }
  }

  // -------------------------------------------------------------
  // MASTER STATE MACHINE HANDLER
  // -------------------------------------------------------------
  setScreen(screenId) {
    if (this.state.currentScreen === screenId) {
      return;
    }
    this.state.currentScreen = screenId;
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  handleRoomStateUpdate(roomState) {
    if (!roomState) return;
    this.state.roomData = roomState;

    if (this.state.isTvMode) {
      this.state.isHost = Boolean(roomState.hasTvHost || !roomState.hostPlayerId);
    } else {
      this.state.isHost = Boolean(roomState.hostPlayerId && roomState.hostPlayerId === this.state.playerId);
    }

    this.updateHeaderRoomPill(roomState.roomCode);

    switch (roomState.status) {
      case 'LOBBY':
        this.renderLobbyScreen(roomState);
        this.setScreen('screen-lobby');
        break;
      case 'SUBMITTING':
        this.renderSubmissionsScreen(roomState);
        this.setScreen('screen-submit');
        break;
      case 'GUESSING':
        this.renderGuessingScreen(roomState);
        this.setScreen('screen-guess');
        break;
      case 'VOTING':
        this.renderVotingScreen(roomState);
        this.setScreen('screen-vote');
        break;
      case 'REVEAL':
        this.renderRevealScreen(roomState);
        this.setScreen('screen-reveal');
        break;
      case 'SCOREBOARD':
        this.renderScoreboardScreen(roomState);
        this.setScreen('screen-scoreboard');
        break;
      default:
        console.warn('Unknown room status:', roomState.status);
    }
  }

  updateHeaderRoomPill(roomCode) {
    const pill = document.getElementById('header-room-pill');
    const codeEl = document.getElementById('header-room-code');
    if (pill && codeEl && roomCode) {
      codeEl.textContent = roomCode;
      pill.classList.remove('hidden');
    }
  }

  // -------------------------------------------------------------
  // SCREEN 2: LOBBY (PLAYER & BIG SCREEN TV DISPLAY)
  // -------------------------------------------------------------
  renderLobbyScreen(roomState) {
    this.state.lastRenderedGuessRoundKey = null;
    this.state.lastRenderedVoteRoundKey = null;
    this.state.lastRenderedAcronym = null;
    this.state.lastRevealAcronym = null;
    this.state.selectedVoteOptionId = null;
    this.state.hasShownVotingShuffle = false;
    const subCardsList = document.getElementById('submission-cards-list');
    if (subCardsList) subCardsList.innerHTML = '';

    const codeEl = document.getElementById('lobby-room-code');
    const countEl = document.getElementById('lobby-player-count');
    const rosterGrid = document.getElementById('lobby-roster-grid');
    const hostBotBtn = document.getElementById('host-bot-btn-container');
    const hostStartContainer = document.getElementById('host-start-container');
    const waitingNotice = document.getElementById('waiting-host-notice');
    const hostControls = document.querySelectorAll('.host-control');
    const tvQrWrapper = document.getElementById('tv-lobby-qr-wrapper');
    const tvQrImg = document.getElementById('tv-lobby-qr-image');
    const tvJoinUrlText = document.getElementById('tv-join-url-text');
    const tvDirectJoinUrl = document.getElementById('tv-direct-join-url');
    const qrModalBtn = document.getElementById('btn-open-qr-modal');

    if (codeEl) codeEl.textContent = roomState.roomCode;
    if (countEl) countEl.textContent = roomState.players.length;

    // Check if new player joined and play chime
    const currentCount = roomState.players.length;
    if (currentCount > this.state.knownPlayersCount && this.state.knownPlayersCount > 0) {
      if (window.soundEngine) window.soundEngine.playJoin();
    }
    this.state.knownPlayersCount = currentCount;

    // TV Mode Lobby UI setup
    if (this.state.isTvMode) {
      if (tvQrWrapper) tvQrWrapper.classList.remove('hidden');
      if (tvDirectJoinUrl) tvDirectJoinUrl.classList.remove('hidden');
      if (qrModalBtn) qrModalBtn.classList.add('hidden');

      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomState.roomCode}`;
      if (tvJoinUrlText) tvJoinUrlText.textContent = `${window.location.host}/?room=${roomState.roomCode}`;

      if (tvQrImg && (!tvQrImg.src || !tvQrImg.src.includes('data:image'))) {
        fetch(`/api/qr?url=${encodeURIComponent(joinUrl)}`)
          .then(r => r.json())
          .then(data => {
            if (data && data.qr) tvQrImg.src = data.qr;
          })
          .catch(console.error);
      }
    } else {
      if (tvQrWrapper) tvQrWrapper.classList.add('hidden');
      if (tvDirectJoinUrl) tvDirectJoinUrl.classList.add('hidden');
      if (qrModalBtn) qrModalBtn.classList.remove('hidden');
    }

    // Render Player Roster with live checkmarks & role badges
    if (rosterGrid) {
      rosterGrid.innerHTML = '';
      roomState.players.forEach(p => {
        const card = document.createElement('div');
        const isMe = Boolean(this.state.playerId && p.id === this.state.playerId);
        card.className = `player-badge-card ${isMe ? 'is-me' : ''} ${p.isBot ? 'is-bot' : ''} ${this.state.isTvMode ? 'tv-card' : ''}`;

        let roleTag = '';
        if (p.isHost) {
          roleTag = '<span class="pbc-role-tag pbc-role-host">HOST</span>';
        } else if (p.isBot) {
          roleTag = '<span class="pbc-role-tag pbc-role-bot">AI BOT</span>';
        } else {
          roleTag = '<span class="pbc-role-tag pbc-role-player">PLAYER</span>';
        }

        let removeBtn = '';
        if (this.state.isHost && (!p.isHost || this.state.isTvMode)) {
          removeBtn = `<button class="btn-remove-player" title="Remove player" onclick="app.removePlayer('${p.id}')">✕</button>`;
        }

        card.innerHTML = `
          ${removeBtn}
          <div class="pbc-avatar">${p.avatar || '👤'}</div>
          <div class="pbc-name">${this.escapeHtml(p.name)} ${isMe ? '(You)' : ''}</div>
          ${roleTag}
        `;
        rosterGrid.appendChild(card);
      });
    }

    // Host vs Guest controls
    if (this.state.isHost) {
      if (hostBotBtn) hostBotBtn.classList.remove('hidden');
      if (hostStartContainer) hostStartContainer.classList.remove('hidden');
      if (waitingNotice) waitingNotice.classList.add('hidden');
      hostControls.forEach(ctrl => {
        ctrl.style.pointerEvents = 'auto';
        ctrl.style.opacity = '1';
      });

      const startBtn = document.getElementById('btn-start-game');
      if (startBtn) {
        startBtn.disabled = roomState.players.length < 2;
      }
    } else {
      if (hostBotBtn) hostBotBtn.classList.add('hidden');
      if (hostStartContainer) hostStartContainer.classList.add('hidden');
      if (waitingNotice) waitingNotice.classList.remove('hidden');
      hostControls.forEach(ctrl => {
        ctrl.style.pointerEvents = 'none';
        ctrl.style.opacity = '0.7';
      });
    }

    // Sync options values
    if (roomState.options) {
      this.setSegmentVal('opt-words-control', roomState.options.wordsPerPlayer !== undefined ? roomState.options.wordsPerPlayer : 2);
      this.setSegmentVal('opt-guess-time-control', roomState.options.guessTimeLimit !== undefined ? roomState.options.guessTimeLimit : 45);
      this.setSegmentVal('opt-vote-time-control', roomState.options.voteTimeLimit !== undefined ? roomState.options.voteTimeLimit : 30);
    }
  }

  updateOption(key, value) {
    if (!this.state.isHost) return;
    this.socket.emit('updateOptions', {
      options: { [key]: value }
    });
  }

  addBot() {
    this.socket.emit('addBot', {});
  }

  removePlayer(targetPlayerId) {
    this.socket.emit('removePlayer', { targetPlayerId });
  }

  startGame() {
    this.socket.emit('startGame', {}, (res) => {
      if (res && !res.success) {
        this.showToast(res.error || 'Failed to start game', 'error');
      }
    });
  }

  copyRoomLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${this.state.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      const hint = document.getElementById('copy-hint');
      if (hint) {
        hint.classList.add('show');
        setTimeout(() => hint.classList.remove('show'), 2000);
      }
      this.showToast('Join link copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast(`Room code: ${this.state.roomCode}`, 'info');
    });
  }

  // -------------------------------------------------------------
  // SCREEN 3: SUBMISSION PHASE (ZERO SPOILERS ON TV)
  // -------------------------------------------------------------
  renderSubmissionsScreen(roomState) {
    const wordsCount = (roomState.options && roomState.options.wordsPerPlayer) || 2;
    const label = document.getElementById('submit-words-count-label');
    if (label) label.textContent = wordsCount;

    const cardsList = document.getElementById('submission-cards-list');
    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);
    const submitForm = document.getElementById('submissions-form');
    const tvSubmitBanner = document.getElementById('tv-submit-banner');

    if (this.state.isTvMode) {
      if (submitForm) submitForm.classList.add('hidden');
      if (tvSubmitBanner) tvSubmitBanner.classList.remove('hidden');
    } else {
      if (submitForm) submitForm.classList.remove('hidden');
      if (tvSubmitBanner) tvSubmitBanner.classList.add('hidden');

      if (cardsList && cardsList.children.length === 0) {
        cardsList.innerHTML = '';
        for (let i = 0; i < wordsCount; i++) {
          const card = document.createElement('div');
          card.className = 'sub-item-card';
          card.id = `sub-card-${i}`;
          card.innerHTML = `
            <div class="sic-header">
              <span class="sic-number">ACRONYM #${i + 1}</span>
              <button type="button" class="sic-idea-btn" onclick="app.openIdeaModalForCard(${i})">
                💡 Idea / Preset
              </button>
            </div>
            <div class="form-group">
              <label class="form-label">Acronym / Abbreviation</label>
              <input type="text" class="form-input sub-acronym-input" id="sub-acronym-${i}" placeholder="e.g. EBITDA, CRUD, REST" maxlength="12" required>
            </div>
            <div class="form-group">
              <label class="form-label">Real Definition (The Truth)</label>
              <input type="text" class="form-input sub-def-input" id="sub-def-${i}" placeholder="e.g. Representational State Transfer" maxlength="120" required>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Industry / Field</label>
              <input type="text" class="form-input sub-cat-input" id="sub-cat-${i}" placeholder="e.g. Tech, Healthcare, Finance, Aviation" maxlength="30" value="Tech & Software">
            </div>
          `;
          cardsList.appendChild(card);
        }
      }

      const submitBtn = document.getElementById('btn-submit-words');
      if (myPlayer && myPlayer.hasSubmittedWords) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '✓ Acronyms Locked In (Waiting for others...)';
        }
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Lock In My Acronyms ➔';
        }
      }
    }

    // Render live player submission status with checkmarks
    const playersListEl = document.getElementById('submission-players-list');
    const readyCountEl = document.getElementById('submit-ready-count');
    const readyCount = roomState.players.filter(p => p.hasSubmittedWords).length;

    if (readyCountEl) readyCountEl.textContent = `${readyCount} / ${roomState.players.length}`;

    if (playersListEl) {
      playersListEl.innerHTML = '';
      roomState.players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = `lsc-player-chip ${p.hasSubmittedWords ? 'is-ready' : ''}`;
        chip.innerHTML = `
          <span>${p.avatar || '👤'}</span>
          <span>${this.escapeHtml(p.name)}</span>
          <span style="font-weight:800;">${p.hasSubmittedWords ? '✓ READY' : '✍️ Typing...'}</span>
        `;
        playersListEl.appendChild(chip);
      });
    }
  }

  handleWordsSubmit(e) {
    e.preventDefault();

    const wordsCount = (this.state.roomData && this.state.roomData.options && this.state.roomData.options.wordsPerPlayer) || 2;
    const submissions = [];

    for (let i = 0; i < wordsCount; i++) {
      const acroEl = document.getElementById(`sub-acronym-${i}`);
      const defEl = document.getElementById(`sub-def-${i}`);
      const catEl = document.getElementById(`sub-cat-${i}`);

      const acronym = acroEl ? acroEl.value.trim().toUpperCase() : '';
      const definition = defEl ? defEl.value.trim().toUpperCase() : '';
      const category = catEl ? catEl.value.trim() : 'General';

      if (!acronym || !definition) {
        this.showToast(`Please complete Acronym #${i + 1}`, 'error');
        return;
      }

      submissions.push({ acronym, definition, category });
    }

    this.socket.emit('submitWords', { submissions }, (res) => {
      if (res && res.success) {
        this.showToast('Acronyms submitted!', 'success');
      } else {
        this.showToast((res && res.error) || 'Failed to submit words', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // SCREEN 4: GUESSING / BLUFFING (ZERO SPOILERS ON TV)
  // -------------------------------------------------------------
  renderGuessingScreen(roomState) {
    const round = roomState.currentRound;
    if (!round) return;

    const roundKey = `${round.roundNumber || 0}_${round.acronym}`;
    const isNewRound = this.state.lastRenderedGuessRoundKey !== roundKey;

    const roundNumEl = document.getElementById('guess-round-num');
    const totalRoundsEl = document.getElementById('guess-total-rounds');
    const acroTextEl = document.getElementById('guess-acronym-text');
    const categoryEl = document.getElementById('guess-acronym-category');
    const submitterEl = document.getElementById('guess-acronym-submitter');
    const promptEl = document.getElementById('guess-acronym-prompt');

    if (roundNumEl) roundNumEl.textContent = round.roundNumber;
    if (totalRoundsEl) totalRoundsEl.textContent = round.totalRounds;
    if (acroTextEl) acroTextEl.textContent = round.acronym;
    if (categoryEl) categoryEl.textContent = round.category || 'General Industry';
    if (submitterEl) submitterEl.textContent = `Submitted by ${round.submitterName}`;

    this.handleTimerTick(roomState.timeLeft, 'guess');

    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);
    const isAuthor = round.isAuthor;

    const actionCard = document.getElementById('guess-player-action-card');
    const authorCard = document.getElementById('guess-author-vip-card');
    const form = document.getElementById('guess-form');
    const alertBox = document.getElementById('guess-alert-box');
    const submittedNotice = document.getElementById('guess-submitted-notice');
    const guessInput = document.getElementById('guess-input');

    if (isNewRound) {
      this.state.lastRenderedGuessRoundKey = roundKey;
      this.state.lastRenderedAcronym = round.acronym;
      this.state.lastRenderedVoteRoundKey = null;
      this.state.selectedVoteOptionId = null;
      this.state.hasShownVotingShuffle = false;

      if (guessInput) guessInput.value = '';
      if (alertBox) alertBox.classList.add('hidden');
    }

    if (this.state.isTvMode) {
      // Big Screen TV Host Mode: Zero spoilers!
      if (actionCard) actionCard.classList.add('hidden');
      if (authorCard) authorCard.classList.add('hidden');
      if (promptEl) promptEl.textContent = 'What does this acronym stand for? Players are writing convincing bluffs on their phones!';
    } else {
      if (promptEl) promptEl.textContent = 'What does this acronym stand for?';

      if (isAuthor) {
        if (actionCard) actionCard.classList.add('hidden');
        if (authorCard) {
          authorCard.classList.remove('hidden');
          const realDefEl = document.getElementById('author-vip-real-def');
          if (realDefEl) realDefEl.textContent = round.realDefinition || '';
        }
      } else {
        if (authorCard) authorCard.classList.add('hidden');
        if (actionCard) actionCard.classList.remove('hidden');

        if (myPlayer && myPlayer.hasGuessed) {
          if (form) form.classList.add('hidden');
          if (submittedNotice) submittedNotice.classList.remove('hidden');
        } else {
          if (form) form.classList.remove('hidden');
          if (submittedNotice) submittedNotice.classList.add('hidden');
        }
      }
    }

    // Live guessing progress indicators with checkmarks
    const guessListEl = document.getElementById('guess-players-list');
    const readyCountEl = document.getElementById('guess-ready-count');

    const nonAuthorPlayers = roomState.players.filter(p => p.id !== round.submitterId);
    const guessedCount = nonAuthorPlayers.filter(p => p.hasGuessed).length;
    if (readyCountEl) readyCountEl.textContent = `${guessedCount} / ${nonAuthorPlayers.length}`;

    if (guessListEl) {
      guessListEl.innerHTML = '';
      roomState.players.forEach(p => {
        const isThisAuthor = p.id === round.submitterId;
        const chip = document.createElement('div');
        chip.className = `lsc-player-chip ${p.hasGuessed ? 'is-ready' : ''} ${isThisAuthor ? 'is-author-chip' : ''}`;

        let statusText = '🤔 Thinking...';
        if (isThisAuthor) {
          statusText = '👑 AUTHOR (Sitting Out)';
        } else if (p.hasGuessed) {
          statusText = '✓ BLUFF LOCKED IN';
        }

        chip.innerHTML = `
          <span>${p.avatar || '👤'}</span>
          <span>${this.escapeHtml(p.name)}</span>
          <span style="font-weight:800;">${statusText}</span>
        `;
        guessListEl.appendChild(chip);
      });
    }
  }

  handleGuessSubmit(e) {
    e.preventDefault();

    const input = document.getElementById('guess-input');
    const guess = input ? input.value.trim().toUpperCase() : '';

    if (!guess) {
      this.showToast('Please type a bluff definition', 'error');
      return;
    }

    const alertBox = document.getElementById('guess-alert-box');
    const alertText = document.getElementById('guess-alert-text');

    this.socket.emit('submitGuess', { guess }, (res) => {
      if (res && res.success) {
        const form = document.getElementById('guess-form');
        const notice = document.getElementById('guess-submitted-notice');
        if (form) form.classList.add('hidden');
        if (notice) notice.classList.remove('hidden');
        if (alertBox) alertBox.classList.add('hidden');
        this.showToast('Bluff locked in!', 'success');
      } else if (res && res.isTooCloseToReal) {
        if (alertBox && alertText) {
          alertText.textContent = res.error;
          alertBox.classList.remove('hidden');
        }
      } else {
        this.showToast((res && res.error) || 'Failed to submit guess', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // SCREEN 5: VOTING PHASE (WITH BIG SHUFFLE ANIMATION)
  // -------------------------------------------------------------
  renderVotingScreen(roomState) {
    const round = roomState.currentRound;
    if (!round) return;

    const roundKey = `${round.roundNumber || 0}_${round.acronym}`;
    const isNewVoteRound = this.state.lastRenderedVoteRoundKey !== roundKey;

    const acronymNameEl = document.getElementById('vote-acronym-name');
    if (acronymNameEl) acronymNameEl.textContent = round.acronym;

    this.handleTimerTick(roomState.timeLeft, 'vote');

    const isAuthor = round.isAuthor;
    const authorNotice = document.getElementById('author-voting-notice');
    const lockedCard = document.getElementById('vote-locked-card');
    const optionsList = document.getElementById('voting-options-list');
    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);

    // Play card shuffle sound and animate when entering voting phase
    if (!this.state.hasShownVotingShuffle || isNewVoteRound) {
      this.state.hasShownVotingShuffle = true;
      this.state.lastRenderedVoteRoundKey = roundKey;
      if (window.soundEngine) window.soundEngine.playShuffle();
    }

    if (this.state.isTvMode) {
      if (authorNotice) authorNotice.classList.add('hidden');
      if (lockedCard) lockedCard.classList.add('hidden');
    } else {
      if (isAuthor) {
        if (authorNotice) authorNotice.classList.remove('hidden');
        if (lockedCard) lockedCard.classList.add('hidden');
      } else {
        if (authorNotice) authorNotice.classList.add('hidden');
        if (myPlayer && myPlayer.hasVoted) {
          if (lockedCard) lockedCard.classList.remove('hidden');
        } else {
          if (lockedCard) lockedCard.classList.add('hidden');
        }
      }
    }

    if (optionsList && round.options) {
      if (isNewVoteRound || optionsList.children.length === 0) {
        optionsList.innerHTML = '';

        round.options.forEach((opt) => {
          const card = document.createElement('div');
          const isMyBluff = Boolean(opt.isMyBluff);
          const isMyReal = Boolean(opt.isMyRealAnswer);
          const isSelected = this.state.selectedVoteOptionId === opt.id;
          const isDisabled = this.state.isTvMode || isAuthor || isMyBluff || isMyReal || (myPlayer && myPlayer.hasVoted);

          card.className = `vote-option-card shuffle-in ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`;
          card.dataset.optionId = opt.id;

          let badge = '';
          if (isMyReal) {
            badge = '<span class="voc-badge voc-badge-myreal">Your Real Answer</span>';
          } else if (isMyBluff) {
            badge = '<span class="voc-badge voc-badge-mybluff">Your Bluff</span>';
          }

          card.innerHTML = `
            <div class="voc-text">${this.escapeHtml(opt.text)}</div>
            ${badge}
          `;

          if (!isDisabled) {
            card.onclick = () => this.handleOptionVoteClick(opt.id);
          }

          optionsList.appendChild(card);
        });
      } else {
        // Round already rendered: update card classes without wiping or re-animating
        const cards = optionsList.querySelectorAll('.vote-option-card');
        cards.forEach(card => {
          const optId = card.dataset.optionId;
          const opt = round.options.find(o => o.id === optId);
          if (opt) {
            const isMyBluff = Boolean(opt.isMyBluff);
            const isMyReal = Boolean(opt.isMyRealAnswer);
            const isSelected = this.state.selectedVoteOptionId === opt.id;
            const isDisabled = this.state.isTvMode || isAuthor || isMyBluff || isMyReal || (myPlayer && myPlayer.hasVoted);

            if (isDisabled) {
              card.classList.add('disabled');
              card.onclick = null;
            } else {
              card.classList.remove('disabled');
              card.onclick = () => this.handleOptionVoteClick(opt.id);
            }

            if (isSelected) {
              card.classList.add('selected');
            } else {
              card.classList.remove('selected');
            }
          }
        });
      }
    }

    // Live Voting Status Tracker
    const voteListEl = document.getElementById('vote-players-list');
    const voteReadyCountEl = document.getElementById('vote-ready-count');

    const nonAuthorPlayers = roomState.players.filter(p => p.id !== round.submitterId);
    const votedCount = nonAuthorPlayers.filter(p => p.hasVoted).length;
    if (voteReadyCountEl) voteReadyCountEl.textContent = `${votedCount} / ${nonAuthorPlayers.length}`;

    if (voteListEl) {
      voteListEl.innerHTML = '';
      roomState.players.forEach(p => {
        const isThisAuthor = p.id === round.submitterId;
        const chip = document.createElement('div');
        chip.className = `lsc-player-chip ${p.hasVoted ? 'is-ready' : ''} ${isThisAuthor ? 'is-author-chip' : ''}`;

        let statusText = '🗳️ Deciding...';
        if (isThisAuthor) {
          statusText = '👑 AUTHOR (Watching)';
        } else if (p.hasVoted) {
          statusText = '✓ VOTE CAST';
        }

        chip.innerHTML = `
          <span>${p.avatar || '👤'}</span>
          <span>${this.escapeHtml(p.name)}</span>
          <span style="font-weight:800;">${statusText}</span>
        `;
        voteListEl.appendChild(chip);
      });
    }
  }

  handleOptionVoteClick(optionId) {
    if (this.state.selectedVoteOptionId === optionId) return;
    this.state.selectedVoteOptionId = optionId;

    const cards = document.querySelectorAll('.vote-option-card');
    cards.forEach(card => {
      if (card.dataset.optionId === optionId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    this.socket.emit('submitVote', { optionId }, (res) => {
      if (res && res.success) {
        this.showToast('Vote submitted!', 'success');
        const locked = document.getElementById('vote-locked-card');
        if (locked) locked.classList.remove('hidden');
        cards.forEach(c => {
          c.classList.add('disabled');
          c.onclick = null;
        });
      } else {
        this.state.selectedVoteOptionId = null;
        cards.forEach(card => card.classList.remove('selected'));
        this.showToast((res && res.error) || 'Failed to submit vote', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // SCREEN 6: DRAMATIC STEP-BY-STEP REVEAL & ROUND SCORING
  // -------------------------------------------------------------
  renderRevealScreen(roomState) {
    const round = roomState.currentRound;
    if (!round || !round.revealData) return;

    const data = round.revealData;
    const titleEl = document.getElementById('reveal-acronym-title');
    const catEl = document.getElementById('reveal-acronym-category');
    const cardsContainer = document.getElementById('reveal-cards-container');
    const leaderboardList = document.getElementById('reveal-leaderboard-list');
    const hostActions = document.getElementById('reveal-host-actions');
    const nextBtn = document.getElementById('btn-next-round');

    if (titleEl) titleEl.textContent = data.acronym;
    if (catEl) catEl.textContent = data.category || 'General Industry';

    // Play fanfare / sting sequence on new reveal entry
    if (this.state.lastRevealAcronym !== data.acronym) {
      this.state.lastRevealAcronym = data.acronym;
      if (window.soundEngine) {
        setTimeout(() => window.soundEngine.playRealReveal(), 400);
      }
    }

    if (cardsContainer) {
      cardsContainer.innerHTML = '';

      data.options.forEach((opt, idx) => {
        const card = document.createElement('div');
        card.className = `reveal-card ${opt.isReal ? 'is-real revealed-real' : 'is-bluff revealed-bluff'}`;
        card.style.animationDelay = `${idx * 0.15}s`;

        let voterChips = '';
        if (opt.voters && opt.voters.length > 0) {
          voterChips = opt.voters.map(v => {
            const chipClass = opt.isReal ? 'picked-real' : 'fooled';
            return `<span class="rc-voter-chip ${chipClass}">${v.avatar || '👤'} ${this.escapeHtml(v.name)}</span>`;
          }).join('');
        } else {
          voterChips = '<span style="font-size:0.8rem; color:var(--text-muted);">No votes</span>';
        }

        let authorLabel = '';
        let pointsGainBadge = '';

        if (opt.isReal) {
          authorLabel = `Submitted by <span class="rc-author-highlight">${this.escapeHtml(data.submitterName)}</span>`;
          if (opt.voters && opt.voters.length > 0) {
            pointsGainBadge = `<span class="rc-points-pill rc-points-plus">+${roomState.options.pointsForReal || 1000} pts each</span>`;
          }
        } else {
          authorLabel = `Bluff written by <span class="rc-author-highlight">${this.escapeHtml(opt.authorName)}</span>`;
          if (opt.voters && opt.voters.length > 0) {
            const totalBluffPts = opt.voters.length * (roomState.options.pointsForBluff || 500);
            pointsGainBadge = `<span class="rc-points-pill rc-points-plus">+${totalBluffPts} pts</span>`;
          }
        }

        card.innerHTML = `
          <div class="rc-header">
            <div class="rc-text">${this.escapeHtml(opt.text)}</div>
            ${opt.isReal ? '<span class="rc-tag-real">✓ REAL ANSWER</span>' : '<span class="rc-tag-bluff">BLUFF</span>'}
          </div>
          <div class="rc-meta">
            <div class="rc-author-info">${authorLabel}</div>
            ${pointsGainBadge}
          </div>
          <div class="rc-voters-list">
            <span style="font-size:0.8rem; font-weight:700; color:var(--text-secondary);">Voters:</span>
            ${voterChips}
          </div>
        `;

        cardsContainer.appendChild(card);
      });

      // If nobody guessed real, show author bonus
      if (data.earnedAuthorBonus) {
        const bonusCard = document.createElement('div');
        bonusCard.className = 'card';
        bonusCard.style.border = '2px solid var(--accent-gold)';
        bonusCard.style.background = 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, rgba(19,30,50,0.95) 100%)';
        bonusCard.style.padding = '18px 24px';
        bonusCard.style.textAlign = 'center';
        bonusCard.style.marginTop = '12px';
        bonusCard.innerHTML = `
          <div style="font-weight:900; color:var(--accent-gold); font-size:1.15rem; letter-spacing:0.04em;">👑 MASTER OF DECEPTION!</div>
          <div style="font-size:0.95rem; color:var(--text-primary); margin-top:4px;">
            Nobody found the real answer! <b>${this.escapeHtml(data.submitterName)}</b> earns a <b>+${roomState.options.pointsForAuthorBonus || 300} pts</b> Author Bonus!
          </div>
        `;
        cardsContainer.appendChild(bonusCard);
      }
    }

    // Render Round Leaderboard with tie ranking support
    if (leaderboardList && data.leaderboard) {
      leaderboardList.innerHTML = '';
      const rankedRoundPlayers = this.computeRankedPlayers(data.leaderboard);
      rankedRoundPlayers.forEach(p => {
        const item = document.createElement('div');
        item.className = 'rl-item';
        item.innerHTML = `
          <div class="rl-left">
            <span class="rl-rank">${p.rankLabel}</span>
            <span class="rl-avatar">${p.avatar || '👤'}</span>
            <span class="rl-name">${this.escapeHtml(p.name)}</span>
          </div>
          <div class="rl-right">
            ${p.gain > 0 ? `<span class="rl-gain">+${p.gain}</span>` : ''}
            <span class="rl-score">${p.score} pts</span>
          </div>
        `;
        leaderboardList.appendChild(item);
      });
    }

    // Host next button & spectator actions
    if (hostActions) {
      hostActions.classList.remove('hidden');
    }
    const isLastRound = roomState.currentAcronymIndex + 1 >= roomState.totalAcronyms;
    if (nextBtn) {
      nextBtn.textContent = isLastRound ? '🏆 View Final Scoreboard ➔' : 'Next Acronym ➔';
    }
  }

  nextRound() {
    const nextBtn = document.getElementById('btn-next-round');
    if (nextBtn) {
      nextBtn.disabled = true;
      setTimeout(() => { if (nextBtn) nextBtn.disabled = false; }, 1000);
    }
    this.socket.emit('nextRound', {}, (res) => {
      if (nextBtn) nextBtn.disabled = false;
      if (res && !res.success) {
        this.showToast(res.error || 'Failed to advance to next acronym', 'error');
      }
    });
  }

  // Competition ranking helper with tie-support
  computeRankedPlayers(players) {
    if (!players || !Array.isArray(players)) return [];
    const sorted = [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.name || '').localeCompare(b.name || '');
    });

    let currentRank = 1;
    return sorted.map((p, idx) => {
      if (idx > 0 && p.score < sorted[idx - 1].score) {
        currentRank = idx + 1;
      }
      const isTied = (idx > 0 && p.score === sorted[idx - 1].score) ||
                     (idx < sorted.length - 1 && p.score === sorted[idx + 1].score);
      return {
        ...p,
        rank: currentRank,
        isTied: isTied,
        rankLabel: `#${currentRank}`
      };
    });
  }

  // -------------------------------------------------------------
  // SCREEN 7: FINAL SCOREBOARD & 3D PODIUM
  // -------------------------------------------------------------
  renderScoreboardScreen(roomState) {
    if (window.confetti) window.confetti.burst(150);
    if (window.soundEngine) window.soundEngine.playVictory();

    const rankedPlayers = this.computeRankedPlayers(roomState.players);
    const podiumEl = document.getElementById('podium-display');

    if (podiumEl) {
      podiumEl.innerHTML = '';

      let podiumPlayers = rankedPlayers.filter(p => p.rank <= 3);
      if (podiumPlayers.length === 0) podiumPlayers = rankedPlayers.slice(0, 3);

      let displayOrder = [...podiumPlayers];
      if (podiumPlayers.length === 3 && podiumPlayers[0].rank === 1 && podiumPlayers[1].rank === 2 && podiumPlayers[2].rank === 3) {
        displayOrder = [podiumPlayers[1], podiumPlayers[0], podiumPlayers[2]];
      } else if (podiumPlayers.length === 2 && podiumPlayers[0].rank === 1 && podiumPlayers[1].rank === 2) {
        displayOrder = [podiumPlayers[1], podiumPlayers[0]];
      }

      displayOrder.forEach(p => {
        const pillar = document.createElement('div');
        let pillarClass = 'pillar-3rd';
        let pillarBlockText = `${p.rank}`;
        let crown = '';

        if (p.rank === 1) {
          pillarClass = 'pillar-1st';
          crown = '<div class="crown-icon">👑</div>';
        } else if (p.rank === 2) {
          pillarClass = 'pillar-2nd';
        }

        pillar.className = `podium-pillar ${pillarClass}`;
        pillar.innerHTML = `
          ${crown}
          <div class="podium-avatar">${p.avatar || '👤'}</div>
          <div class="podium-name" title="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</div>
          <div class="podium-score">${p.score} pts</div>
          <div class="pillar-block">${pillarBlockText}</div>
        `;
        podiumEl.appendChild(pillar);
      });
    }

    const finalList = document.getElementById('final-rankings-list');
    if (finalList) {
      finalList.innerHTML = '';
      rankedPlayers.forEach(p => {
        const item = document.createElement('div');
        item.className = 'rl-item';
        item.innerHTML = `
          <div class="rl-left">
            <span class="rl-rank">${p.rankLabel}</span>
            <span class="rl-avatar">${p.avatar || '👤'}</span>
            <span class="rl-name">${this.escapeHtml(p.name)}</span>
          </div>
          <div class="rl-right">
            <span class="rl-score">${p.score} pts</span>
          </div>
        `;
        finalList.appendChild(item);
      });
    }

    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.style.display = this.state.isHost ? 'block' : 'none';
    }
  }

  playAgain() {
    const btn = document.getElementById('btn-play-again');
    if (btn) {
      btn.disabled = true;
      setTimeout(() => { if (btn) btn.disabled = false; }, 1000);
    }
    this.socket.emit('playAgain', {}, (res) => {
      if (btn) btn.disabled = false;
      if (res && !res.success) {
        this.showToast(res.error || 'Failed to restart game', 'error');
      }
    });
  }

  leaveRoom() {
    this.clearSession();
    window.location.href = window.location.pathname;
  }

  showHome() {
    if (this.state.roomCode) {
      if (confirm('Leave current room and return to home?')) {
        this.leaveRoom();
      }
    }
  }

  // -------------------------------------------------------------
  // TIMER TICK HANDLER
  // -------------------------------------------------------------
  handleTimerTick(timeLeft, phase = null) {
    if (this.state.roomData) {
      this.state.roomData.timeLeft = timeLeft;
    }

    const phases = phase ? [phase] : ['guess', 'vote'];
    phases.forEach(p => {
      const badge = document.getElementById(`${p}-timer-badge`);
      const valEl = document.getElementById(`${p}-timer-val`);
      const unitEl = document.getElementById(`${p}-timer-unit`);

      const optLimit = p === 'guess'
        ? (this.state.roomData && this.state.roomData.options && this.state.roomData.options.guessTimeLimit)
        : (this.state.roomData && this.state.roomData.options && this.state.roomData.options.voteTimeLimit);

      const isInfinite = optLimit === 0 || optLimit === '0';

      if (valEl) {
        valEl.textContent = isInfinite ? '∞' : (timeLeft > 0 ? timeLeft : '0');
      }

      if (unitEl) {
        unitEl.textContent = isInfinite ? '' : 's';
      }

      if (badge) {
        if (isInfinite) {
          badge.classList.remove('urgent');
          badge.title = 'No Time Limit';
        } else if (timeLeft <= 5 && timeLeft > 0) {
          badge.classList.add('urgent');
          badge.title = 'Hurry up!';
        } else {
          badge.classList.remove('urgent');
          badge.title = 'Time Remaining';
        }
      }
    });

    const guessLimit = this.state.roomData && this.state.roomData.options && this.state.roomData.options.guessTimeLimit;
    const voteLimit = this.state.roomData && this.state.roomData.options && this.state.roomData.options.voteTimeLimit;
    const currentPhaseLimit = phase === 'guess' ? guessLimit : (phase === 'vote' ? voteLimit : null);
    const isCurrentInfinite = currentPhaseLimit === 0 || currentPhaseLimit === '0';

    if (!isCurrentInfinite && timeLeft <= 5 && timeLeft > 0) {
      if (window.soundEngine) window.soundEngine.playTick(true);
    } else if (!isCurrentInfinite && window.soundEngine && timeLeft > 0 && timeLeft <= 10) {
      window.soundEngine.playTick(false);
    }
  }

  // -------------------------------------------------------------
  // MODALS: QR CODE & PRESETS
  // -------------------------------------------------------------
  openQRModal() {
    if (!this.state.roomCode) return;

    const modal = document.getElementById('modal-qr');
    const qrImg = document.getElementById('qr-image');
    const roomBadge = document.getElementById('modal-room-code');
    const shareInput = document.getElementById('modal-share-url');

    const joinUrl = `${window.location.origin}${window.location.pathname}?room=${this.state.roomCode}`;

    if (roomBadge) roomBadge.textContent = this.state.roomCode;
    if (shareInput) shareInput.value = joinUrl;

    if (qrImg) {
      fetch(`/api/qr?url=${encodeURIComponent(joinUrl)}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.qr) qrImg.src = data.qr;
        })
        .catch(console.error);
    }

    if (modal) modal.classList.add('active');
  }

  closeQRModal() {
    const modal = document.getElementById('modal-qr');
    if (modal) modal.classList.remove('active');
  }

  copyModalShareUrl() {
    const shareInput = document.getElementById('modal-share-url');
    if (shareInput) {
      shareInput.select();
      navigator.clipboard.writeText(shareInput.value).then(() => {
        this.showToast('Room link copied!', 'success');
      });
    }
  }

  openIdeaModal() {
    this.state.activeIdeaCardIndex = null;
    this.renderIdeaModal();
    const modal = document.getElementById('modal-ideas');
    if (modal) modal.classList.add('active');
  }

  openIdeaModalForCard(cardIndex) {
    this.state.activeIdeaCardIndex = cardIndex;
    this.renderIdeaModal();
    const modal = document.getElementById('modal-ideas');
    if (modal) modal.classList.add('active');
  }

  closeIdeaModal() {
    const modal = document.getElementById('modal-ideas');
    if (modal) modal.classList.remove('active');
  }

  renderIdeaModal() {
    const pillsContainer = document.getElementById('idea-category-pills');
    const listContainer = document.getElementById('presets-list');

    const categories = ['ALL', 'Tech & Software', 'Finance & Business', 'Healthcare & Medicine', 'Marketing & Ads', 'Aviation & Military', 'Gaming'];

    if (pillsContainer) {
      pillsContainer.innerHTML = '';
      categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `idea-filter-btn ${cat === this.state.activeCategoryFilter ? 'active' : ''}`;
        btn.textContent = cat;
        btn.onclick = () => {
          this.state.activeCategoryFilter = cat;
          this.renderIdeaModal();
        };
        pillsContainer.appendChild(btn);
      });
    }

    if (listContainer) {
      listContainer.innerHTML = '';
      const presets = (typeof ACRONYM_PRESETS !== 'undefined' ? ACRONYM_PRESETS : []);
      const filtered = this.state.activeCategoryFilter === 'ALL'
        ? presets
        : presets.filter(p => p.category.includes(this.state.activeCategoryFilter.split(' ')[0]));

      filtered.forEach(item => {
        const el = document.createElement('div');
        el.className = 'preset-item';
        el.innerHTML = `
          <div class="pi-left">
            <span class="pi-acronym">${item.acronym}</span>
            <span class="pi-def">${item.definition}</span>
            <span class="pi-cat">${item.category}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm">Use ➔</button>
        `;
        el.onclick = () => this.usePresetAcronym(item);
        listContainer.appendChild(el);
      });
    }
  }

  usePresetAcronym(preset) {
    const targetIdx = this.state.activeIdeaCardIndex !== null ? this.state.activeIdeaCardIndex : 0;

    const acroEl = document.getElementById(`sub-acronym-${targetIdx}`);
    const defEl = document.getElementById(`sub-def-${targetIdx}`);
    const catEl = document.getElementById(`sub-cat-${targetIdx}`);

    if (acroEl) acroEl.value = preset.acronym.toUpperCase();
    if (defEl) defEl.value = preset.definition.toUpperCase();
    if (catEl) catEl.value = preset.category;

    this.closeIdeaModal();
    this.showToast(`Loaded ${preset.acronym}!`, 'success');
  }

  closeModalOnBackdrop(e, modalId) {
    if (e.target && e.target.id === modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    }
  }

  // -------------------------------------------------------------
  // TOAST NOTIFICATIONS & UTILS
  // -------------------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate and initialize
window.app = new AcronymGameApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
