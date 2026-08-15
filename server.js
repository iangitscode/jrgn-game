const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { ACRONYM_PRESETS } = require('./presets');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/tv', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory room store
const rooms = new Map();

// Helper to generate 4-letter room codes
function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous letters like I, O
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

// Helper to sanitize player name
function sanitize(str, max = 24) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().substring(0, max);
}

// Bot names & avatars
const BOT_PROFILES = [
  { name: 'ByteBot', avatar: '🤖' },
  { name: 'Dr. Acro', avatar: '🔬' },
  { name: 'PixelPete', avatar: '👾' },
  { name: 'Captain Code', avatar: '⚡' },
  { name: 'Nova', avatar: '✨' },
  { name: 'QuizWizard', avatar: '🧙' }
];

// Helper to create a new room object
function createRoomState(roomCode, hostPlayer = null) {
  const players = {};
  if (hostPlayer) {
    players[hostPlayer.id] = hostPlayer;
  }

  return {
    roomCode,
    hostPlayerId: hostPlayer ? hostPlayer.id : null,
    hasTvHost: !hostPlayer,
    status: 'LOBBY', // 'LOBBY' | 'SUBMITTING' | 'GUESSING' | 'VOTING' | 'REVEAL' | 'SCOREBOARD'
    createdAt: Date.now(),
    options: {
      wordsPerPlayer: 2,
      guessTimeLimit: 45, // seconds (0 = unlimited)
      voteTimeLimit: 30,  // seconds (0 = unlimited)
      pointsForReal: 1000,
      pointsForBluff: 500,
      pointsForAuthorBonus: 300
    },
    players,
    acronymDeck: [],
    currentAcronymIndex: 0,
    currentRound: null,
    timerInterval: null,
    timeLeft: 0,
    history: []
  };
}

// Get safe room state for public broadcast (stripping secret tokens and unrevealed real answers)
function getSafeRoomState(room, targetPlayerId = null) {
  if (!room) return null;

  const playerList = Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isHost: Boolean(room.hostPlayerId && p.id === room.hostPlayerId),
    isBot: Boolean(p.isBot),
    score: p.score || 0,
    roundScoreGain: p.roundScoreGain || 0,
    connected: Boolean(p.connected),
    hasSubmittedWords: Boolean(p.hasSubmittedWords),
    submissionCount: p.submissions ? p.submissions.length : 0,
    hasGuessed: Boolean(p.hasGuessed),
    hasVoted: Boolean(p.hasVoted)
  }));

  // Build safe round data
  let safeRound = null;
  if (room.currentRound) {
    const isAuthor = Boolean(targetPlayerId && targetPlayerId === room.currentRound.submitterId);
    const isRevealOrScoreboard = room.status === 'REVEAL' || room.status === 'SCOREBOARD';

    safeRound = {
      roundNumber: room.currentAcronymIndex + 1,
      totalRounds: room.acronymDeck.length,
      acronym: room.currentRound.acronym,
      category: room.currentRound.category || 'General Industry',
      submitterId: room.currentRound.submitterId,
      submitterName: room.currentRound.submitterName,
      isAuthor: isAuthor,
      options: isRevealOrScoreboard
        ? room.currentRound.options
        : (room.currentRound.options || []).map(opt => ({
            id: opt.id,
            text: opt.text,
            isMyBluff: Boolean(targetPlayerId && opt.authorId === targetPlayerId && !opt.isReal),
            isMyRealAnswer: Boolean(targetPlayerId && opt.authorId === targetPlayerId && opt.isReal)
          })),
      revealData: isRevealOrScoreboard ? room.currentRound.revealData : null,
      votesSummary: isRevealOrScoreboard ? room.currentRound.votes : null
    };

    if (isAuthor || isRevealOrScoreboard) {
      safeRound.realDefinition = room.currentRound.realDefinition;
    }
  }

  return {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    hasTvHost: Boolean(room.hasTvHost),
    status: room.status,
    options: room.options,
    players: playerList,
    currentAcronymIndex: room.currentAcronymIndex,
    totalAcronyms: room.acronymDeck.length,
    currentRound: safeRound,
    timeLeft: room.timeLeft,
    timerActive: Boolean(room.timerInterval)
  };
}

