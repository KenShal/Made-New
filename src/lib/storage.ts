/** localStorage wrapper that never throws (private mode, quotas, disabled storage). Never store credentials here. */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  session: {
    get(key: string): string | null {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
  },
};
