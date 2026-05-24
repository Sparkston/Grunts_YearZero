const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const history = [];

console.log(`YZE server running on port ${PORT}`);

function broadcast(msg) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  // send full history once
  ws.send(JSON.stringify({
    type: "history",
    history
  }));

  ws.on("message", (raw) => {
  try {
    const msg = JSON.parse(raw.toString());

    console.log("RECEIVED:", msg);

    // IMPORTANT: extract payload correctly
    const d = msg.data;

    if (!d || !Array.isArray(d.basic) || !Array.isArray(d.stress)) {
      console.log("IGNORED INVALID MESSAGE");
      return;
    }

    const roll = {
      type: "roll",
      data: {
        ...d,
        time: new Date().toLocaleTimeString()
      }
    };

    history.push(roll.data);

    if (history.length > 200) history.shift();

    // broadcast to ALL clients
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(roll));
      }
    }

  } catch (e) {
    console.log("BAD MESSAGE", e);
  }
});
