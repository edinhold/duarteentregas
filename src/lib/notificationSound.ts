// Notification sound utility with volume control and standby support

// Global volume setting (0-1)
let globalVolume = 1.0;
let standbyInterval: ReturnType<typeof setInterval> | null = null;
let standbyEnabled = false;
let standbyIntervalMs = 30000; // 30 seconds default

export const setNotificationVolume = (vol: number) => {
  globalVolume = Math.max(0, Math.min(1, vol));
};

export const getNotificationVolume = () => globalVolume;

// Generate a simple notification beep using AudioContext
export const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 880;
    osc1.type = "sine";
    gain1.gain.setValueAtTime(0.3 * globalVolume, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.3 * globalVolume, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);

    setTimeout(() => ctx.close(), 1000);
  } catch (e) {
    // Silently fail
  }
};

// Urgent alarm: loud sirene-style with multiple rounds of ascending beeps + heavy vibration
export const playUrgentNotification = () => {
  // Strong vibration pattern
  try {
    if ("vibrate" in navigator) {
      // Repeat vibration pattern
      navigator.vibrate([500, 200, 500, 200, 500, 200, 800, 200, 800]);
    }
  } catch {}

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const frequencies = [660, 880, 1100, 1320, 1500, 1700];
    const rounds = 6; // Increased rounds
    const vol = Math.max(globalVolume, 0.85); // Minimum 85% volume for urgent

    // Multiple oscillators for a richer, louder sound
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < frequencies.length; i++) {
        const startTime = ctx.currentTime + r * 0.6 + i * 0.1;
        
        // Main oscillator
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Secondary harmonic oscillator for "loudness"
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc.frequency.value = frequencies[i];
        osc2.frequency.value = frequencies[i] * 1.01; // Slight detune for chorus effect
        
        osc.type = r % 2 === 0 ? "square" : "sawtooth";
        osc2.type = "sine";

        gain.gain.setValueAtTime(0.5 * vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
        
        gain2.gain.setValueAtTime(0.2 * vol, startTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
        osc2.start(startTime);
        osc2.stop(startTime + 0.15);
      }
    }

    // Final long high-pitched alert tone
    const finalStart = ctx.currentTime + rounds * 0.6;
    const oscFinal = ctx.createOscillator();
    const gainFinal = ctx.createGain();
    oscFinal.connect(gainFinal);
    gainFinal.connect(ctx.destination);
    oscFinal.frequency.value = 1800;
    oscFinal.type = "square"; // More aggressive
    gainFinal.gain.setValueAtTime(0.6 * vol, finalStart);
    gainFinal.gain.exponentialRampToValueAtTime(0.01, finalStart + 1.0);
    oscFinal.start(finalStart);
    oscFinal.stop(finalStart + 1.0);

    setTimeout(() => ctx.close(), 6000);
  } catch {}
};

// Standby alert: gentle reminder beep + short vibration
export const playStandbyAlert = () => {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {}

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const vol = globalVolume * 0.5;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 700;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 900;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.2 * vol, ctx.currentTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc2.start(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.5);

    setTimeout(() => ctx.close(), 1500);
  } catch {}
};

// Standby mode: periodic alerts when driver is idle
export const startStandbyMode = (intervalMs?: number) => {
  stopStandbyMode();
  standbyEnabled = true;
  standbyIntervalMs = intervalMs || standbyIntervalMs;
  standbyInterval = setInterval(() => {
    if (standbyEnabled) {
      playStandbyAlert();
    }
  }, standbyIntervalMs);
};

export const stopStandbyMode = () => {
  standbyEnabled = false;
  if (standbyInterval) {
    clearInterval(standbyInterval);
    standbyInterval = null;
  }
};

export const isStandbyActive = () => standbyEnabled;

export const setStandbyInterval = (ms: number) => {
  standbyIntervalMs = Math.max(10000, ms); // Minimum 10 seconds
  if (standbyEnabled) {
    startStandbyMode(standbyIntervalMs);
  }
};

export const getStandbyInterval = () => standbyIntervalMs;
