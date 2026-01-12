import { handleConnection } from "./connection";

const port = parseInt(process.env.PORT || "3002", 10);

const server = Bun.serve({
  port,
  fetch(req, server) {
    // Upgrade to WebSocket
    if (server.upgrade(req)) {
      return;
    }
    return new Response("WebSocket server", { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
      (ws as any).data = { state: "IDLE" };
    },
    message(ws, message) {
      handleConnection(ws as any, message);
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});

console.log(`Agent running on ws://localhost:${server.port}`);
