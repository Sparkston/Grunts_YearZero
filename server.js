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

  // send history on connect
  ws.send(JSON.stringify({
    type: "history",
    history
  }));

    ws.on("message", (raw) => {
    console.log("RAW MESSAGE RECEIVED");
    console.log(raw.toString());
  });
});