// Broadcast room state to all sockets in room (tailored for each player, or neutral for TV display)
function broadcastRoomState(room) {
  if (!room) return;
  const sockets = io.sockets.adapter.rooms.get(room.roomCode);
  if (!sockets) return;

  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data) {
      if (socket.data.isTvDisplay || !socket.data.playerId) {
        const safeState = getSafeRoomState(room, null);
        socket.emit('roomStateUpdate', safeState);
      } else if (socket.data.playerId) {
        const safeState = getSafeRoomState(room, socket.data.playerId);
        socket.emit('roomStateUpdate', safeState);
      }
    }
  }
}

// Room timer helpers
function clearRoomTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startRoomTimer(room, durationSeconds, onExpire) {
  clearRoomTimer(room);
  if (!durationSeconds || durationSeconds <= 0) {
    room.timeLeft = 0;
    broadcastRoomState(room);
    return;
  }

  room.timeLeft = durationSeconds;
  broadcastRoomState(room);

  room.timerInterval = setInterval(() => {
    room.timeLeft -= 1;
    io.to(room.roomCode).emit('timerTick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearRoomTimer(room);
      if (typeof onExpire === 'function') {
        onExpire();
      }
    }
  }, 1000);
}

// Bot auto-submission in SUBMITTING phase
function handleBotSubmissions(room) {
  const bots = Object.values(room.players).filter(p => p.isBot && !p.hasSubmittedWords);
  if (bots.length === 0) return;

  const countNeeded = room.options.wordsPerPlayer || 2;
  const availablePresets = [...ACRONYM_PRESETS].sort(() => 0.5 - Math.random());

  bots.forEach((bot, index) => {
    setTimeout(() => {
      if (room.status !== 'SUBMITTING') return;
      const botSubmissions = [];
      for (let i = 0; i < countNeeded; i++) {
        const preset = availablePresets[(index * countNeeded + i) % availablePresets.length];
        botSubmissions.push({
          acronym: preset.acronym,
          definition: preset.definition,
          category: preset.category
        });
      }
      bot.submissions = botSubmissions;
      bot.hasSubmittedWords = true;
      broadcastRoomState(room);
      checkAllSubmissionsComplete(room);
    }, 1000 + index * 600);
  });
}

// Check if all players finished submitting words
function checkAllSubmissionsComplete(room) {
  if (room.status !== 'SUBMITTING') return;
  const allActivePlayers = Object.values(room.players).filter(p => p.connected || p.isBot);
  const allSubmitted = allActivePlayers.every(p => p.hasSubmittedWords);

  if (allSubmitted && allActivePlayers.length > 0) {
    startNextAcronymRound(room);
  }
}

// Start the next acronym round
function startNextAcronymRound(room) {
  clearRoomTimer(room);

  // If we haven't built the deck yet, build and shuffle it
  if (room.status === 'SUBMITTING' || room.acronymDeck.length === 0) {
    const deck = [];
    Object.values(room.players).forEach(player => {
      if (player.submissions && player.submissions.length > 0) {
        player.submissions.forEach(sub => {
          deck.push({
            id: `acro_${crypto.randomUUID().slice(0, 8)}`,
            acronym: sub.acronym.trim().toUpperCase(),
            realDefinition: sub.definition.trim(),
            category: sub.category || 'General',
            submitterId: player.id,
            submitterName: player.name
          });
        });
      }
    });

    // Shuffle deck
    room.acronymDeck = deck.sort(() => 0.5 - Math.random());
    room.currentAcronymIndex = 0;
  } else {
    room.currentAcronymIndex += 1;
  }

  // Check if we reached the end of the deck
  if (room.currentAcronymIndex >= room.acronymDeck.length || room.acronymDeck.length === 0) {
    endGameScoreboard(room);
    return;
  }

  const currentAcronymItem = room.acronymDeck[room.currentAcronymIndex];

  // Reset player round flags
  Object.values(room.players).forEach(p => {
    p.currentGuess = '';
    p.hasGuessed = false;
    p.currentVote = null;
    p.hasVoted = false;
    p.roundScoreGain = 0;
  });

  room.status = 'GUESSING';
  room.currentRound = {
    acronymId: currentAcronymItem.id,
    acronym: currentAcronymItem.acronym,
    realDefinition: currentAcronymItem.realDefinition,
    category: currentAcronymItem.category,
    submitterId: currentAcronymItem.submitterId,
    submitterName: currentAcronymItem.submitterName,
    options: [],
    votes: {},
    revealData: null
  };

  // Start guess timer
  startRoomTimer(room, room.options.guessTimeLimit, () => {
    transitionToVoting(room);
  });

  broadcastRoomState(room);

  // Trigger bots to guess if they are not the author
  handleBotGuesses(room);
}

