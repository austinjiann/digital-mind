import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3001", 10);

export default {
  port,
  fetch: app.fetch,
};
