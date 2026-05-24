const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

/**
 * Simple shared Year Zero Engine dice server
 * - receives roll payloads from clients
 * - broadcasts to all connected clients
 */

const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE dice server running on port ${PORT}`);

function broadcast(data) {
  const msg = JSON.stringify(data);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      /**
       * Expected payload shape:
       * {
       *   basic: number[],
       *   stress: number[],
       *   successes: number,
       *   banes: number,
       *   name?: string
       * }
       */

      // Basic validation (important for public hosting)
      if (!data || typeof data !== "object") return;
      if (!Array.isArray(data.basic)) return;
      if (!Array.isArray(data.stress)) return;

      // Limit payload size (basic abuse protection)
      if (data.basic.length > 100 || data.stress.length > 100) return;

      broadcast(data);
    } catch (e) {
      // ignore malformed messages
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

wss.on("error", (err) => {
  console.error("Server error:", err);
});