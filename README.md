# ⚡ jrgn - The Industry Jargon & Acronym Bluffing Game

A real-time, full-stack JavaScript multiplayer party game inspired by *Balderdash* and *Fibbage*, specially crafted for teams, coworkers, and friends to bluff their industry's wildest acronyms and jargon!

---

## 🎮 Features & Gameplay Loop

1. **Room Creation & 4-Letter Codes**:
   - Create or join rooms with easy 4-letter codes (e.g. `K9X2`, `TECH`, `ABCD`).
   - Host can configure game settings: words per player (1 to 4), bluff timer (30s, 45s, 60s, ∞), vote timer (20s, 30s, 45s), and add AI Bots.

2. **Mobile-Friendly & Instant Join**:
   - Responsive layout designed for phones, tablets, and desktops.
   - Built-in **QR Code Modal** on the lobby screen: scan with your phone camera to join instantly with the room code pre-filled!
   - Direct link sharing: `http://<host>:<port>/?room=CODE`.

3. **Session Token & Auto-Reconnection**:
   - Players receive a unique session token mapped to their room code and stored in `localStorage`.
   - If a mobile browser sleeps, refreshes, or drops Wi-Fi, it seamlessly reconnects and restores the exact round state, score, and inputs.

4. **The Gameplay Loop**:
   - **Phase 1: Submission**: Players submit industry acronyms (e.g. `EBITDA`, `CRUD`, `STAT`, `SNAFU`) with their true definitions. An **Idea Library** with 25+ curated presets across Tech, Healthcare, Finance, Marketing, Aviation, and Gaming is available for instant inspiration.
   - **Phase 2: Bluffing**: One acronym is shown at a time. The author watches in VIP mode, while all other players submit creative fake definitions (bluffs).
   - **Phase 3: Voting**: All bluffs and the genuine real definition are shuffled and displayed as cards. Players vote for the one they believe is real (you cannot vote for your own bluff).
   - **Phase 4: Reveal & Scoring**:
     - `+1,000 pts` for picking the real definition.
     - `+500 pts` to the author of each bluff for every player fooled.
     - `+300 pts` author bonus if nobody guessed the real definition.
     - Animated round leaderboard and points breakdown.
   - **Phase 5: Final Scoreboard & Podium**:
     - 1st, 2nd, and 3rd place podium celebration with confetti explosion and full leaderboard.
     - "Play Again" button to restart with the same room group.

5. **Audio & Visual Polish**:
   - Web Audio API Synthesizer effects (taps, countdown ticks, dings, buzzers, and victory fanfare) with sound toggle.
   - 60fps Canvas particle confetti engine.
   - AI Bots for solo testing and filling party slots.

---

## 🚀 Getting Started

### 1. Start the Server
```bash
cd acronym-game
npm start
```
The server will start on `http://localhost:3000`.

### 2. Play on Phones on Local Network
Find your computer's local IP address (e.g. `192.168.1.50`) and open:
```
http://192.168.1.50:3000
```
Or open the QR Code modal on the host screen and scan it with any phone camera on the same Wi-Fi network!
