// Простий кеш у пам'яті процесу: обмежений розмір + час життя запису.
// Диск не використовується. Один запис — кілька кілобайт, тож 500 записів
// це одиниці мегабайт.
//
// Витіснення: LRU — при переповненні викидається запис, до якого найдовше
// не зверталися. Кожне читання оновлює "свіжість" запису.
//
// ВАЖЛИВО: кешуємо лише те, що не псується — адресу OFT-адаптера і перелік
// мереж токена. Комісії (nativeFee) та баланси НЕ кешуються ніколи: вони
// залежать від ціни газу і застаріють за хвилини.

export class TtlCache {
  constructor({ max = 500, ttlMs = 60 * 60 * 1000, name = 'cache' } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.name = name;
    this.map = new Map(); // key -> { value, expires }
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // перевставлення = позначка "щойно використано" (Map тримає порядок вставки)
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    // витіснення найдавніше використаних
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); }

  stats() {
    const total = this.hits + this.misses;
    return {
      name: this.name,
      size: this.map.size,
      max: this.max,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? +(this.hits / total * 100).toFixed(1) : 0,
    };
  }
}

// Адаптер OFT для токена. Практично незмінний — тримаємо добу.
export const oftCache = new TtlCache({ max: 1000, ttlMs: 24 * 60 * 60 * 1000, name: 'oft' });

// Перелік мереж токена. Може змінитися, якщо проєкт додасть нову мережу,
// тому година — компроміс між свіжістю і навантаженням.
export const routesCache = new TtlCache({ max: 500, ttlMs: 60 * 60 * 1000, name: 'routes' });

export function cacheStats() {
  return [oftCache.stats(), routesCache.stats()];
}
