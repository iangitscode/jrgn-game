// Main Frontend Application Logic
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
      currentScreen: 'screen-welcome',
      roomData: null,
      activeIdeaCardIndex: null,
      selectedVoteOptionId: null,
      activeCategoryFilter: 'ALL',
      lastRenderedAcronym: null
    };

    this.avatars = ['🚀', '💡', '👾', '🔬', '🎯', '⚡', '🦊', '🍕', '🎩', '🦄', '💎', '🎲'];
  }

  init() {
    this.initSocket();
    this.renderAvatarGrid();
    this.initUrlParams();
    this.checkSavedSession();
  }

  // Socket setup
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
      if (saved && saved.roomCode && saved.playerId && saved.sessionToken && this.state.roomCode) {
        this.executeRejoin(true);
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

  // Session persistence in localStorage
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
    if (saved && saved.roomCode && saved.sessionToken) {
      const banner = document.getElementById('reconnect-banner');
      const recCode = document.getElementById('rec-room-code');
      const recName = document.getElementById('rec-player-name');
      if (banner && recCode && recName) {
        recCode.textContent = saved.roomCode;
        recName.textContent = saved.playerName || 'Player';
        banner.classList.remove('hidden');
      }

      // Pre-fill nickname
      if (saved.playerName) {
        const nameInput = document.getElementById('player-name');
        if (nameInput) nameInput.value = saved.playerName;
      }
      if (saved.avatar) {
        this.selectAvatar(saved.avatar);
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

  // URL parameters (e.g. ?room=ABCD)
  initUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const codeInput = document.getElementById('room-code-input');
      if (codeInput) {
        codeInput.value = roomParam.trim().toUpperCase();
      }
      this.switchWelcomeTab('join');
    }
  }

  // Render Avatar Grid
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

  // Welcome tab switcher: join vs create
  switchWelcomeTab(mode) {
    const tabJoin = document.getElementById('tab-join');
    const tabCreate = document.getElementById('tab-create');
    const groupRoomCode = document.getElementById('group-room-code');
    const btnText = document.getElementById('btn-welcome-text');
    const roomCodeInput = document.getElementById('room-code-input');

    if (mode === 'join') {
      tabJoin.classList.add('active');
      tabCreate.classList.remove('active');
      groupRoomCode.classList.remove('hidden');
      btnText.textContent = 'Join Room';
      if (roomCodeInput) roomCodeInput.setAttribute('required', 'true');
    } else {
      tabCreate.classList.add('active');
      tabJoin.classList.remove('active');
      groupRoomCode.classList.add('hidden');
      btnText.textContent = 'Create Room';
      if (roomCodeInput) roomCodeInput.removeAttribute('required');
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

  getSegmentVal(containerId, defaultVal = 2) {
    const container = document.getElementById(containerId);
    if (!container) return defaultVal;
    const active = container.querySelector('.segment-btn.active');
    return active ? parseInt(active.getAttribute('data-val'), 10) : defaultVal;
  }

  // Handle Welcome Submit (Create or Join)
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

          this.saveSession({
            roomCode: res.roomCode,
            playerId: res.playerId,
            sessionToken: res.sessionToken,
            playerName,
            avatar: this.state.avatar
          });

          this.updateHeaderRoomPill(res.roomCode);
          this.handleRoomStateUpdate(res.roomState);
          this.showToast(`Joined Room ${res.roomCode}!`, 'success');
        } else {
          this.showToast((res && res.error) || 'Failed to join room', 'error');
        }
      });
    } else {
      // Create Room (default 2 words per player, customizable in lobby)
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

          this.saveSession({
            roomCode: res.roomCode,
            playerId: res.playerId,
            sessionToken: res.sessionToken,
            playerName,
            avatar: this.state.avatar
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

  // Switch Active Screen
  setScreen(screenId) {
    this.state.currentScreen = screenId;
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Master State Machine Handler
  handleRoomStateUpdate(roomState) {
    if (!roomState) return;
    this.state.roomData = roomState;
    this.state.isHost = roomState.hostPlayerId === this.state.playerId;

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

  // Update Header Room Pill
  updateHeaderRoomPill(roomCode) {
    const pill = document.getElementById('header-room-pill');
    const codeEl = document.getElementById('header-room-code');
    if (pill && codeEl && roomCode) {
      codeEl.textContent = roomCode;
      pill.classList.remove('hidden');
    }
  }

  // -------------------------------------------------------------
  // SCREEN 2: LOBBY
  // -------------------------------------------------------------
  renderLobbyScreen(roomState) {
    const codeEl = document.getElementById('lobby-room-code');
    const countEl = document.getElementById('lobby-player-count');
    const rosterGrid = document.getElementById('lobby-roster-grid');
    const hostBotBtn = document.getElementById('host-bot-btn-container');
    const hostStartContainer = document.getElementById('host-start-container');
    const waitingNotice = document.getElementById('waiting-host-notice');
    const hostControls = document.querySelectorAll('.host-control');

    if (codeEl) codeEl.textContent = roomState.roomCode;
    if (countEl) countEl.textContent = roomState.players.length;

    // Render roster
    if (rosterGrid) {
      rosterGrid.innerHTML = '';
      roomState.players.forEach(p => {
        const card = document.createElement('div');
        const isMe = p.id === this.state.playerId;
        card.className = `player-badge-card ${isMe ? 'is-me' : ''} ${p.isBot ? 'is-bot' : ''}`;

        let roleTag = '';
        if (p.isHost) {
          roleTag = '<span class="pbc-role-tag pbc-role-host">HOST</span>';
        } else if (p.isBot) {
          roleTag = '<span class="pbc-role-tag pbc-role-bot">AI BOT</span>';
        } else {
          roleTag = '<span class="pbc-role-tag pbc-role-player">PLAYER</span>';
        }

        let removeBtn = '';
        if (this.state.isHost && !p.isHost) {
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

      // Enable/disable start button based on player count
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
      this.setSegmentVal('opt-words-control', roomState.options.wordsPerPlayer || 2);
      this.setSegmentVal('opt-guess-time-control', roomState.options.guessTimeLimit || 45);
      this.setSegmentVal('opt-vote-time-control', roomState.options.voteTimeLimit || 30);
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
  // SCREEN 3: SUBMISSION PHASE
  // -------------------------------------------------------------
  renderSubmissionsScreen(roomState) {
    const wordsCount = (roomState.options && roomState.options.wordsPerPlayer) || 2;
    const label = document.getElementById('submit-words-count-label');
    if (label) label.textContent = wordsCount;

    const cardsList = document.getElementById('submission-cards-list');
    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);

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
            <input type="text" class="form-input sub-acronym-input" id="sub-acronym-${i}" placeholder="e.g. EBITDA, CRUD, STAT" maxlength="12" required>
          </div>
          <div class="form-group">
            <label class="form-label">Real Definition (The Truth)</label>
            <input type="text" class="form-input sub-def-input" id="sub-def-${i}" placeholder="e.g. Create, Read, Update, Delete" maxlength="120" required>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Industry / Field</label>
            <input type="text" class="form-input sub-cat-input" id="sub-cat-${i}" placeholder="e.g. Tech, Healthcare, Finance, Aviation" maxlength="30" value="Tech & Software">
          </div>
        `;
        cardsList.appendChild(card);
      }
    }

    // Submission button state
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

    // Render live player list status
    const playersListEl = document.getElementById('submission-players-list');
    if (playersListEl) {
      playersListEl.innerHTML = '';
      roomState.players.forEach(p => {
        const chip = document.createElement('div');
        chip.className = `lsc-player-chip ${p.hasSubmittedWords ? 'is-ready' : ''}`;
        chip.innerHTML = `
          <span>${p.avatar || '👤'}</span>
          <span>${this.escapeHtml(p.name)}</span>
          <span>${p.hasSubmittedWords ? '✓' : '...'}</span>
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
      const definition = defEl ? defEl.value.trim() : '';
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
  // SCREEN 4: GUESSING / BLUFFING PHASE
  // -------------------------------------------------------------
  renderGuessingScreen(roomState) {
    const round = roomState.currentRound;
    if (!round) return;

    // Reset vote selection state
    this.state.selectedVoteOptionId = null;

    // Check if this is a new acronym round compared to what was previously shown
    const isNewRound = this.state.lastRenderedAcronym !== round.acronym;
    this.state.lastRenderedAcronym = round.acronym;

    // Update Round Headers
    const roundNumEl = document.getElementById('guess-round-num');
    const totalRoundsEl = document.getElementById('guess-total-rounds');
    const acroTextEl = document.getElementById('guess-acronym-text');
    const categoryEl = document.getElementById('guess-acronym-category');
    const submitterEl = document.getElementById('guess-acronym-submitter');

    if (roundNumEl) roundNumEl.textContent = round.roundNumber;
    if (totalRoundsEl) totalRoundsEl.textContent = round.totalRounds;
    if (acroTextEl) acroTextEl.textContent = round.acronym;
    if (categoryEl) categoryEl.textContent = round.category || 'General Industry';
    if (submitterEl) submitterEl.textContent = `Submitted by ${round.submitterName}`;

    // Timer display
    this.handleTimerTick(roomState.timeLeft, 'guess');

    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);
    const isAuthor = round.isAuthor;

    const actionCard = document.getElementById('guess-player-action-card');
    const authorCard = document.getElementById('guess-author-vip-card');
    const form = document.getElementById('guess-form');
    const alertBox = document.getElementById('guess-alert-box');
    const submittedNotice = document.getElementById('guess-submitted-notice');
    const guessInput = document.getElementById('guess-input');

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

      // Clear previous bluff whenever a new round starts or when player hasn't guessed yet
      if (isNewRound || (myPlayer && !myPlayer.hasGuessed)) {
        if (guessInput && (!myPlayer || !myPlayer.hasGuessed)) {
          guessInput.value = '';
        }
        if (alertBox) alertBox.classList.add('hidden');
      }

      if (myPlayer && myPlayer.hasGuessed) {
        if (form) form.classList.add('hidden');
        if (submittedNotice) submittedNotice.classList.remove('hidden');
      } else {
        if (form) form.classList.remove('hidden');
        if (submittedNotice) submittedNotice.classList.add('hidden');
      }
    }

    // Render live player list status
    const guessListEl = document.getElementById('guess-players-list');
    if (guessListEl) {
      guessListEl.innerHTML = '';
      roomState.players.forEach(p => {
        if (p.id === round.submitterId) return; // Author sits out
        const chip = document.createElement('div');
        chip.className = `lsc-player-chip ${p.hasGuessed ? 'is-ready' : ''}`;
        chip.innerHTML = `
          <span>${p.avatar || '👤'}</span>
          <span>${this.escapeHtml(p.name)}</span>
          <span>${p.hasGuessed ? '✓' : '...'}</span>
        `;
        guessListEl.appendChild(chip);
      });
    }
  }

  handleGuessSubmit(e) {
    e.preventDefault();

    const input = document.getElementById('guess-input');
    const guess = input ? input.value.trim() : '';

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
  // SCREEN 5: VOTING PHASE
  // -------------------------------------------------------------
  renderVotingScreen(roomState) {
    const round = roomState.currentRound;
    if (!round) return;

    const acronymNameEl = document.getElementById('vote-acronym-name');
    if (acronymNameEl) acronymNameEl.textContent = round.acronym;

    this.handleTimerTick(roomState.timeLeft, 'vote');

    const isAuthor = round.isAuthor;
    const authorNotice = document.getElementById('author-voting-notice');
    const lockedCard = document.getElementById('vote-locked-card');
    const optionsList = document.getElementById('voting-options-list');
    const myPlayer = roomState.players.find(p => p.id === this.state.playerId);

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

    if (optionsList && round.options) {
      optionsList.innerHTML = '';

      round.options.forEach(opt => {
        const card = document.createElement('div');
        const isMyBluff = Boolean(opt.isMyBluff);
        const isMyReal = Boolean(opt.isMyRealAnswer);
        const isSelected = this.state.selectedVoteOptionId === opt.id;
        const isDisabled = isAuthor || isMyBluff || isMyReal || (myPlayer && myPlayer.hasVoted);

        card.className = `vote-option-card ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`;
        
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
    }
  }

  handleOptionVoteClick(optionId) {
    if (this.state.selectedVoteOptionId === optionId) return;
    this.state.selectedVoteOptionId = optionId;

    // Re-render voting cards to show selected state
    const cards = document.querySelectorAll('.vote-option-card');
    cards.forEach(card => card.classList.remove('selected'));

    this.socket.emit('submitVote', { optionId }, (res) => {
      if (res && res.success) {
        this.showToast('Vote submitted!', 'success');
        const locked = document.getElementById('vote-locked-card');
        if (locked) locked.classList.remove('hidden');
      } else {
        this.showToast((res && res.error) || 'Failed to submit vote', 'error');
      }
    });
  }

  // -------------------------------------------------------------
  // SCREEN 6: REVEAL PHASE
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

    if (cardsContainer) {
      cardsContainer.innerHTML = '';

      data.options.forEach(opt => {
        const card = document.createElement('div');
        card.className = `reveal-card ${opt.isReal ? 'is-real' : 'is-bluff'}`;

        let voterChips = '';
        if (opt.voters && opt.voters.length > 0) {
          voterChips = opt.voters.map(v => {
            const chipClass = opt.isReal ? 'picked-real' : 'fooled';
            return `<span class="rc-voter-chip ${chipClass}">${v.avatar || '👤'} ${this.escapeHtml(v.name)}</span>`;
          }).join('');
        } else {
          voterChips = '<span style="font-size:0.75rem; color:var(--text-muted);">No votes</span>';
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
            <span style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">Voters:</span>
            ${voterChips}
          </div>
        `;

        cardsContainer.appendChild(card);
      });

      // If nobody guessed real, show author bonus
      if (data.earnedAuthorBonus) {
        const bonusCard = document.createElement('div');
        bonusCard.className = 'card';
        bonusCard.style.border = '1px solid var(--accent-gold)';
        bonusCard.style.background = 'var(--accent-gold-light)';
        bonusCard.style.padding = '14px 18px';
        bonusCard.style.textAlign = 'center';
        bonusCard.innerHTML = `
          <div style="font-weight:800; color:var(--accent-gold); font-size:0.95rem;">👑 MASTER OF DECEPTION!</div>
          <div style="font-size:0.85rem; color:var(--text-primary); margin-top:2px;">
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

    // Host next button
    if (this.state.isHost) {
      if (hostActions) hostActions.classList.remove('hidden');
      const isLastRound = roomState.currentAcronymIndex + 1 >= roomState.totalAcronyms;
      if (nextBtn) {
        nextBtn.textContent = isLastRound ? '🏆 View Final Scoreboard' : 'Next Acronym ➔';
      }
    } else {
      if (hostActions) hostActions.classList.add('hidden');
    }
  }

  nextRound() {
    if (!this.state.isHost) return;
    this.socket.emit('nextRound', {});
  }

  // Helper to compute standard competition ranking (with tie support)
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
        rankLabel: isTied ? `T-#${currentRank}` : `#${currentRank}`
      };
    });
  }

  // -------------------------------------------------------------
  // SCREEN 7: FINAL SCOREBOARD & PODIUM
  // -------------------------------------------------------------
  renderScoreboardScreen(roomState) {
    window.confetti.burst(120);

    const rankedPlayers = this.computeRankedPlayers(roomState.players);
    const podiumEl = document.getElementById('podium-display');

    if (podiumEl) {
      podiumEl.innerHTML = '';

      // Get players eligible for podium (rank <= 3)
      let podiumPlayers = rankedPlayers.filter(p => p.rank <= 3);
      if (podiumPlayers.length === 0) podiumPlayers = rankedPlayers.slice(0, 3);

      // Reorder for traditional center-peak podium if exactly 1st, 2nd, 3rd exist with no 1st-place tie
      let displayOrder = [...podiumPlayers];
      if (podiumPlayers.length === 3 && podiumPlayers[0].rank === 1 && podiumPlayers[1].rank === 2 && podiumPlayers[2].rank === 3) {
        displayOrder = [podiumPlayers[1], podiumPlayers[0], podiumPlayers[2]];
      } else if (podiumPlayers.length === 2 && podiumPlayers[0].rank === 1 && podiumPlayers[1].rank === 2) {
        displayOrder = [podiumPlayers[1], podiumPlayers[0]];
      }

      displayOrder.forEach(p => {
        const pillar = document.createElement('div');
        let pillarClass = 'pillar-3rd';
        let pillarBlockText = p.isTied ? `T-${p.rank}` : `${p.rank}`;
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

    // Full leaderboard list with tie badges
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

    // Play again buttons
    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.style.display = this.state.isHost ? 'block' : 'none';
    }
  }

  playAgain() {
    if (!this.state.isHost) return;
    this.socket.emit('playAgain', {});
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
  handleTimerTick(timeLeft, phase = 'guess') {
    const badge = document.getElementById(`${phase}-timer-badge`);
    const valEl = document.getElementById(`${phase}-timer-val`);

    if (valEl) {
      valEl.textContent = timeLeft > 0 ? timeLeft : '0';
    }

    if (badge) {
      if (timeLeft <= 5 && timeLeft > 0) {
        badge.classList.add('urgent');
      } else {
        badge.classList.remove('urgent');
      }
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

  // IDEA MODAL
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

    if (acroEl) acroEl.value = preset.acronym;
    if (defEl) defEl.value = preset.definition;
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
