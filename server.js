const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const panicTable = require("./panicTable");
const criticalTable = require("./criticalTable");
const pcDefs = require("./playerCharacters");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`YZE server running on port ${PORT}`);

/* ---------------- PC STATE (PERSISTENT) ---------------- */

const pcStatePath = path.join(__dirname, "pcState.json");

function loadPCState() {
  try {
    return JSON.parse(fs.readFileSync(pcStatePath, "utf8"));
  } catch {
    return {};
  }
}

function savePCState() {
  fs.writeFileSync(pcStatePath, JSON.stringify(pcState, null, 2));
}

let pcState = loadPCState();

// ensure defaults
for (const id of Object.keys(pcDefs)) {
  if (!pcState[id]) {
    pcState[id] = {
      stress: 0,
      health: 5,
      starving: false,
      dehydrated: false,
      exhausted: false,
      freezing: false,
      criticalInjuries: []
    };
  }
}

/* ---------------- SESSION STATE (NPC ONLY) ---------------- */

const gameState = {
  actors: {},   // NPC ONLY
  turnOrder: [],
  currentTurnIndex: 0,
  history: []
};

/* ---------------- CLIENTS ---------------- */

const clients = new Map(); // ws -> { role, pc }

function getClient(ws) {
  return clients.get(ws) || { role: "player", pc: null };
}

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

/* ---------------- BROADCAST (SINGLE SOURCE OF TRUTH) ---------------- */

function broadcastState() {
  const msg = JSON.stringify({
    type: "state",
    state: gameState,
    pcs: pcState,
    pcDefs
  });

  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  }
}

/* ---------------- HISTORY ---------------- */

function pushHistory(entry) {
  if (!entry || !entry.name) return;

  gameState.history.push(entry);
  if (gameState.history.length > 200) {
    gameState.history = gameState.history.slice(-200);
  }

  broadcastState();
}

/* ---------------- PANIC ---------------- */

function resolvePanic(total) {
  for (const row of panicTable) {
    if (total >= row.min && total <= row.max) return row.text;
  }
  return "No effect.";
}

function performPanic(name) {
  const actor = gameState.actors[name];
  if (!actor) return;

  const d6 = Math.floor(Math.random() * 6) + 1;
  const stress = actor.stress || 0;

  const total = d6 + stress;

  pushHistory({
    type: "panic",
    name: `${name} Panic Test`,
    time: new Date().toLocaleTimeString(),
    dice: [d6],
    stress,
    total,
    resultText: resolvePanic(total)
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

/* ---------------- ROLLS ---------------- */

function performRoll({ name, basic = 0, noStress = false }) {
  const actor = gameState.actors[name];

  const basicDice = rollDice(basic);

  const stressDice =
    actor && !noStress
      ? rollDice(actor.stress)
      : [];

  pushHistory({
    name,
    basic: basicDice,
    stress: stressDice,
    successes: count(basicDice, 6) + count(stressDice, 6),
    banes: count(stressDice, 1),
    time: new Date().toLocaleTimeString()
  });
}

/* ---------------- NPCS ---------------- */

function createActor(name) {
  let finalName = (name || "").trim() || `Actor ${Math.floor(Math.random() * 10000)}`;
  if (gameState.actors[finalName]) finalName += ` ${Date.now()}`;

  gameState.actors[finalName] = { type: "npc", stress: 0 };
  gameState.turnOrder.push(finalName);

  broadcastState();
}

function removeActor(name) {
  if (!gameState.actors[name]) return;
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
  gameState.currentTurnIndex =
    (gameState.currentTurnIndex + 1) % Math.max(1, gameState.turnOrder.length);

  broadcastState();
}

/* ---------------- HANDLER ---------------- */

function handle(ws, msg) {
  const client = getClient(ws);

  switch (msg.type) {

    case "setRole":
      clients.set(ws, { role: msg.role || "player", pc: msg.pc || null });
      break;

    case "roll":
      performRoll({
        name: msg.name,
        basic: Number(msg.basic) || 0
      });
      break;

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

    case "setStress": {
      if (client.role !== "gm") return;

      const pc = pcState[msg.name];
      if (!pc) return;

      pc.stress = Math.max(0, Number(msg.stress) || 0);

      savePCState();
      broadcastState();
      break;
    }

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
  clients.set(ws, { role: "player", pc: null });

  ws.send(JSON.stringify({
    type: "state",
    state: gameState,
    pcs: pcState,
    pcDefs
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
