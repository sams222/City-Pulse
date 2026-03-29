/** Firebase Auth requires an email; we derive a stable synthetic address from username. */
export function usernameToEmail(username: string): string {
  const s = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (s.length < 3) {
    throw new Error('Username must be at least 3 letters or numbers.');
  }
  if (s.length > 32) {
    throw new Error('Username is too long.');
  }
  return `${s}@citypulse.app`;
}

export function displayUsernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.split('@')[0] ?? email;
}