// Bot auto-guessing
function handleBotGuesses(room) {
  if (!room.currentRound) return;
  const currentAcronym = room.currentRound.acronym;
  const preset = ACRONYM_PRESETS.find(p => p.acronym.toUpperCase() === currentAcronym.toUpperCase());

  const botsToGuess = Object.values(room.players).filter(
    p => p.isBot && p.id !== room.currentRound.submitterId && !p.hasGuessed
  );

  botsToGuess.forEach((bot, index) => {
    setTimeout(() => {
      if (room.status !== 'GUESSING') return;

      let guessText = '';
      if (preset && preset.fakeGuesses && preset.fakeGuesses.length > index) {
        guessText = preset.fakeGuesses[index % preset.fakeGuesses.length];
      } else {
        // Generate pseudo-acronym expansion based on letters
        const letters = currentAcronym.split('');
        const dummyWords = {
          A: ['Advanced', 'Automated', 'Applied', 'Analytical'],
          B: ['Binary', 'Broadband', 'Business', 'Basic'],
          C: ['Central', 'Core', 'Cyber', 'Common'],
          D: ['Digital', 'Dynamic', 'Direct', 'Data'],
          E: ['Enterprise', 'Electronic', 'Enhanced', 'Extended'],
          F: ['Fast', 'Flexible', 'Functional', 'Future'],
          G: ['Global', 'General', 'Graph', 'Grid'],
          H: ['High', 'Host', 'Hybrid', 'Heuristic'],
          I: ['Interactive', 'Integrated', 'Internal', 'Intelligent'],
          J: ['Joint', 'Java', 'Justified', 'Jurisdiction'],
          K: ['Key', 'Knowledge', 'Kinetic', 'Kernel'],
          L: ['Logical', 'Local', 'Linked', 'Live'],
          M: ['Modular', 'Mainframe', 'Managed', 'Meta'],
          N: ['Network', 'Native', 'Numeric', 'Neutral'],
          O: ['Online', 'Open', 'Operational', 'Optimal'],
          P: ['Protocol', 'Platform', 'Process', 'Primary'],
          Q: ['Quantum', 'Query', 'Quick', 'Qualified'],
          R: ['Remote', 'Rapid', 'Reliable', 'Resource'],
          S: ['System', 'Standard', 'Secure', 'Synchronous'],
          T: ['Technical', 'Transfer', 'Terminal', 'Tactical'],
          U: ['Unified', 'Universal', 'User', 'Ultimate'],
          V: ['Virtual', 'Vector', 'Verified', 'Visual'],
          W: ['Web', 'Wireless', 'Wide', 'Working'],
          X: ['Cross', 'Extended', 'External', 'XML'],
          Y: ['Yield', 'Yearly', 'Yielding'],
          Z: ['Zone', 'Zero', 'Zenith']
        };

        const words = letters.map(char => {
          const arr = dummyWords[char.toUpperCase()] || ['System', 'Service', 'Standard'];
          return arr[Math.floor(Math.random() * arr.length)];
        });
        guessText = words.join(' ');
      }

      bot.currentGuess = guessText;
      bot.hasGuessed = true;
      broadcastRoomState(room);
      checkAllGuessesComplete(room);
    }, 1500 + index * 1000);
  });
}

