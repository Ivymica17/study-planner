const SOUND_SOURCES = {
  click: '/sounds/click.mp3',
  correct: '/sounds/correct.mp3',
  wrong: '/sounds/wrong.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
  hint: '/sounds/hint.mp3',
};

const audioCache = new Map();
const SOUND_ENABLED_KEY = 'metis-sound-enabled';

const canUseAudio = () => typeof window !== 'undefined' && typeof Audio !== 'undefined';
const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function isSoundEnabled() {
  if (!canUseStorage()) return true;

  try {
    return window.localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(SOUND_ENABLED_KEY, String(Boolean(enabled)));
  } catch {
    // Ignore storage failures so the toggle still works for the current session.
  }
}

const getBaseAudio = (name) => {
  if (!canUseAudio()) return null;

  const src = SOUND_SOURCES[name];
  if (!src) return null;

  if (!audioCache.has(name)) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audioCache.set(name, audio);
  }

  return audioCache.get(name);
};

export function playSound(name, options = {}) {
  if (!isSoundEnabled()) return null;

  const baseAudio = getBaseAudio(name);
  if (!baseAudio) return null;

  const audio = baseAudio.cloneNode();
  audio.volume = typeof options.volume === 'number' ? options.volume : 1;
  audio.playbackRate = typeof options.pitch === 'number'
    ? options.pitch
    : typeof options.playbackRate === 'number'
      ? options.playbackRate
      : 1;

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore autoplay and missing-asset failures so gameplay keeps working.
    });
  }

  return audio;
}

export function preloadSounds(names = Object.keys(SOUND_SOURCES)) {
  if (!canUseAudio()) return;

  names.forEach((name) => {
    const audio = getBaseAudio(name);
    if (audio) {
      audio.load();
    }
  });
}
