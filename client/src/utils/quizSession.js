import { recordStudyActivity } from './studyWorkspace';

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

  const updatedAt = new Date().toISOString();

  const payload = {
    ...session,
    inProgress: true,
    updatedAt,
  };

  localStorage.setItem(getQuizSessionStorageKey(moduleId), JSON.stringify(payload));
  recordStudyActivity(updatedAt);
}

export function clearQuizSession(moduleId) {
  if (!moduleId) return;
  localStorage.removeItem(getQuizSessionStorageKey(moduleId));
}
