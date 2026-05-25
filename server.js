const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE server running on port ${PORT}`);

/*
 * GAME STATE
 */
const gameState = {
  players: {
    Grunt1: { stress: 0, permanent: true },
    Grunt2: { stress: 0, permanent: true },
    Grunt3: { stress: 0, permanent: true },
    Grunt4: { stress: 0, permanent: true }
  },

  history: []
};

/*
 * HELPERS
 */

function rollDice(n) {
  return Array.from(
    { length: Math.max(0, Number(n) || 0) },
    () => Math.floor(Math.random() * 6) + 1
  );
}

function count(arr, value) {
  return arr.filter(x => x === value).length;
}

function broadcast(msg) {
  const json = JSON.stringify(msg);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function sendState() {
  broadcast({
    type: "state",
    state: gameState
  });
}

/*
 * CHARACTER MANAGEMENT
 */

function createCharacter(name) {
  if (!name) return;
  if (gameState.players[name]) return;

  gameState.players[name] = {
    stress: 0,
    permanent: false
  };

  sendState();
}

function deleteCharacter(name) {
  const p = gameState.players[name];

  if (!p) return;

  // prevent deleting PCs if you want strict mode
  if (p.permanent) return;

  delete gameState.players[name];

  sendState();
}

function addStress(name) {
  const p = gameState.players[name];
  if (!p) return;

  p.stress++;

  sendState();
}

function removeStress(name) {
  const p = gameState.players[name];
  if (!p) return;

  p.stress = Math.max(0, p.stress - 1);

  sendState();
}

function setStress(name, value) {
  const p = gameState.players[name];
  if (!p) return;

  p.stress = Math.max(0, Number(value) || 0);

  sendState();
}

/*
 * ROLL ENGINE
 */

function performRoll(name, basicDice) {

  const p = gameState.players[name];
  if (!p) return;

  const basic = rollDice(basicDice);
  const stress = rollDice(p.stress);

  const roll = {
    name,

    basic,
    stress,

    stressLevel: p.stress,

    successes:
      count(basic, 6) +
      count(stress, 6),

    banes:
      count(stress, 1),

    time: new Date().toLocaleTimeString()
  };

  gameState.history.push(roll);

  if (gameState.history.length > 200) {
    gameState.history.shift();
  }

  broadcast({
    type: "roll",
    roll
  });
}

/*
 * COMMAND ROUTER
 */

function handleCommand(msg) {

  switch (msg.type) {

    case "roll":
      performRoll(msg.player, msg.basic);
      break;

    case "addStress":
      addStress(msg.name);
      break;

    case "removeStress":
      removeStress(msg.name);
      break;

    case "setStress":
      setStress(msg.name, msg.value);
      break;

    case "createCharacter":
      createCharacter(msg.name);
      break;

    case "deleteCharacter":
      deleteCharacter(msg.name);
      break;

    default:
      console.log("Unknown command:", msg.type);
  }
}

/*
 * CONNECTIONS
 */

wss.on("connection", (ws) => {

  console.log("Client connected");

  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", (raw) => {

    try {

      const msg = JSON.parse(raw.toString());

      console.log("RECEIVED:", msg);

      handleCommand(msg);

    } catch (err) {

      console.log("BAD MESSAGE:", err);

    }

  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

});

console.log("Server ready");
