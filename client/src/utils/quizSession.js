const QUIZ_SESSION_PREFIX = 'quiz-session';

export function getQuizSessionStorageKey(moduleId) {
  return `${QUIZ_SESSION_PREFIX}:${moduleId}`;
}

export function loadQuizSession(moduleId) {
  if (!moduleId) return null;

  try {
    const raw = localStorage.getItem(getQuizSessionStorageKey(moduleId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.inProgress) return null;
    return parsed;
  } catch (error) {
    console.error('Failed to load quiz session:', error);
    return null;
  }
}

export function saveQuizSession(moduleId, session) {
  if (!moduleId) return;

  const payload = {
    ...session,
    inProgress: true,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(getQuizSessionStorageKey(moduleId), JSON.stringify(payload));
}

export function clearQuizSession(moduleId) {
  if (!moduleId) return;
  localStorage.removeItem(getQuizSessionStorageKey(moduleId));
}
