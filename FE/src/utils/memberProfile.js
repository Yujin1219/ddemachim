export function normalizeMemberProfile(value) {
  if (!value || typeof value !== 'object') return null;

  const nickname = typeof value.nickname === 'string' ? value.nickname.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const memberId = value.memberId ?? null;
  if (!nickname && !email && memberId === null) return null;

  return { ...value, nickname, email, memberId };
}

export function profileInitial(nickname) {
  const initial = Array.from(String(nickname ?? '').trim())[0];
  return initial ? initial.toUpperCase() : '?';
}
