// Notification sound utility with volume control and standby support
import { toast } from "sonner";

// Global volume setting (0-1)
let globalVolume = 1.0;
let standbyInterval: ReturnType<typeof setInterval> | null = null;
let standbyEnabled = false;
let standbyIntervalMs = 30000; // 30 seconds default

// Singleton AudioContext to handle browser autoplay policies better
let sharedCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedCtx = new AudioContextClass();
    }
  }
  return sharedCtx;
};

// This should be called on any user interaction (click, touch) to unlock audio
export const resumeAudioContext = async () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    try {
      await ctx.resume();
      console.log("AudioContext resumed successfully");
    } catch (err) {
      console.error("Failed to resume AudioContext:", err);
    }
  }
};

export const setNotificationVolume = (vol: number) => {
  globalVolume = Math.max(0, Math.min(1, vol));
};

export const getNotificationVolume = () => globalVolume;

// Generate a simple notification beep
export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    // Resume if suspended (browser policy)
    if (ctx.state === "suspended") ctx.resume();

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
  } catch (e) {
    // Silently fail
  }
};

// Urgent alarm: loud sirene-style with multiple rounds of ascending beeps + heavy vibration
export const playUrgentNotification = () => {
  // Strong vibration pattern
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 800, 200, 800]);
    }
  } catch {}

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === "suspended") ctx.resume();

    const frequencies = [660, 880, 1100, 1320, 1500, 1700];
    const rounds = 6;
    const vol = Math.max(globalVolume, 0.85);

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < frequencies.length; i++) {
        const startTime = ctx.currentTime + r * 0.6 + i * 0.1;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc.frequency.value = frequencies[i];
        osc2.frequency.value = frequencies[i] * 1.01;
        
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

    const finalStart = ctx.currentTime + rounds * 0.6;
    const oscFinal = ctx.createOscillator();
    const gainFinal = ctx.createGain();
    oscFinal.connect(gainFinal);
    gainFinal.connect(ctx.destination);
    oscFinal.frequency.value = 1800;
    oscFinal.type = "square";
    gainFinal.gain.setValueAtTime(0.6 * vol, finalStart);
    gainFinal.gain.exponentialRampToValueAtTime(0.01, finalStart + 1.0);
    oscFinal.start(finalStart);
    oscFinal.stop(finalStart + 1.0);
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
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === "suspended") ctx.resume();

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
  } catch {}
};

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
