// Bruitages synthétisés à la volée (aucun fichier audio) et vibrations.

let ctx = null;
let actif = localStorage.getItem('chatons.sons') !== 'non';

export function sonsActifs() { return actif; }
export function basculerSons() {
  actif = !actif;
  localStorage.setItem('chatons.sons', actif ? 'oui' : 'non');
  if (actif) jouer('clic');
  return actif;
}

// Les navigateurs n'autorisent l'audio qu'après un geste de l'utilisateur.
export function reveiller() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ctx.state === 'suspended') ctx.resume();
}

function note({ f = 440, f2 = null, duree = 0.15, type = 'sine', gain = 0.18, retard = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + retard;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + duree);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + duree + 0.05);
}

function bruit({ duree = 0.4, gain = 0.3, retard = 0, coupure = 1200 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + retard;
  const n = Math.floor(ctx.sampleRate * duree);
  const tampon = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = tampon.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = ctx.createBufferSource(); src.buffer = tampon;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(coupure, t0);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

export function vibrer(motif) {
  if (!actif) return;
  try { navigator.vibrate && navigator.vibrate(motif); } catch {}
}

const REPERTOIRE = {
  clic:      () => note({ f: 520, duree: 0.06, type: 'triangle', gain: 0.1 }),
  carte:     () => { bruit({ duree: 0.12, gain: 0.12, coupure: 3800 }); note({ f: 700, f2: 950, duree: 0.09, type: 'triangle', gain: 0.08 }); },
  pioche:    () => { bruit({ duree: 0.16, gain: 0.14, coupure: 2600 }); note({ f: 300, f2: 520, duree: 0.14, type: 'sine', gain: 0.09 }); },
  tour:      () => { note({ f: 587, duree: 0.11, type: 'sine' }); note({ f: 880, duree: 0.16, type: 'sine', retard: 0.1 }); },
  nope:      () => { note({ f: 220, f2: 90, duree: 0.3, type: 'sawtooth', gain: 0.2 }); },
  vol:       () => { note({ f: 880, f2: 1320, duree: 0.12, type: 'triangle', gain: 0.12 }); note({ f: 1320, duree: 0.1, type: 'sine', retard: 0.1, gain: 0.1 }); },
  boum:      () => { bruit({ duree: 0.9, gain: 0.5, coupure: 700 }); note({ f: 120, f2: 30, duree: 0.7, type: 'sawtooth', gain: 0.3 }); },
  sauve:     () => { [523, 659, 784, 1047].forEach((f, i) => note({ f, duree: 0.16, retard: i * 0.08, type: 'sine', gain: 0.14 })); },
  victoire:  () => { [523, 659, 784, 1047, 1319].forEach((f, i) => note({ f, duree: 0.4, retard: i * 0.13, type: 'triangle', gain: 0.15 })); },
  arrivee:   () => { note({ f: 660, duree: 0.1, type: 'sine' }); note({ f: 990, duree: 0.14, retard: 0.09, type: 'sine' }); },
  message:   () => note({ f: 760, duree: 0.08, type: 'sine', gain: 0.08 }),
};

const VIBRATIONS = {
  tour: [40], boum: [90, 60, 220], sauve: [20, 40, 20], nope: [70], vol: [25, 30, 25], victoire: [60, 60, 60, 60, 200],
};

export function jouer(nom) {
  if (!actif) return;
  reveiller();
  const f = REPERTOIRE[nom];
  if (f) f();
  if (VIBRATIONS[nom]) vibrer(VIBRATIONS[nom]);
}
