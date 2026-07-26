import { useEffect, useState } from "react";
import type { Item } from "../../src/app.js";

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

  return (
    <main>
      <h1>Feed Reader</h1>
      <ul data-testid="item-list">
        {items.map((item) => (
          <li key={item.id} data-testid="item">
            <a href={item.link ?? "#"} target="_blank" rel="noreferrer">
              {item.title}
            </a>
            <span>{item.feedTitle}</span>
            <time>{item.published}</time>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>Nothing to read yet.</p>}
    </main>
  );
}