// Check if all players (except author) have guessed
function checkAllGuessesComplete(room) {
  if (room.status !== 'GUESSING') return;
  const playersRequired = Object.values(room.players).filter(
    p => (p.connected || p.isBot) && p.id !== room.currentRound.submitterId
  );

  const allGuessed = playersRequired.every(p => p.hasGuessed);
  if (allGuessed && playersRequired.length > 0) {
    transitionToVoting(room);
  }
}

// Transition from GUESSING to VOTING
function transitionToVoting(room) {
  clearRoomTimer(room);
  if (room.status !== 'GUESSING') return;

  const round = room.currentRound;
  const options = [];

  // 1. Add Real Definition
  options.push({
    id: `opt_real_${crypto.randomUUID().slice(0, 6)}`,
    text: round.realDefinition,
    isReal: true,
    authorId: round.submitterId,
    authorName: round.submitterName
  });

  // 2. Add Fake Guesses from Players
  Object.values(room.players).forEach(player => {
    if (player.id !== round.submitterId && player.currentGuess && player.currentGuess.trim()) {
      options.push({
        id: `opt_fake_${crypto.randomUUID().slice(0, 6)}`,
        text: player.currentGuess.trim(),
        isReal: false,
        authorId: player.id,
        authorName: player.name
      });
    }
  });

  // If there are too few fake options (e.g. players timed out), generate a backup bluff from presets
  if (options.length < 2) {
    const preset = ACRONYM_PRESETS.find(p => p.acronym.toUpperCase() === round.acronym.toUpperCase());
    const fake = (preset && preset.fakeGuesses && preset.fakeGuesses[0]) || `${round.acronym} Standard Protocol`;
    options.push({
      id: `opt_backup_${crypto.randomUUID().slice(0, 6)}`,
      text: fake,
      isReal: false,
      authorId: 'house_bluff',
      authorName: 'House Bluff'
    });
  }

  // Shuffle options
  round.options = options.sort(() => 0.5 - Math.random());
  room.status = 'VOTING';

  // Start vote timer
  startRoomTimer(room, room.options.voteTimeLimit, () => {
    transitionToReveal(room);
  });

  broadcastRoomState(room);

  // Trigger bots to vote
  handleBotVotes(room);
}

// Bot auto-voting
function handleBotVotes(room) {
  if (room.status !== 'VOTING' || !room.currentRound) return;
  const round = room.currentRound;

  const botsToVote = Object.values(room.players).filter(
    p => p.isBot && p.id !== round.submitterId && !p.hasVoted
  );

  botsToVote.forEach((bot, index) => {
    setTimeout(() => {
      if (room.status !== 'VOTING') return;

      // Filter options bot is allowed to vote for (cannot vote for own bluff)
      const validOptions = round.options.filter(opt => opt.authorId !== bot.id);
      if (validOptions.length === 0) return;

      // Smart pick: 40% chance pick real, 60% chance pick random fake
      const realOpt = validOptions.find(o => o.isReal);
      let selectedOption;
      if (realOpt && Math.random() < 0.45) {
        selectedOption = realOpt;
      } else {
        selectedOption = validOptions[Math.floor(Math.random() * validOptions.length)];
      }

      bot.currentVote = selectedOption.id;
      bot.hasVoted = true;
      broadcastRoomState(room);
      checkAllVotesComplete(room);
    }, 1500 + index * 800);
  });
}

// Check if all players (except author) have voted
function checkAllVotesComplete(room) {
  if (room.status !== 'VOTING') return;
  const playersRequired = Object.values(room.players).filter(
    p => (p.connected || p.isBot) && p.id !== room.currentRound.submitterId
  );

  const allVoted = playersRequired.every(p => p.hasVoted);
  if (allVoted && playersRequired.length > 0) {
    transitionToReveal(room);
  }
}

