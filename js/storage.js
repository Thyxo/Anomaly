// Local persistence. Images live in IndexedDB as Blobs; the house description
// (rooms, layout, anomaly metadata) is one JSON-like record.
const Store = (() => {
  let dbPromise;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('anomaly-watch', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('images');
          req.result.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  return {
    putImage: (id, blob) => run('images', 'readwrite', s => s.put(blob, id)),
    getImage: id => run('images', 'readonly', s => s.get(id)),
    deleteImage: id => run('images', 'readwrite', s => s.delete(id)),
    saveHouse: house => run('meta', 'readwrite', s => s.put(house, 'house')),
    loadHouse: () => run('meta', 'readonly', s => s.get('house')),
    async clear() {
      await run('images', 'readwrite', s => s.clear());
      await run('meta', 'readwrite', s => s.clear());
    },
  };
})();
