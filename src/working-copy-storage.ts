const maxAge = 7 * 24 * 60 * 60 * 1000;
const maxCopies = 8;
export const maxWorkingCopySize = 30 * 1024 * 1024;

export type WorkingCopy = {
  id: string;
  token: string;
  name: string;
  updatedAt: number;
};
const expired = (copy: WorkingCopy) => copy.updatedAt <= Date.now() - maxAge;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("onedit.working-copies.v1", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore("copies", { keyPath: "id" });
      request.result.createObjectStore("contents");
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) db.close();
      else resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(Error("브라우저의 복구본 보관함을 열 수 없습니다."));
    };
  });
}

function withResult<T>(request: IDBRequest<T>, next: (result: T) => void) {
  request.onsuccess = () => next(request.result);
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (copies: IDBObjectStore, contents: IDBObjectStore, done: (value: T) => void) => void,
) {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["copies", "contents"], mode, mode === "readwrite" ? { durability: "strict" } : undefined);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? Error("복구본 보관이 취소되었습니다."));
      try {
        run(tx.objectStore("copies"), tx.objectStore("contents"), value => { result = value; });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

function remove(copies: IDBObjectStore, contents: IDBObjectStore, id: string) {
  copies.delete(id);
  contents.delete(id);
}

function liveCopies(copies: IDBObjectStore, contents: IDBObjectStore, read: (items: WorkingCopy[]) => void) {
  withResult(copies.getAll() as IDBRequest<WorkingCopy[]>, existing => {
    const items = existing.filter(copy => {
      if (!expired(copy)) return true;
      remove(copies, contents, copy.id);
      return false;
    });
    read(items);
  });
}

export function listWorkingCopies() {
  return transaction<WorkingCopy[]>("readwrite", (copies, contents, done) => {
    liveCopies(copies, contents, items => done(items.sort((a, b) => b.updatedAt - a.updatedAt)));
  });
}

export function readWorkingCopy(copy: WorkingCopy) {
  return transaction<Uint8Array | undefined>("readonly", (copies, contents, done) => {
    withResult(copies.get(copy.id) as IDBRequest<WorkingCopy | undefined>, current => {
      if (current?.token !== copy.token || expired(current)) return done(undefined);
      withResult(contents.get(copy.id), value => done(
        value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= maxWorkingCopySize
          ? value : undefined,
      ));
    });
  });
}

export function writeWorkingCopy(copy: WorkingCopy, bytes: Uint8Array, previousToken?: string) {
  return transaction<"saved" | "changed" | "full">("readwrite", (copies, contents, done) => {
    liveCopies(copies, contents, items => {
      const current = items.find(item => item.id === copy.id);
      if (current?.token !== previousToken) return done("changed");
      if (!current && items.length >= maxCopies) return done("full");
      copies.put(copy);
      contents.put(bytes, copy.id);
      done("saved");
    });
  });
}

export function removeWorkingCopy(copy: WorkingCopy) {
  return transaction<boolean>("readwrite", (copies, contents, done) => {
    withResult(copies.get(copy.id) as IDBRequest<WorkingCopy | undefined>, current => {
      if (current?.token !== copy.token) return done(false);
      remove(copies, contents, copy.id);
      done(true);
    });
  });
}
