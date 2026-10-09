export interface SessionUser {
  id: string;
  username: string;
  email: string;
}

export function readSessionUser(): SessionUser | null {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const user: unknown = JSON.parse(stored);
    if (typeof user !== 'object' || user === null) return null;
    if ('id' in user && typeof user.id === 'string'
      && 'username' in user && typeof user.username === 'string'
      && 'email' in user && typeof user.email === 'string') {
      return { id: user.id, username: user.username, email: user.email };
    }
  } catch {
    // Invalid browser storage should be treated as a signed-out session.
  }
  return null;
}
