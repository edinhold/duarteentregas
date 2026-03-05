// Notification sound utility

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
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);

    setTimeout(() => ctx.close(), 1000);
  } catch (e) {
    // Silently fail
  }
};

// Urgent alarm: 3 rounds of ascending beeps + vibration (for new delivery calls)
export const playUrgentNotification = () => {
  // Vibrate if supported (mobile)
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([300, 150, 300, 150, 500]);
    }
  } catch {}

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const frequencies = [660, 880, 1100];
    const rounds = 3;

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < frequencies.length; i++) {
        const startTime = ctx.currentTime + r * 0.6 + i * 0.15;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequencies[i];
        osc.type = "square";
        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.12);
        osc.start(startTime);
        osc.stop(startTime + 0.12);
      }
    }

    setTimeout(() => ctx.close(), 3000);
  } catch {}
};
