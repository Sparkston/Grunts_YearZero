const WebSocket = require("ws");
const panicTable = require("./panicTable");

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

/* ---------------- PANIC ---------------- */

function resolvePanic(total) {

  for (const row of panicTable) {
    if (total >= row.min && total <= row.max) {
      return row.text;
    }
  }

  return "No effect.";
}

function performPanic(name) {

  const actor = gameState.actors[name];
  if (!actor) return;

  const stress = actor.stress || 0;

  const d6 = Math.floor(Math.random() * 6) + 1;
  const total = d6 + stress;

  const resultText = resolvePanic(total);

  const roll = {
    name: `${name} Panic Test`,

    dice: d6,
    stress,
    total,

    resultText,
    time: new Date().toLocaleTimeString()
  };

  gameState.history.push(roll);
  if (gameState.history.length > 200) {
    gameState.history.shift();
  }

  broadcast({ type: "roll", roll });
}

/* ---------------- CORE ROLL ---------------- */

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

  if (a.type === "pc") return;

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

  switch (msg.type) {

    case "roll":
      performRoll(msg);
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

    case "panic":
      performPanic(msg.name);
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

  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", raw => {
    try {
      handle(JSON.parse(raw.toString()));
    } catch (e) {
      console.log("BAD MESSAGE:", e);
    }
  });

});
