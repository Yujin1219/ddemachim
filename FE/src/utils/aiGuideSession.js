export const AI_GUIDE_SESSION_STORAGE_KEY = 'ddemachim.ai-guide-session';

function browserSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function isStoredMessage(message) {
  return message
    && typeof message === 'object'
    && typeof message.id === 'string'
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string';
}

export function loadAiGuideSession(storage = browserSessionStorage()) {
  if (!storage) return null;

  try {
    const stored = JSON.parse(storage.getItem(AI_GUIDE_SESSION_STORAGE_KEY) || 'null');
    if (!stored || !Array.isArray(stored.messages) || !stored.messages.every(isStoredMessage)) return null;
    if (stored.previousResponseId !== null && typeof stored.previousResponseId !== 'string') return null;
    return {
      messages: stored.messages,
      previousResponseId: stored.previousResponseId ?? null,
    };
  } catch {
    return null;
  }
}

export function saveAiGuideSession(session, storage = browserSessionStorage()) {
  if (!storage || !session || !Array.isArray(session.messages)) return;

  try {
    storage.setItem(AI_GUIDE_SESSION_STORAGE_KEY, JSON.stringify({
      messages: session.messages,
      previousResponseId: session.previousResponseId ?? null,
    }));
  } catch {
    // The chat remains usable in memory when session storage is unavailable or full.
  }
}
