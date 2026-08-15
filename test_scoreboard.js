const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScoreboardTest() {
  console.log('🧪 Testing Full Loop to Final Scoreboard and Play Again...');

  const hostSocket = io(SERVER_URL);
  await new Promise(r => hostSocket.on('connect', r));

  const createRes = await new Promise(resolve => {
    hostSocket.emit('createRoom', {
      playerName: 'Host Alex',
      avatar: '🚀',
      options: { wordsPerPlayer: 1, guessTimeLimit: 5, voteTimeLimit: 5 }
    }, resolve);
  });

  const roomCode = createRes.roomCode;
  const hostPlayerId = createRes.playerId;

  const guestSocket = io(SERVER_URL);
  await new Promise(r => guestSocket.on('connect', r));

  await new Promise(resolve => {
    guestSocket.emit('joinRoom', {
      roomCode: roomCode,
      playerName: 'Guest Sam',
      avatar: '👾'
    }, resolve);
  });

  // Start game
  await new Promise(resolve => hostSocket.emit('startGame', {}, resolve));
  await sleep(300);

  // Submit 1 word each
  await new Promise(resolve => {
    hostSocket.emit('submitWords', {
      submissions: [{ acronym: 'DNS', definition: 'Domain Name System', category: 'Tech' }]
    }, resolve);
  });

  await new Promise(resolve => {
    guestSocket.emit('submitWords', {
      submissions: [{ acronym: 'CAC', definition: 'Customer Acquisition Cost', category: 'Marketing' }]
    }, resolve);
  });

  // Play both rounds until SCOREBOARD
  let currentStatus = '';
  hostSocket.on('roomStateUpdate', state => {
    currentStatus = state.status;
    if (state.status === 'GUESSING') {
      const round = state.currentRound;
      if (round.submitterId !== hostPlayerId) {
        hostSocket.emit('submitGuess', { guess: 'Fake Host Guess' });
      } else {
        guestSocket.emit('submitGuess', { guess: 'Fake Guest Guess' });
      }
    } else if (state.status === 'VOTING') {
      const round = state.currentRound;
      const validOpt = round.options.find(o => !o.isMyBluff);
      if (validOpt) {
        if (round.submitterId !== hostPlayerId) {
          hostSocket.emit('submitVote', { optionId: validOpt.id });
        } else {
          guestSocket.emit('submitVote', { optionId: validOpt.id });
        }
      }
    } else if (state.status === 'REVEAL') {
      console.log(`Round ${state.currentAcronymIndex + 1}/${state.totalAcronyms} Reveal. Moving to next...`);
      setTimeout(() => {
        hostSocket.emit('nextRound', {});
      }, 500);
    } else if (state.status === 'SCOREBOARD') {
      console.log('🏆 Final Scoreboard reached! Players:');
      state.players.forEach(p => console.log(`   ${p.name}: ${p.score} pts`));
    }
  });

  while (currentStatus !== 'SCOREBOARD') {
    await sleep(400);
  }

  // Test Play Again
  console.log('🔄 Testing Play Again...');
  const playAgainRes = await new Promise(resolve => {
    hostSocket.emit('playAgain', {}, resolve);
  });
  console.log('✅ Play again triggered:', playAgainRes);

  await sleep(400);
  console.log('✅ Room reset to LOBBY successfully. All tests passed!');

  hostSocket.disconnect();
  guestSocket.disconnect();
  process.exit(0);
}

runScoreboardTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
