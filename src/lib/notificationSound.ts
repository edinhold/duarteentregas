// Notification sound utility with volume control and standby support
import { toast } from "sonner";

// Global volume setting (0-1)
let globalVolume = 1.0;
let standbyInterval: ReturnType<typeof setInterval> | null = null;
let standbyEnabled = false;
let standbyIntervalMs = 30000; // 30 seconds default
let noSleepInterval: ReturnType<typeof setInterval> | null = null;
let noSleepEnabled = false;

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

// Catchy message notification sound
export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === "suspended") ctx.resume();

    const vol = globalVolume * 0.6;
    const startTime = ctx.currentTime;

    // A pleasant double-beep
    const frequencies = [523.25, 659.25]; // C5, E5
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      
      const time = startTime + i * 0.12;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3 * vol, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
      
      osc.start(time);
      osc.stop(time + 0.25);
    });
  } catch (e) {
    // Silently fail
  }
};

// Urgent alarm: loud sirene-style with multiple rounds of ascending beeps + heavy vibration
// Optimized for maximum audibility and impact
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

    // High penetration frequencies
    const frequencies = [660, 880, 1100, 1320, 1500, 1700];
    const rounds = 8; // Increased rounds
    const vol = 1.0; // Force maximum volume for urgent alerts

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < frequencies.length; i++) {
        const startTime = ctx.currentTime + r * 0.5 + i * 0.08;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc.frequency.value = frequencies[i];
        osc2.frequency.value = frequencies[i] * 1.02; // Slightly more detuned for "emergency" feel
        
        osc.type = "sawtooth"; // Harsh, audible waveform
        osc2.type = "square"; // Penetrating waveform

        gain.gain.setValueAtTime(0.6 * vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
        
        gain2.gain.setValueAtTime(0.3 * vol, startTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
        osc2.start(startTime);
        osc2.stop(startTime + 0.2);
      }
    }

    // Final loud beep
    const finalStart = ctx.currentTime + rounds * 0.5;
    const oscFinal = ctx.createOscillator();
    const gainFinal = ctx.createGain();
    oscFinal.connect(gainFinal);
    gainFinal.connect(ctx.destination);
    oscFinal.frequency.value = 2000;
    oscFinal.type = "square";
    gainFinal.gain.setValueAtTime(0.8 * vol, finalStart);
    gainFinal.gain.exponentialRampToValueAtTime(0.01, finalStart + 1.2);
    oscFinal.start(finalStart);
    oscFinal.stop(finalStart + 1.2);
  } catch (e) {
    console.error("Error playing urgent sound:", e);
  }
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

// No-sleep loop: plays a silent sound to keep the tab alive
export const startNoSleepLoop = () => {
  if (noSleepEnabled) return;
  noSleepEnabled = true;
  
  const playSilent = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 100; // Low freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime); // Almost silent
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  playSilent();
  noSleepInterval = setInterval(playSilent, 5000); // More frequent to keep thread alive
};

export const stopNoSleepLoop = () => {
  noSleepEnabled = false;
  if (noSleepInterval) {
    clearInterval(noSleepInterval);
    noSleepInterval = null;
  }
};
