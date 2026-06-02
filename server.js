const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");

const panicTable = require("./panicTable");
const criticalTable = require("./criticalTable");
const pcDefs = require("./playerCharacters");

const PORT = process.env.PORT || 8080;

/* ---------------- SERVER ---------------- */

const server = http.createServer();
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log("🚀 Server listening on", PORT);
});

/* ---------------- PERSISTENCE ---------------- */

const pcStatePath = "./pcState.json";

function loadPCState() {
  try {
    return JSON.parse(fs.readFileSync(pcStatePath, "utf8"));
  } catch {
    return {};
  }
}

function savePCState(state) {
  fs.writeFileSync(pcStatePath, JSON.stringify(state, null, 2));
}

/* ---------------- STATE ---------------- */

let pcState = loadPCState();
let npcState = {};

/* 🔥 CRITICAL FIX: seed missing PCs */
function seedPCState() {
  for (const id of Object.keys(pcDefs)) {
    if (!pcState[id]) {
      pcState[id] = {
        stress: 0,
        health: 5,
        conditions: {
          starving: false,
          dehydrated: false,
          exhausted: false,
          freezing: false
        },
        criticalInjuries: []
      };
    }
  }
}

seedPCState();

let gameState = {
  turnOrder: Object.keys(pcDefs),
  currentTurnIndex: 0,
  history: []
};

/* ---------------- ACTORS (READ ONLY VIEW) ---------------- */

function buildPCActors() {
  const actors = {};

  for (const [id, def] of Object.entries(pcDefs)) {
    const state = pcState[id];

    actors[id] = {
      id,
      type: "pc",
      name: def.name,
      callsign: def.callsign,
      stress: state.stress,
      health: state.health,
      conditions: state.conditions,
      criticalInjuries: state.criticalInjuries
    };
  }

  return actors;
}

function buildActors() {
  return {
    ...buildPCActors(),
    ...npcState
  };
}

/* ---------------- BROADCAST ---------------- */

function broadcastState() {
  const msg = JSON.stringify({
    type: "state",
    state: {
      ...gameState,
      actors: buildActors()
    }
  });

  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  }
}

/* ---------------- HISTORY ---------------- */

function pushHistory(entry) {
  if (!entry) return;

  gameState.history.push(entry);

  if (gameState.history.length > 200) {
    gameState.history = gameState.history.slice(-200);
  }

  broadcastState();
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

/* ---------------- PANIC ---------------- */

function resolvePanic(total) {
  for (const row of panicTable) {
    if (total >= row.min && total <= row.max) return row.text;
  }
  return "No effect.";
}

function performPanic(name) {
  const actor = buildActors()[name];
  if (!actor) return;

  const d6 = Math.floor(Math.random() * 6) + 1;
  const total = d6 + actor.stress;

  pushHistory({
    type: "panic",
    name: actor.name,
    label: `${actor.name} 🎲 ${d6}+${actor.stress}=${total} → ${resolvePanic(total)}`,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
    type: "critical",
    label: `💀 CRIT (${d66}) → ${injury.injury}`,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
}

/* ---------------- ROLL ---------------- */

function performRoll({ name, basic = 0, noStress = false }) {
  const actor = buildActors()[name];

  const basicDice = rollDice(basic);
  const stressDice =
    actor?.type === "pc" && !noStress
      ? rollDice(actor.stress)
      : [];

  const all = [...basicDice, ...stressDice];

  const successes = count(all, 6);
  const banes = count(stressDice, 1);

  const label =
    `${actor?.name ?? name} 🎲 ${basicDice.join(",") || "—"} ` +
    `⚡ ${stressDice.join(",") || "—"} → ${successes}✔` +
    (banes ? ` ⚠` : "");

  pushHistory({
    type: "roll",
    label,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
}

/* ---------------- NPCS ---------------- */

function createActor(name) {
  const id = `npc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  npcState[id] = {
    id,
    type: "npc",
    name: name || `NPC ${id}`,
    stress: 0,
    health: 5
  };

  gameState.turnOrder.push(id);
  broadcastState();
}

function removeActor(id) {
  delete npcState[id];
  gameState.turnOrder = gameState.turnOrder.filter(n => n !== id);
  broadcastState();
}

/* ---------------- INITIATIVE ---------------- */

function shuffleInitiative() {
  gameState.turnOrder.sort(() => Math.random() - 0.5);
  gameState.currentTurnIndex = 0;
  broadcastState();
}

function nextTurn() {
  if (!gameState.turnOrder.length) return;

  gameState.currentTurnIndex =
    (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;

  broadcastState();
}

/* ---------------- WS ---------------- */

wss.on("connection", ws => {
  console.log("🟢 CLIENT CONNECTED");

  ws.send(JSON.stringify({
    type: "state",
    state: {
      ...gameState,
      actors: buildActors()
    }
  }));

  ws.on("message", raw => {
    try {
      handle(JSON.parse(raw.toString()));
    } catch (e) {
      console.log("BAD MESSAGE:", e);
    }
  });
});

/* ---------------- HANDLER ---------------- */

function handle(msg) {
  switch (msg.type) {

    case "roll":
      performRoll({ name: msg.name, basic: Number(msg.basic) || 0 });
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

    case "shuffleInitiative":
      shuffleInitiative();
      break;

    case "nextTurn":
      nextTurn();
      break;

    /* ---------------- GM MUTATIONS (NOW RELIABLE) ---------------- */

    case "setStress": {
      const id = msg.name;
      if (!pcState[id]) return;

      pcState[id].stress = Math.max(0, msg.stress);
      savePCState(pcState);
      broadcastState();
      break;
    }

    case "setHealth": {
      const id = msg.name;
      if (!pcState[id]) return;

      pcState[id].health = Math.max(0, msg.health);
      savePCState(pcState);
      broadcastState();
      break;
    }

    case "setCondition": {
      const id = msg.name;
      if (!pcState[id]) return;

      pcState[id].conditions[msg.condition] = !!msg.value;

      savePCState(pcState);
      broadcastState();
      break;
    }
  }
}
