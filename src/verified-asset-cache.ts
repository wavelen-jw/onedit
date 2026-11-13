// Only curated static bytes enter this cache. It contains no document, local
// font, initialized WASM instance or claim that a browser decoded a font.
const database = 'rhwp.verified-static-bytes.v1';
const store = 'assets';
const storageBudget = 1000;

function openStorage(): Promise<IDBDatabase | undefined> {
  return new Promise(resolve => {
    let done = false;
    const finish = (db?: IDBDatabase) => {
      if (done) { db?.close(); return; }
      done = true; clearTimeout(timer); resolve(db);
    };
    const timer = setTimeout(() => finish(), storageBudget);
    try {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        finish(request.result);
      };
      request.onerror = request.onblocked = () => finish();
    } catch { finish(); }
  });
}

async function storage(key: string, action: 'get' | 'put' | 'delete', bytes?: ArrayBuffer): Promise<unknown> {
  const db = await openStorage();
  if (!db) return;
  return new Promise(resolve => {
    let done = false, value: unknown, transaction: IDBTransaction | undefined;
    const finish = (result?: unknown) => {
      if (done) return;
      done = true; clearTimeout(timer); db.close(); resolve(result);
    };
    const timer = setTimeout(() => {
      try { transaction?.abort(); } catch { /* Already completed. */ }
      finish();
    }, storageBudget);
    try {
      transaction = db.transaction(store, action === 'get' ? 'readonly' : 'readwrite');
      const objects = transaction.objectStore(store);
      const request = action === 'get' ? objects.get(key) : action === 'put' ? objects.put(bytes, key) : objects.delete(key);
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => finish(value);
      transaction.onabort = transaction.onerror = () => finish();
    } catch { finish(); }
  });
}

async function matches(bytes: ArrayBuffer, sha256: string) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') === sha256;
}

// Same URL+hash may survive a UI-only build. A changed expected hash never reads
// the previous entry. Verify on read as well as write; metadata is not proof.
export async function verifiedAssetBytes(url: URL, sha256: string, kind: 'wasm' | 'font', signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error('검증 자산 주소 또는 SHA가 올바르지 않습니다.');
  const key = JSON.stringify([kind, url.href, sha256]);
  const cached = await storage(key, 'get');
  signal?.throwIfAborted();
  if (cached !== undefined) {
    if (cached instanceof ArrayBuffer && await matches(cached, sha256)) return new Uint8Array(cached);
    await storage(key, 'delete');
  }
  const versioned = new URL(url);
  versioned.searchParams.set('rhwp-sha256', sha256);
  const response = await fetch(versioned, { signal });
  if (!response.ok) throw Error(`${kind === 'font' ? 'font' : 'Core 읽기 실패:'} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal?.throwIfAborted();
  if (!await matches(bytes, sha256))
    throw Error(kind === 'font' ? 'font source identity mismatch' : '고정 개발 Core와 실제 로드한 WASM이 일치하지 않습니다. 문서를 열지 않습니다.');
  signal?.throwIfAborted();
  // A transaction commits only this complete, checked response. Storage failures
  // cannot prevent the verified network bytes being used or enable stale bytes.
  await storage(key, 'put', bytes);
  return new Uint8Array(bytes);
}
