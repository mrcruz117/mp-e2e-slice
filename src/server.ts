import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/feeds.db";

// dist/server/server.js -> dist/web
const WEB_ROOT = fileURLToPath(new URL("../web", import.meta.url));

const app = createApp({ databasePath: DATABASE_PATH });

await app.register(fastifyStatic, { root: WEB_ROOT });

// Render reaches the container only on 0.0.0.0.
await app.listen({ host: "0.0.0.0", port: PORT });
