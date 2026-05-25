const WebSocket = require("ws");
const panicTable = require("./panicTable");
const criticalTable = require("./criticalTable");

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

/* ---------------- CLIENT ROLES ---------------- */

const clients = new Map(); // ws -> { role }

function getRole(ws) {
  return clients.get(ws)?.role || "player";
}

/* ---------------- CORE UTIL ---------------- */

function rollDice(n) {
  return Array.from(
    { length: Math.max(0, Number(n) || 0) },
    () => Math.floor(Math.random() * 6) + 1
  );
}

function count(arr, v) {
  return arr.filter(x => x === v).length;
}

function broadcastState() {
  const msg = JSON.stringify({
    type: "state",
    state: gameState
  });

  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  }
}

/* ---------------- HISTORY (CRITICAL FIX) ---------------- */

function pushHistory(entry) {
  if (!entry || !entry.name) {
    console.log("BLOCKED INVALID HISTORY ENTRY:", entry);
    return;
  }

  gameState.history.push(entry);

  if (gameState.history.length > 200) {
    gameState.history = gameState.history.slice(-200);
  }

  broadcastState();
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

  const d6 = Math.floor(Math.random() * 6) + 1;
  const total = d6 + actor.stress;

  pushHistory({
    name: `${name} Panic Test`,
    dice: d6,
    stress: actor.stress,
    total,
    resultText: resolvePanic(total),
    time: new Date().toLocaleTimeString()
  });
}

/* ---------------- CRITICAL ---------------- */

function rollD66() {
  return (Math.floor(Math.random() * 6) + 1) * 10 +
         (Math.floor(Math.random() * 6) + 1);
}

function performCritical() {
  const d66 = rollD66();
  const injury = criticalTable[d66];
  if (!injury) return;

  pushHistory({
    name: "Critical Injury",
    d66,
    ...injury,
    time: new Date().toLocaleTimeString()
  });
}

/* ---------------- ROLL (FIXED INPUT NORMALISATION) ---------------- */

function performRoll({ name, basic = 0, noStress = false }) {
  const actor = gameState.actors[name];

  const basicDice = rollDice(basic);

  const stressDice =
    actor && actor.type === "pc" && !noStress
      ? rollDice(actor.stress)
      : [];

  const entry = {
    name,
    basic: basicDice,
    stress: stressDice,
    successes: count(basicDice, 6) + count(stressDice, 6),
    banes: count(stressDice, 1),
    time: new Date().toLocaleTimeString()
  };

  pushHistory(entry);
}

/* ---------------- ACTORS ---------------- */

function createActor(name) {
  let finalName = (name || "").trim() || `Actor ${Math.floor(Math.random() * 10000)}`;
  if (gameState.actors[finalName]) finalName += ` ${Date.now()}`;

  gameState.actors[finalName] = { type: "npc", stress: 0 };
  gameState.turnOrder.push(finalName);

  broadcastState();
}

function removeActor(name) {
  if (!gameState.actors[name]) return;
  if (gameState.actors[name].type === "pc") return;

  delete gameState.actors[name];
  gameState.turnOrder = gameState.turnOrder.filter(n => n !== name);

  broadcastState();
}

/* ---------------- INITIATIVE ---------------- */

function shuffleInitiative() {
  gameState.turnOrder.sort(() => Math.random() - 0.5);
  gameState.currentTurnIndex = 0;
  broadcastState();
}

function nextTurn() {
  gameState.currentTurnIndex++;
  if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
    gameState.currentTurnIndex = 0;
  }
  broadcastState();
}

/* ---------------- MESSAGE HANDLER ---------------- */

