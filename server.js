const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE server running on port ${PORT}`);

/*
 * GAME STATE
 */
const gameState = {
  players: {
    Grunt1: { stress: 0 },
    Grunt2: { stress: 0 },
    Grunt3: { stress: 0 },
    Grunt4: { stress: 0 }
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

function broadcast(message) {
  const json = JSON.stringify(message);

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
 * GAME COMMANDS
 */

function addStress(playerName) {
  const player = gameState.players[playerName];
  if (!player) return;

  player.stress++;

  sendState();
}

function removeStress(playerName) {
  const player = gameState.players[playerName];
  if (!player) return;

  player.stress = Math.max(0, player.stress - 1);

  sendState();
}

function setStress(playerName, value) {
  const player = gameState.players[playerName];
  if (!player) return;

  player.stress = Math.max(0, Number(value) || 0);

  sendState();
}

function performRoll(playerName, basicDice) {

  const player = gameState.players[playerName];
  if (!player) return;

  const basic = rollDice(basicDice);
  const stress = rollDice(player.stress);

  const roll = {
    name: playerName,

    basic,
    stress,

    stressLevel: player.stress,

    successes:
      count(basic, 6) +
      count(stress, 6),

    banes:
      count(stress, 1),

    time:
      new Date().toLocaleTimeString()
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
 * COMMAND DISPATCHER
 */

function handleCommand(msg) {

  switch (msg.type) {

    case "roll":
      performRoll(
        msg.player,
        msg.basic
      );
      break;

    case "addStress":
      addStress(
        msg.player
      );
      break;

    case "removeStress":
      removeStress(
        msg.player
      );
      break;

    case "setStress":
      setStress(
        msg.player,
        msg.value
      );
      break;

    default:
      console.log(
        "Unknown command:",
        msg.type
      );
  }
}

/*
 * CONNECTION HANDLING
 */

wss.on("connection", (ws) => {

  console.log("Client connected");

  // Send complete game state
  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", (raw) => {

    try {

      const msg =
        JSON.parse(raw.toString());

      console.log(
        "RECEIVED:",
        msg
      );

      handleCommand(msg);

    }
    catch (err) {

      console.log(
        "BAD MESSAGE:",
        err
      );

    }

  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

});

console.log("Server ready");
