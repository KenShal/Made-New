import type { SessionUser } from './auth';

/** Shared reference to the signed-in user for the demo platform adapter. */
let current: SessionUser | null = null;
export const getCurrentUser = () => current;
export const setCurrentUser = (u: SessionUser | null) => {
  current = u;
};
