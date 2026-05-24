const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE server running on port ${PORT}`);

// 🧠 session history stored in memory
const history = [];

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

  // 1. send full history to new client
  ws.send(JSON.stringify({
    type: "history",
    history
  }));

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // basic validation
      if (!data.basic || !data.stress) return;

      // attach timestamp if missing
      data.time = data.time || new Date().toLocaleTimeString();

      // 2. store roll in history
      history.push(data);

      // optional: prevent unlimited memory growth
      if (history.length > 200) history.shift();

      // 3. broadcast to all clients
      broadcast(data);

    } catch (e) {
      console.log("Invalid message received");
    }
  });
});

wss.on("error", console.error);
