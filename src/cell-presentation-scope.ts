// A strictly synchronous lazy read group. Each slot retains only successful
// results while the same read fence and selection are current.
export function cellPresentationScope(current: () => boolean) {
  let open = true, reading = false;
  return {
    slot<T>() {
      let ready = false, value: T;
      return (read: () => T, fallback: () => T): T => {
        if (!open || reading || !current()) return fallback();
        if (ready) return value;
        reading = true;
        try {
          const next = read();
          if (!open || !current()) return fallback();
          ready = true;
          return value = next;
        } finally { reading = false; }
      };
    },
    close() { open = false; },
  };
}
