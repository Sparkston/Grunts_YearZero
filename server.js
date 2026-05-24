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
      const data = JSON.parse(raw.toString());

      if (!data.basic || !data.stress) return;

      const roll = {
        type: "roll",
        data: {
          ...data,
          time: new Date().toLocaleTimeString()
        }
      };

      history.push(roll.data);

      if (history.length > 200) history.shift();

      broadcast(roll);

    } catch (e) {
      console.log("bad message");
    }
  });
});
