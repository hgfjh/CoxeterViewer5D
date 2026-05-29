export interface LruCacheOptions {
  maxEntries: number;
}

export class LruCache<K, V> {
  private readonly values = new Map<K, V>();
  private readonly maxEntries: number;

  constructor(options: LruCacheOptions) {
    this.maxEntries = Math.max(1, Math.trunc(options.maxEntries));
  }

  get size() {
    return this.values.size;
  }

  get(key: K): V | undefined {
    if (!this.values.has(key)) {
      return undefined;
    }
    const value = this.values.get(key) as V;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.values.has(key);
  }

  set(key: K, value: V): void {
    if (this.values.has(key)) {
      this.values.delete(key);
    }
    this.values.set(key, value);
    this.trim();
  }

  delete(key: K): boolean {
    return this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  keys(): K[] {
    return [...this.values.keys()];
  }

  entries(): Array<[K, V]> {
    return [...this.values.entries()];
  }

  private trim(): void {
    while (this.values.size > this.maxEntries) {
      const oldestKey = this.values.keys().next().value as K | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.values.delete(oldestKey);
    }
  }
}
