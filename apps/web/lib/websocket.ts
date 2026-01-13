import type { ServerEvent, ClientEvent } from "@digital-mind/shared";

type EventHandler = (event: ServerEvent) => void;

export class AgentConnection {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  constructor(private url: string) {}

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("Connected to agent");
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (e) => {
      const event = JSON.parse(e.data) as ServerEvent;
      this.handlers.forEach((h) => h(event));
    };

    this.ws.onclose = () => {
      console.log("Disconnected from agent");
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        console.log(
          `Reconnecting in ${this.reconnectAttempts}s (attempt ${this.reconnectAttempts}/${this.maxReconnects})`
        );
        setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
      }
    };

    this.ws.onerror = (e) => {
      console.error("WebSocket error:", e);
    };
  }

  send(event: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    this.maxReconnects = 0; // Prevent reconnection
    this.ws?.close();
  }
}
