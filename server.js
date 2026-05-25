const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE server running on port ${PORT}`);

/* ---------------- STATE ---------------- */

const gameState = {
  actors: {
    Grunt1: { type: "pc", stress: 0 },
    Grunt2: { type: "pc", stress: 0 },
    Grunt3: { type: "pc", stress: 0 },
    Grunt4: { type: "pc", stress: 0 }
  },

  turnOrder: ["Grunt1", "Grunt2", "Grunt3", "Grunt4"],
  currentTurnIndex: 0,

  history: []
};

/* ---------------- UTIL ---------------- */

function rollDice(n) {
  return Array.from(
    { length: Math.max(0, Number(n) || 0) },
    () => Math.floor(Math.random() * 6) + 1
  );
}

function count(arr, v) {
  return arr.filter(x => x === v).length;
}

function broadcast(msg) {
  const json = JSON.stringify(msg);

  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(json);
    }
  }
}

function sendState() {
  broadcast({ type: "state", state: gameState });
}

/* ---------------- CORE ROLL ENGINE ---------------- */

function performRoll({ name, basic = 0, noStress = false }) {

  const actor = gameState.actors[name];

  const basicDice = rollDice(basic);

  const stressDice =
    actor && actor.type === "pc" && !noStress
      ? rollDice(actor.stress)
      : [];

  const roll = {
    name,
    basic: basicDice,
    stress: stressDice,

    stressLevel: actor?.stress ?? 0,

    successes:
      count(basicDice, 6) +
      count(stressDice, 6),

    banes:
      count(stressDice, 1),

    time: new Date().toLocaleTimeString()
  };

  gameState.history.push(roll);

  if (gameState.history.length > 200) {
    gameState.history.shift();
  }

  broadcast({ type: "roll", roll });
}

/* ---------------- ACTORS ---------------- */

function createActor(name) {

  let finalName = (name || "").trim();

  if (!finalName) {
    finalName = `Actor ${Math.floor(Math.random() * 10000)}`;
  }

  if (gameState.actors[finalName]) {
    finalName += ` ${Date.now()}`;
  }

  gameState.actors[finalName] = {
    type: "npc",
    stress: 0
  };

  gameState.turnOrder.push(finalName);

  sendState();
}

function removeActor(name) {

  const a = gameState.actors[name];
  if (!a) return;

  if (a.type === "pc") return; // HARD GUARD

  delete gameState.actors[name];

  gameState.turnOrder =
    gameState.turnOrder.filter(n => n !== name);

  if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
    gameState.currentTurnIndex = 0;
  }

  sendState();
}

/* ---------------- INITIATIVE ---------------- */

function shuffleInitiative() {

  gameState.turnOrder =
    [...gameState.turnOrder].sort(() => Math.random() - 0.5);

  gameState.currentTurnIndex = 0;

  sendState();
}

function nextTurn() {

  if (!gameState.turnOrder.length) return;

  gameState.currentTurnIndex++;

  if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
    gameState.currentTurnIndex = 0;
  }

  sendState();
}

/* ---------------- MESSAGE HANDLER ---------------- */

function handle(msg) {

  console.log("MSG:", msg.type);

  switch (msg.type) {

    case "roll":
      performRoll({
        name: msg.player,
        basic: msg.basic
      });
      break;

    case "adHocRoll":
      performRoll({
        name: "Ad Hoc",
        basic: msg.basic,
        noStress: true
      });
      break;

    case "createActor":
      createActor(msg.name);
      break;

    case "removeActor":
      removeActor(msg.name);
      break;

    case "setStress":
      if (gameState.actors[msg.name]) {
        gameState.actors[msg.name].stress =
          Math.max(0, msg.stress);
        sendState();
      }
      break;

    case "shuffleInitiative":
      shuffleInitiative();
      break;

    case "nextTurn":
      nextTurn();
      break;
  }
}

/* ---------------- CONNECTIONS ---------------- */

wss.on("connection", ws => {

  console.log("Client connected");

  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", raw => {

    try {
      const msg = JSON.parse(raw.toString());
      handle(msg);
    } catch (e) {
      console.log("BAD MESSAGE:", e);
    }

  });

});
