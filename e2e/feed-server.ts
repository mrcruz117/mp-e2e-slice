// A publisher on localhost, so the e2e run has Items to click without anyone
// stubbing the fetch: the app really does fetch these Feeds over HTTP.
//
// Serves the two Feed XML files next door, plus a page per Item so that
// clicking a title lands somewhere real instead of on a network error.
//
// The port is fixed because the Feed XML and e2e/feeds.local.json both spell it
// out; making it configurable would only let them disagree.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = 4175;

function feedXml(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`feeds/${name}`, import.meta.url)),
    "utf8",
  );
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", `http://127.0.0.1:${String(PORT)}`)
    .pathname;

  if (path === "/blog.xml" || path === "/notes.xml") {
    response.writeHead(200, { "content-type": "application/xml" });
    response.end(feedXml(path.slice(1)));
    return;
  }

  if (path.startsWith("/items/")) {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<!doctype html><title>${path.slice(7)}</title><h1>What the Item links to</h1>`,
    );
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

server.listen(PORT, "127.0.0.1");