// Transition from VOTING to REVEAL & Calculate Scores
function transitionToReveal(room) {
  clearRoomTimer(room);
  if (room.status !== 'VOTING') return;

  const round = room.currentRound;
  const ptsReal = room.options.pointsForReal || 1000;
  const ptsBluff = room.options.pointsForBluff || 500;
  const ptsAuthorBonus = room.options.pointsForAuthorBonus || 300;

  // Map votes: optionId -> array of voter player objects
  const votesMap = {};
  round.options.forEach(opt => {
    votesMap[opt.id] = [];
  });

  Object.values(room.players).forEach(player => {
    if (player.id !== round.submitterId && player.currentVote && votesMap[player.currentVote]) {
      votesMap[player.currentVote].push({
        id: player.id,
        name: player.name,
        avatar: player.avatar
      });
    }
  });

  round.votes = votesMap;

  // Calculate scores
  let totalRealVotes = 0;
  const playerGainMap = {};
  Object.values(room.players).forEach(p => {
    playerGainMap[p.id] = 0;
  });

  // 1. Award points for choosing the real answer
  const realOption = round.options.find(opt => opt.isReal);
  if (realOption && votesMap[realOption.id]) {
    totalRealVotes = votesMap[realOption.id].length;
    votesMap[realOption.id].forEach(voter => {
      playerGainMap[voter.id] = (playerGainMap[voter.id] || 0) + ptsReal;
    });
  }

  // 2. Award points for bluffing other players
  round.options.forEach(opt => {
    if (!opt.isReal && opt.authorId && room.players[opt.authorId]) {
      const fooledCount = (votesMap[opt.id] || []).length;
      if (fooledCount > 0) {
        playerGainMap[opt.authorId] = (playerGainMap[opt.authorId] || 0) + fooledCount * ptsBluff;
      }
    }
  });

  // 3. Submitter bonus if nobody guessed the real answer
  if (totalRealVotes === 0 && round.submitterId && room.players[round.submitterId]) {
    playerGainMap[round.submitterId] = (playerGainMap[round.submitterId] || 0) + ptsAuthorBonus;
  }

  // Apply gains to total scores
  Object.keys(playerGainMap).forEach(playerId => {
    if (room.players[playerId]) {
      const gain = playerGainMap[playerId];
      room.players[playerId].score = (room.players[playerId].score || 0) + gain;
      room.players[playerId].roundScoreGain = gain;
    }
  });

  // Assemble comprehensive reveal data
  round.revealData = {
    acronym: round.acronym,
    category: round.category,
    submitterId: round.submitterId,
    submitterName: round.submitterName,
    realOptionId: realOption ? realOption.id : null,
    totalRealVotes,
    earnedAuthorBonus: totalRealVotes === 0,
    options: round.options.map(opt => ({
      id: opt.id,
      text: opt.text,
      isReal: opt.isReal,
      authorId: opt.authorId,
      authorName: opt.authorName,
      voters: votesMap[opt.id] || []
    })),
    leaderboard: Object.values(room.players)
      .map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        gain: p.roundScoreGain
      }))
      .sort((a, b) => b.score - a.score)
  };

  room.status = 'REVEAL';
  broadcastRoomState(room);
}

// End Game Scoreboard
function endGameScoreboard(room) {
  clearRoomTimer(room);
  room.status = 'SCOREBOARD';
  broadcastRoomState(room);
}

// REST API for QR Code generation & Room health
app.get('/api/qr', async (req, res) => {
  try {
    const text = req.query.url;
    if (!text) return res.status(400).send('Missing url query');
    const qrDataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });
    res.json({ qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    roomsActive: rooms.size,
    timestamp: Date.now()
  });
});

// Helper to check if socket has host privileges (host player or TV screen host)
function isAuthorizedHost(room, socket) {
  if (!room) return false;
  const { playerId, isTvDisplay, isTvHost } = socket.data || {};
  if (isTvDisplay || isTvHost) return true;
  if (room.hostPlayerId && room.hostPlayerId === playerId) return true;
  if (!room.hostPlayerId) return true;
  return false;
}

