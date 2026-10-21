// Small per-browser preferences in localStorage. Persistence is a convenience: when storage is
// unavailable, reads give null and writes are dropped.

export function getPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is a convenience.
  }
}
