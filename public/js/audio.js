// Web Audio API Procedural Sound Engine for jrgn & TV Host Display
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.hasUnlocked = false;

    // Load saved mute state
    try {
      const saved = localStorage.getItem('jrgn_sound_muted');
      if (saved !== null) {
        this.isMuted = saved === 'true';
      }
    } catch (e) {}

    // Attach unlock handlers on first user gesture
    const unlock = () => {
      this.initCtx();
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  }

  initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.hasUnlocked = true;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('jrgn_sound_muted', String(this.isMuted));
    } catch (e) {}
    return this.isMuted;
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    try {
      localStorage.setItem('jrgn_sound_muted', String(this.isMuted));
    } catch (e) {}
  }

  // 1. Player Joined Lobby Chime
  playJoin() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + i * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.36);
    });
  }

  // 2. Timer Tick (Regular vs Urgent)
  playTick(urgent = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = urgent ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(urgent ? 880 : 440, now);
    if (urgent) {
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
    }

    gain.gain.setValueAtTime(urgent ? 0.22 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (urgent ? 0.12 : 0.06));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // 3. Card Shuffle & Deal Swoosh
  playShuffle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    for (let i = 0; i < 5; i++) {
      const now = this.ctx.currentTime + i * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300 + Math.random() * 400, now);
      osc.frequency.exponentialRampToValueAtTime(150 + Math.random() * 100, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  // 4. Bluff Revealed / Fooled Sting
  playBluffReveal() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [440, 370, 311.13]; // A4, F#4, D#4 suspense chord
    notes.forEach((freq, i) => {
      const now = this.ctx.currentTime + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    });
  }

  // 5. Real Answer Triumphant Reveal Fanfare
  playRealReveal() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const chord = [523.25, 659.25, 783.99, 1046.50]; // C Major triumph
    const now = this.ctx.currentTime;

    chord.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.95);
    });
  }

  // 6. Victory Fanfare for Scoreboard & Podium
  playVictory() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const melody = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.15 }, // E5
      { f: 783.99, d: 0.15 }, // G5
      { f: 1046.5, d: 0.45 }, // C6
      { f: 880.00, d: 0.15 }, // A5
      { f: 1046.5, d: 0.60 }  // C6
    ];

    let t = this.ctx.currentTime;
    melody.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + note.d + 0.05);
      t += note.d * 0.85;
    });
  }
}

window.soundEngine = new SoundEngine();