// Socket.io Connection & Events
io.on('connection', (socket) => {
  // 0. CREATE TV / DEDICATED BIG SCREEN ROOM
  socket.on('createTvRoom', ({ options } = {}, callback) => {
    try {
      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const room = createRoomState(roomCode, null);
      room.hasTvHost = true;
      if (options && typeof options === 'object') {
        room.options = { ...room.options, ...options };
      }

      rooms.set(roomCode, room);

      socket.join(roomCode);
      socket.data = { roomCode, isTvDisplay: true, isTvHost: true, playerId: null };

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode,
          isTvDisplay: true,
          isTvHost: true,
          roomState: getSafeRoomState(room, null)
        });
      }

      broadcastRoomState(room);
    } catch (err) {
      console.error('Error creating TV room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 0.1 JOIN AS TV DISPLAY / SPECTATOR SCREEN
  socket.on('joinTvRoom', ({ roomCode }, callback) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return callback && callback({ success: false, error: 'Room not found! Check your code.' });
      }

      socket.join(code);
      socket.data = { roomCode: code, isTvDisplay: true, playerId: null };

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: code,
          isTvDisplay: true,
          isTvHost: Boolean(room.hasTvHost || !room.hostPlayerId),
          roomState: getSafeRoomState(room, null)
        });
      }

      broadcastRoomState(room);
    } catch (err) {
      console.error('Error joining TV room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 1. CREATE ROOM
  socket.on('createRoom', ({ playerName, avatar, options }, callback) => {
    try {
      let roomCode = generateRoomCode();
      while (rooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const playerId = `usr_${crypto.randomUUID().slice(0, 8)}`;
      const sessionToken = `sec_${crypto.randomUUID()}`;
      const name = sanitize(playerName) || 'Player 1';
      const userAvatar = avatar || '🚀';

      const hostPlayer = {
        id: playerId,
        sessionToken,
        name,
        avatar: userAvatar,
        isHost: true,
        isBot: false,
        score: 0,
        roundScoreGain: 0,
        connected: true,
        submissions: [],
        hasSubmittedWords: false,
        currentGuess: '',
        hasGuessed: false,
        currentVote: null,
        hasVoted: false,
        socketId: socket.id
      };

      const room = createRoomState(roomCode, hostPlayer);
      if (options && typeof options === 'object') {
        room.options = { ...room.options, ...options };
      }

      rooms.set(roomCode, room);

      socket.join(roomCode);
      socket.data = { roomCode, playerId, sessionToken };

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode,
          playerId,
          sessionToken,
          roomState: getSafeRoomState(room, playerId)
        });
      }

      broadcastRoomState(room);
    } catch (err) {
      console.error('Error creating room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 2. JOIN ROOM
  socket.on('joinRoom', ({ roomCode, playerName, avatar }, callback) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return callback && callback({ success: false, error: 'Room not found! Check your code.' });
      }

      if (room.status !== 'LOBBY') {
        return callback && callback({ success: false, error: 'Game already in progress!' });
      }

      const playerId = `usr_${crypto.randomUUID().slice(0, 8)}`;
      const sessionToken = `sec_${crypto.randomUUID()}`;
      const name = sanitize(playerName) || `Player ${Object.keys(room.players).length + 1}`;
      const userAvatar = avatar || '🎯';

      const isFirstPlayer = Object.keys(room.players).length === 0 || !room.hostPlayerId;
      if (isFirstPlayer) {
        room.hostPlayerId = playerId;
      }

      const player = {
        id: playerId,
        sessionToken,
        name,
        avatar: userAvatar,
        isHost: isFirstPlayer,
        isBot: false,
        score: 0,
        roundScoreGain: 0,
        connected: true,
        submissions: [],
        hasSubmittedWords: false,
        currentGuess: '',
        hasGuessed: false,
        currentVote: null,
        hasVoted: false,
        socketId: socket.id
      };

      room.players[playerId] = player;

      socket.join(code);
      socket.data = { roomCode: code, playerId, sessionToken };

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: code,
          playerId,
          sessionToken,
          roomState: getSafeRoomState(room, playerId)
        });
      }

      broadcastRoomState(room);
    } catch (err) {
      console.error('Error joining room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 3. REJOIN ROOM (Token-based Session Reconnection)
  socket.on('rejoinRoom', ({ roomCode, playerId, sessionToken }, callback) => {
    try {
      const code = (roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return callback && callback({ success: false, error: 'Room expired or not found.' });
      }

      const player = room.players[playerId];
      if (!player || player.sessionToken !== sessionToken) {
        return callback && callback({ success: false, error: 'Invalid reconnection credentials.' });
      }

      // Rebind socket
      player.connected = true;
      player.socketId = socket.id;

      socket.join(code);
      socket.data = { roomCode: code, playerId, sessionToken };

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomCode: code,
          playerId,
          sessionToken,
          roomState: getSafeRoomState(room, playerId)
        });
      }

      broadcastRoomState(room);
    } catch (err) {
      console.error('Error rejoining room:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 4. UPDATE ROOM OPTIONS (Host or TV Host)
  socket.on('updateOptions', ({ options }, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket) || room.status !== 'LOBBY') {
      return callback && callback({ success: false, error: 'Unauthorized or invalid state' });
    }

    if (options && typeof options === 'object') {
      room.options = { ...room.options, ...options };
      broadcastRoomState(room);
      callback && callback({ success: true });
    }
  });

  // 5. ADD / REMOVE BOT
  socket.on('addBot', (_, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket) || room.status !== 'LOBBY') {
      return callback && callback({ success: false, error: 'Unauthorized or invalid state' });
    }

    const currentBots = Object.values(room.players).filter(p => p.isBot);
    const profile = BOT_PROFILES[currentBots.length % BOT_PROFILES.length];
    const botId = `bot_${crypto.randomUUID().slice(0, 6)}`;

    room.players[botId] = {
      id: botId,
      sessionToken: `bot_token_${botId}`,
      name: `${profile.name} ${currentBots.length > 0 ? currentBots.length + 1 : ''}`.trim(),
      avatar: profile.avatar,
      isHost: false,
      isBot: true,
      score: 0,
      roundScoreGain: 0,
      connected: true,
      submissions: [],
      hasSubmittedWords: false,
      currentGuess: '',
      hasGuessed: false,
      currentVote: null,
      hasVoted: false
    };

    broadcastRoomState(room);
    callback && callback({ success: true });
  });

  socket.on('removePlayer', ({ targetPlayerId }, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket) || room.status !== 'LOBBY') {
      return callback && callback({ success: false, error: 'Unauthorized' });
    }

    if (room.players[targetPlayerId] && targetPlayerId !== room.hostPlayerId) {
      delete room.players[targetPlayerId];
      broadcastRoomState(room);
      callback && callback({ success: true });
    }
  });

  // 6. START GAME (Host or TV Host)
  socket.on('startGame', (_, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket) || room.status !== 'LOBBY') {
      return callback && callback({ success: false, error: 'Unauthorized or invalid state' });
    }

    const playerCount = Object.keys(room.players).length;
    if (playerCount < 2) {
      return callback && callback({
        success: false,
        error: 'You need at least 2 players (or click "Add Bot" to test solo)!'
      });
    }

    room.status = 'SUBMITTING';
    // Reset submission state
    Object.values(room.players).forEach(p => {
      p.submissions = [];
      p.hasSubmittedWords = false;
      p.score = 0;
      p.roundScoreGain = 0;
    });

    broadcastRoomState(room);
    handleBotSubmissions(room);
    callback && callback({ success: true });
  });

  // 7. SUBMIT WORDS (Acronyms + Definitions)
  socket.on('submitWords', ({ submissions }, callback) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'SUBMITTING') {
      return callback && callback({ success: false, error: 'Invalid state for submission' });
    }

    const player = room.players[playerId];
    if (!player) {
      return callback && callback({ success: false, error: 'Player not found' });
    }

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return callback && callback({ success: false, error: 'Please submit at least one acronym' });
    }

    // Clean and validate
    const cleanSubmissions = submissions.map(s => ({
      acronym: sanitize(s.acronym, 12).toUpperCase(),
      definition: sanitize(s.definition, 120),
      category: sanitize(s.category, 30) || 'General Industry'
    })).filter(s => s.acronym && s.definition);

    player.submissions = cleanSubmissions;
    player.hasSubmittedWords = true;

    callback && callback({ success: true });
    broadcastRoomState(room);
    checkAllSubmissionsComplete(room);
  });

  // 8. SUBMIT GUESS / BLUFF
  socket.on('submitGuess', ({ guess }, callback) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'GUESSING' || !room.currentRound) {
      return callback && callback({ success: false, error: 'Not in guessing phase' });
    }

    if (room.currentRound.submitterId === playerId) {
      return callback && callback({ success: false, error: 'You are the author of this acronym!' });
    }

    const player = room.players[playerId];
    if (!player) return;

    const cleanGuess = sanitize(guess, 120);
    if (!cleanGuess) {
      return callback && callback({ success: false, error: 'Please enter a guess' });
    }

    // Check if player's guess is identical to real definition
    const realDef = (room.currentRound.realDefinition || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const userDef = cleanGuess.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (realDef && userDef && realDef === userDef) {
      return callback && callback({
        success: false,
        isTooCloseToReal: true,
        error: '🎯 Spot on! That is the exact real answer! Write a creative fake definition so you can bluff other players!'
      });
    }

    player.currentGuess = cleanGuess;
    player.hasGuessed = true;

    callback && callback({ success: true });
    broadcastRoomState(room);
    checkAllGuessesComplete(room);
  });

  // 9. SUBMIT VOTE
  socket.on('submitVote', ({ optionId }, callback) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'VOTING' || !room.currentRound) {
      return callback && callback({ success: false, error: 'Not in voting phase' });
    }

    if (room.currentRound.submitterId === playerId) {
      return callback && callback({ success: false, error: 'Authors cannot vote on their own word!' });
    }

    const player = room.players[playerId];
    if (!player) return;

    // Verify option exists and is not player's own bluff
    const option = room.currentRound.options.find(opt => opt.id === optionId);
    if (!option) {
      return callback && callback({ success: false, error: 'Option not found' });
    }

    if (option.authorId === playerId) {
      return callback && callback({ success: false, error: 'You cannot vote for your own bluff!' });
    }

    player.currentVote = optionId;
    player.hasVoted = true;

    callback && callback({ success: true });
    broadcastRoomState(room);
    checkAllVotesComplete(room);
  });

  // 10. NEXT ROUND (Host or TV Host)
  socket.on('nextRound', (_, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket) || room.status !== 'REVEAL') {
      return callback && callback({ success: false, error: 'Unauthorized or invalid state' });
    }

    startNextAcronymRound(room);
    callback && callback({ success: true });
  });

  // 11. PLAY AGAIN (Host or TV Host)
  socket.on('playAgain', (_, callback) => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || !isAuthorizedHost(room, socket)) {
      return callback && callback({ success: false, error: 'Unauthorized' });
    }

    clearRoomTimer(room);
    room.status = 'LOBBY';
    room.acronymDeck = [];
    room.currentAcronymIndex = 0;
    room.currentRound = null;

    Object.values(room.players).forEach(p => {
      p.score = 0;
      p.roundScoreGain = 0;
      p.submissions = [];
      p.hasSubmittedWords = false;
      p.currentGuess = '';
      p.hasGuessed = false;
      p.currentVote = null;
      p.hasVoted = false;
    });

    broadcastRoomState(room);
    callback && callback({ success: true });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data || {};
    if (roomCode && playerId && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      if (room.players[playerId]) {
        room.players[playerId].connected = false;
        broadcastRoomState(room);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🎮 jrgn Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
});