function handle(ws, msg) {
  switch (msg.type) {

    case "setRole":
      clients.set(ws, { role: msg.role || "player" });
      break;

    case "roll": {
      const name = msg.name || msg.player;
      if (!name) return;

      performRoll({
        name,
        basic: Number(msg.basic) || 0
      });
      break;
    }

    case "adHocRoll":
      performRoll({
        name: "Ad Hoc",
        basic: Number(msg.basic) || 0,
        noStress: true
      });
      break;

    case "panic":
      performPanic(msg.name);
      break;

    case "critical":
      performCritical();
      break;

    case "createActor":
      createActor(msg.name);
      break;

    case "removeActor":
      removeActor(msg.name);
      break;

    case "setStress":
      if (getRole(ws) !== "gm") return;

      if (gameState.actors[msg.name]) {
        gameState.actors[msg.name].stress = Math.max(0, msg.stress);
        broadcastState();
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
  clients.set(ws, { role: "player" });

  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", raw => {
    try {
      handle(ws, JSON.parse(raw.toString()));
    } catch (e) {
      console.log("BAD MESSAGE:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});const WebSocket = require("ws");
const panicTable = require("./panicTable");
const criticalTable = require("./criticalTable");

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

/* ---------------- CLIENT ROLES ---------------- */

const clients = new Map(); 
// ws -> { role: "gm" | "player" }

function getRole(ws) {
  return clients.get(ws)?.role || "player";
}

/* ---------------- UTIL ---------------- */

function rollDice(n) {
  return Array.from({ length: Math.max(0, Number(n) || 0) },
    () => Math.floor(Math.random() * 6) + 1
  );
}

function count(arr, v) {
  return arr.filter(x => x === v).length;
}

function broadcastState() {
  const msg = JSON.stringify({
    type: "state",
    state: gameState
  });

  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  }
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

  const d6 = Math.floor(Math.random() * 6) + 1;
  const total = d6 + actor.stress;

  gameState.history.push({
    name: `${name} Panic Test`,
    dice: d6,
    stress: actor.stress,
    total,
    resultText: resolvePanic(total),
    time: new Date().toLocaleTimeString()
  });

  broadcastState();
}

/* ---------------- CRITICAL ---------------- */

function rollD66() {
  const a = Math.floor(Math.random() * 6) + 1;
  const b = Math.floor(Math.random() * 6) + 1;
  return a * 10 + b;
}

function performCritical() {
  const d66 = rollD66();
  const injury = criticalTable[d66];
  if (!injury) return;

  gameState.history.push({
    name: "Critical Injury",
    d66,
    ...injury,
    time: new Date().toLocaleTimeString()
  });

  broadcastState();
}

/* ---------------- CORE ROLL ---------------- */

function performRoll({ name, basic = 0, noStress = false }) {
  const actor = gameState.actors[name];

  const basicDice = rollDice(basic);
  const stressDice =
    actor && actor.type === "pc" && !noStress
      ? rollDice(actor.stress)
      : [];

  gameState.history.push({
    name,
    basic: basicDice,
    stress: stressDice,
    successes: count(basicDice, 6) + count(stressDice, 6),
    banes: count(stressDice, 1),
    time: new Date().toLocaleTimeString()
  });

  broadcastState();
}

/* ---------------- ACTORS ---------------- */

function createActor(name) {
  let finalName = (name || "").trim() || `Actor ${Math.floor(Math.random()*10000)}`;
  if (gameState.actors[finalName]) finalName += ` ${Date.now()}`;

  gameState.actors[finalName] = { type: "npc", stress: 0 };
  gameState.turnOrder.push(finalName);

  broadcastState();
}

function removeActor(name) {
  if (!gameState.actors[name]) return;
  if (gameState.actors[name].type === "pc") return;

  delete gameState.actors[name];
  gameState.turnOrder = gameState.turnOrder.filter(n => n !== name);

  broadcastState();
}

/* ---------------- INITIATIVE ---------------- */

function shuffleInitiative() {
  gameState.turnOrder.sort(() => Math.random() - 0.5);
  gameState.currentTurnIndex = 0;
  broadcastState();
}

function nextTurn() {
  gameState.currentTurnIndex++;
  if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
    gameState.currentTurnIndex = 0;
  }
  broadcastState();
}

/* ---------------- MESSAGE HANDLER ---------------- */

function handle(ws, msg) {

  switch (msg.type) {

    case "setRole":
      clients.set(ws, { role: msg.role || "player" });
      break;

    case "roll":
      performRoll({
        name: msg.name,
        basic: msg.basic
      });
      break;

    case "adHocRoll":
      performRoll({ name: "Ad Hoc", basic: msg.basic, noStress: true });
      break;

    case "panic":
      performPanic(msg.name);
      break;

    case "critical":
      performCritical();
      break;

    case "createActor":
      createActor(msg.name);
      break;

    case "removeActor":
      removeActor(msg.name);
      break;

    case "setStress":
      if (getRole(ws) !== "gm") return;

      if (gameState.actors[msg.name]) {
        gameState.actors[msg.name].stress = Math.max(0, msg.stress);
        broadcastState();
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

  clients.set(ws, { role: "player" });

  ws.send(JSON.stringify({
    type: "state",
    state: gameState
  }));

  ws.on("message", raw => {
    try {
      handle(ws, JSON.parse(raw.toString()));
    } catch (e) {
      console.log("BAD MESSAGE:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});
