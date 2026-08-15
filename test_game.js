const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 Starting Full Multiplayer Game Simulation Test...');

  // 1. Connect Host Socket
  const hostSocket = io(SERVER_URL);
  await new Promise(r => hostSocket.on('connect', r));
  console.log('✅ Host connected to server');

  let roomCode = null;
  let hostPlayerId = null;
  let hostToken = null;

  // Create Room
  const createRes = await new Promise(resolve => {
    hostSocket.emit('createRoom', {
      playerName: 'Alice (Host)',
      avatar: '👑',
      options: { wordsPerPlayer: 1, guessTimeLimit: 5, voteTimeLimit: 5 }
    }, resolve);
  });

  if (!createRes.success) {
    throw new Error('Create room failed: ' + createRes.error);
  }

  roomCode = createRes.roomCode;
  hostPlayerId = createRes.playerId;
  hostToken = createRes.sessionToken;
  console.log(`✅ Room Created with 4-letter Code: [${roomCode}] | Host ID: ${hostPlayerId}`);

  // 2. Connect Guest Socket (Player 2)
  const guestSocket = io(SERVER_URL);
  await new Promise(r => guestSocket.on('connect', r));

  const joinRes = await new Promise(resolve => {
    guestSocket.emit('joinRoom', {
      roomCode: roomCode,
      playerName: 'Bob (Mobile)',
      avatar: '📱'
    }, resolve);
  });

  if (!joinRes.success) {
    throw new Error('Guest join failed: ' + joinRes.error);
  }
  const guestPlayerId = joinRes.playerId;
  const guestToken = joinRes.sessionToken;
  console.log(`✅ Player 2 (Bob) Joined Room: [${roomCode}] | Guest ID: ${guestPlayerId}`);

  // 3. Host Adds an AI Bot
  const addBotRes = await new Promise(resolve => {
    hostSocket.emit('addBot', {}, resolve);
  });
  console.log('✅ Host added AI Bot. Result:', addBotRes);

  await sleep(400);

  // 4. Host Starts Game
  console.log('🚀 Host starting game...');
  const startRes = await new Promise(resolve => {
    hostSocket.emit('startGame', {}, resolve);
  });
  if (!startRes.success) {
    throw new Error('Start game failed: ' + startRes.error);
  }
  console.log('✅ Game Started -> SUBMITTING phase');

  await sleep(400);

  // 5. Host & Guest submit acronyms
  console.log('📝 Submitting custom industry acronyms...');
  await new Promise(resolve => {
    hostSocket.emit('submitWords', {
      submissions: [
        { acronym: 'K8S', definition: 'Kubernetes Container Orchestration', category: 'DevOps' }
      ]
    }, resolve);
  });

  await new Promise(resolve => {
    guestSocket.emit('submitWords', {
      submissions: [
        { acronym: 'SEO', definition: 'Search Engine Optimization', category: 'Marketing' }
      ]
    }, resolve);
  });

  console.log('✅ Human players submitted words. Waiting for bots & round start...');

  // Wait for submission completion & transition to GUESSING
  let roundState = null;
  hostSocket.on('roomStateUpdate', state => {
    if (state.status === 'GUESSING') {
      roundState = state;
    }
  });

  while (!roundState) {
    await sleep(300);
  }

  console.log(`✅ Round 1 Active: Acronym [${roundState.currentRound.acronym}] | Submitter: ${roundState.currentRound.submitterName}`);

  // 6. Test Bluff Guessing
  const round = roundState.currentRound;
  if (round.submitterId !== hostPlayerId) {
    console.log('Host submitting bluff...');
    hostSocket.emit('submitGuess', { guess: 'Kinetic 8 System Engine' });
  }
  if (round.submitterId !== guestPlayerId) {
    console.log('Guest submitting bluff...');
    guestSocket.emit('submitGuess', { guess: 'Knowledge 8 Storage System' });
  }

  // Wait for transition to VOTING
  let votingState = null;
  hostSocket.on('roomStateUpdate', state => {
    if (state.status === 'VOTING') {
      votingState = state;
    }
  });

  while (!votingState) {
    await sleep(300);
  }

  console.log(`✅ Transitioned to VOTING phase. Candidate Options Count: ${votingState.currentRound.options.length}`);
  votingState.currentRound.options.forEach((opt, idx) => {
    console.log(`   Option ${idx + 1}: "${opt.text}" (My Bluff: ${opt.isMyBluff})`);
  });

  // 7. Test Voting
  const hostVoteOpt = votingState.currentRound.options.find(o => !o.isMyBluff);
  const guestVoteOpt = votingState.currentRound.options.find(o => !o.isMyBluff);

  if (votingState.currentRound.submitterId !== hostPlayerId && hostVoteOpt) {
    hostSocket.emit('submitVote', { optionId: hostVoteOpt.id });
  }
  if (votingState.currentRound.submitterId !== guestPlayerId && guestVoteOpt) {
    guestSocket.emit('submitVote', { optionId: guestVoteOpt.id });
  }

  // Wait for transition to REVEAL
  let revealState = null;
  hostSocket.on('roomStateUpdate', state => {
    if (state.status === 'REVEAL') {
      revealState = state;
    }
  });

  while (!revealState) {
    await sleep(300);
  }

  console.log('🎉 REVEAL Phase reached! Scores calculated:');
  revealState.currentRound.revealData.leaderboard.forEach(p => {
    console.log(`   ${p.name}: ${p.score} pts (+${p.gain} this round)`);
  });

  // 8. Test Session Reconnection (Simulate Guest Network Drop & Resume)
  console.log('🔄 Testing Disconnect & Token Reconnection for Guest (Bob)...');
  guestSocket.disconnect();
  await sleep(500);

  const reconnectedGuestSocket = io(SERVER_URL);
  await new Promise(r => reconnectedGuestSocket.on('connect', r));

  const rejoinRes = await new Promise(resolve => {
    reconnectedGuestSocket.emit('rejoinRoom', {
      roomCode: roomCode,
      playerId: guestPlayerId,
      sessionToken: guestToken
    }, resolve);
  });

  if (!rejoinRes.success) {
    throw new Error('Rejoin failed: ' + rejoinRes.error);
  }
  console.log('✅ Guest successfully rejoined and resumed room state seamlessly! Current status:', rejoinRes.roomState.status);

  // Clean up sockets
  hostSocket.disconnect();
  reconnectedGuestSocket.disconnect();

  console.log('🌟 ALL MULTIPLAYER GAMEPLAY TESTS PASSED PERFECTLY! 🌟');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
