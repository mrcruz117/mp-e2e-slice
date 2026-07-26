import { useEffect, useState } from "react";
import type { Item } from "../../src/items.js";

export function App() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/items", { signal: controller.signal })
      .then((response) => response.json() as Promise<Item[]>)
      .then(setItems)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Could not load Items", error);
        }
      });
    return () => {
      controller.abort();
    };
  }, []);

  // The click keeps its default behaviour — the browser opens the new tab —
  // and the mark is fire-and-forget so nothing waits on the round trip.
  function markRead(id: number) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    fetch(`/api/items/${String(id)}/read`, { method: "POST" }).catch(
      (error: unknown) => {
        console.error("Could not mark the Item read", error);
      },
    );
  }

  return (
    <main>
      <h1>Feed Reader</h1>
      <ul data-testid="item-list">
        {items.map((item) => (
          <li key={item.id} data-testid="item" data-read={String(item.read)}>
            <a
              data-testid="item-title"
              href={item.link ?? undefined}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                markRead(item.id);
              }}
            >
              {item.title ?? "(untitled)"}
            </a>
            <p className="meta">
              <span data-testid="feed-title">{item.feedTitle}</span>
              <time
                data-testid="item-published"
                dateTime={item.published ?? ""}
              >
                {item.published === null
                  ? ""
                  : new Date(item.published).toDateString()}
              </time>
            </p>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>Nothing to read yet.</p>}
    </main>
  );
}
