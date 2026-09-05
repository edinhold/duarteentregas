/**
 * Safe wrapper around localStorage and sessionStorage to prevent crashes on:
 * - Safari Private Mode (SecurityError: The operation is insecure)
 * - Restricted WebViews / WKWebView
 * - QuotaExceededError
 * - Disabled cookies/storage
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryLocalStorage = new MemoryStorage();
const memorySessionStorage = new MemoryStorage();

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[App:storage] Error reading localStorage key "${key}":`, e);
    }
    return memoryLocalStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`[App:storage] Error writing localStorage key "${key}":`, e);
    }
    memoryLocalStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`[App:storage] Error removing localStorage key "${key}":`, e);
    }
    memoryLocalStorage.removeItem(key);
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`[App:storage] Error reading sessionStorage key "${key}":`, e);
    }
    return memorySessionStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`[App:storage] Error writing sessionStorage key "${key}":`, e);
    }
    memorySessionStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`[App:storage] Error removing sessionStorage key "${key}":`, e);
    }
    memorySessionStorage.removeItem(key);
  },
};
