'use strict';

/**
 * Metro can request hundreds of transform-cache entries concurrently while it
 * discovers a large dependency graph. On Windows, every disk-backed cache read
 * consumes a file handle and the burst can exceed the process handle budget.
 *
 * This adapter preserves Expo's persistent cache while applying backpressure to
 * cache reads and writes. `clear` intentionally preserves Metro's synchronous
 * cache-store contract; Metro only calls it while resetting the bundler.
 */
class BoundedCacheStore {
  constructor(store, options = {}) {
    const maxConcurrency = options.maxConcurrency ?? 8;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError('maxConcurrency must be a positive integer');
    }

    this.store = store;
    this.maxConcurrency = maxConcurrency;
    this.activeOperations = 0;
    this.queue = [];
    this.name = `Bounded${store.name ?? store.constructor?.name ?? 'CacheStore'}`;
  }

  get(key) {
    return this.run(() => this.store.get(key));
  }

  set(key, value) {
    return this.run(() => this.store.set(key, value));
  }

  clear() {
    return this.store.clear();
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    if (this.queue.length === 0) return;

    while (
      this.activeOperations < this.maxConcurrency
      && this.queue.length > 0
    ) {
      this.execute(this.queue.shift());
    }
  }

  execute(operation) {
    this.activeOperations += 1;

    Promise.resolve()
      .then(operation.task)
      .then(operation.resolve, operation.reject)
      .finally(() => {
        this.activeOperations -= 1;
        this.pump();
      });
  }
}

const boundCacheStores = (stores, options) =>
  stores.map((store) => new BoundedCacheStore(store, options));

module.exports = { BoundedCacheStore, boundCacheStores };
