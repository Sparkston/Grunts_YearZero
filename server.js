const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const history = [];

console.log(`YZE server running on port ${PORT}`);

// --- broadcast helper ---
function broadcast(msg) {
  const data = JSON.stringify(msg);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// --- connection handler ---
wss.on("connection", (ws) => {
  console.log("Client connected");

  // send existing history immediately
  ws.send(JSON.stringify({
    type: "history",
    history
  }));

  // --- message handler ---
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      console.log("RECEIVED:", msg);

      const d = msg.data;

      // strict validation
      if (
        !d ||
        !Array.isArray(d.basic) ||
        !Array.isArray(d.stress)
      ) {
        console.log("IGNORED INVALID MESSAGE");
        return;
      }

      // construct final roll object
      const roll = {
        type: "roll",
        data: {
          name: d.name || "Unknown",
          basic: d.basic,
          stress: d.stress,
          successes: d.successes ?? 0,
          banes: d.banes ?? 0,
          time: d.time || new Date().toLocaleTimeString()
        }
      };

      // store history
      history.push(roll.data);

      if (history.length > 200) {
        history.shift();
      }

      // broadcast to all clients
      broadcast(roll);

    } catch (err) {
      console.log("BAD MESSAGE:", err);
    }
  });
});
