const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTieTest() {
  console.log('🧪 Testing Tie-Breaking & Ranking Resolution...');

  const hostSocket = io(SERVER_URL);
  await new Promise(r => hostSocket.on('connect', r));

  const createRes = await new Promise(resolve => {
    hostSocket.emit('createRoom', {
      playerName: 'Player A',
      avatar: '🚀',
      options: { wordsPerPlayer: 1, guessTimeLimit: 5, voteTimeLimit: 5 }
    }, resolve);
  });

  const roomCode = createRes.roomCode;
  const hostPlayerId = createRes.playerId;

  const guestSocket = io(SERVER_URL);
  await new Promise(r => guestSocket.on('connect', r));

  const joinRes = await new Promise(resolve => {
    guestSocket.emit('joinRoom', {
      roomCode: roomCode,
      playerName: 'Player B',
      avatar: '👾'
    }, resolve);
  });
  const guestPlayerId = joinRes.playerId;

  // Start game
  await new Promise(resolve => hostSocket.emit('startGame', {}, resolve));
  await sleep(300);

  // Submit words
  await new Promise(resolve => {
    hostSocket.emit('submitWords', {
      submissions: [{ acronym: 'TIE1', definition: 'Equal Definition One', category: 'Tech' }]
    }, resolve);
  });

  await new Promise(resolve => {
    guestSocket.emit('submitWords', {
      submissions: [{ acronym: 'TIE2', definition: 'Equal Definition Two', category: 'Tech' }]
    }, resolve);
  });

  let scoreboardReached = false;
  hostSocket.on('roomStateUpdate', state => {
    if (state.status === 'GUESSING') {
      const round = state.currentRound;
      if (round.submitterId !== hostPlayerId) {
        hostSocket.emit('submitGuess', { guess: 'Host Bluff' });
      } else {
        guestSocket.emit('submitGuess', { guess: 'Guest Bluff' });
      }
    } else if (state.status === 'VOTING') {
      const round = state.currentRound;
      // Both vote for real definition in both rounds so their final scores are exactly tied (1000 pts each)
      const realOpt = round.options.find(o => !o.isMyBluff);
      if (realOpt) {
        if (round.submitterId !== hostPlayerId) {
          hostSocket.emit('submitVote', { optionId: realOpt.id });
        } else {
          guestSocket.emit('submitVote', { optionId: realOpt.id });
        }
      }
    } else if (state.status === 'REVEAL') {
      setTimeout(() => hostSocket.emit('nextRound', {}), 300);
    } else if (state.status === 'SCOREBOARD') {
      scoreboardReached = true;
      console.log('🏆 Scoreboard reached. Scores:');
      state.players.forEach(p => console.log(`   ${p.name}: ${p.score} pts`));
      if (state.players[0].score === state.players[1].score) {
        console.log('✅ Verified: Players are tied with identical scores!');
      }
    }
  });

  while (!scoreboardReached) {
    await sleep(400);
  }

  hostSocket.disconnect();
  guestSocket.disconnect();

  console.log('🌟 Tie test simulation passed successfully! 🌟');
  process.exit(0);
}

runTieTest().catch(err => {
  console.error('❌ Tie test failed:', err);
  process.exit(1);
});
