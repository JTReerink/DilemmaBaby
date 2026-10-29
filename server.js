// ============================================================================
// DILEMMA BABY - SERVER
// Society 5.0 Festival Interactive Installation
// Express + Socket.io Server (Render.com ready with WSS & Keep-Alive)
// ============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

// Socket.io with robust CORS and transport fallbacks for cloud hosting
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DILEMMAS_FILE = path.join(DATA_DIR, 'dilemmas.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// --- In-Memory State & Configurations ---
let dilemmas = [];
let settings = {};

function loadData() {
  try {
    dilemmas = JSON.parse(fs.readFileSync(DILEMMAS_FILE, 'utf-8'));
  } catch (err) {
    console.error('[SERVER] Error reading dilemmas.json:', err.message);
    dilemmas = [];
  }

  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (err) {
    console.error('[SERVER] Error reading settings.json:', err.message);
    settings = {
      unanimousFeedback: "Unanimous decision reached! The baby calms down.",
      splitFeedback: "No consensus reached! The baby becomes uneasy.",
      lobbyWelcome: "Welcome to Dilemma Baby.",
      lobbyWaiting: "Waiting for co-custodians ({count}/3 connected)...",
      lobbyReady: "Session is ready to begin!",
      lobbyAutoStart: "Starting session in {seconds}s...",
      queueMessage: "You are in line! Queue position: #{pos}. Waiting for current session to finish...",
      inactivityWarning: "Are you still there? Session resets in {seconds} seconds...",
      extendTimeButton: "Extend Time ⏱️",
      voteLocked: "Decision locked. Awaiting fellow custodians...",
      sessionCompleted: "All directives resolved. Session concluding...",
      perspectiveTitles: {
        "1": "ECOLOGICAL & ENVIRONMENTAL PERSPECTIVE",
        "2": "SOCIAL TRIAGE & HEALTHCARE PERSPECTIVE",
        "3": "ALGORITHMIC & DATA AUTONOMY PERSPECTIVE"
      }
    };
  }
}

loadData();

// --- Game State ---
const gameState = {
  happiness: 5,               // 0 to 10
  currentDilemmaIndex: 0,
  status: 'lobby',            // 'lobby' | 'ready' | 'active' | 'revealed' | 'completed' | 'inactivity-ended'
  players: { '1': null, '2': null, '3': null }, // slot -> socket.id
  queue: [],                  // [socket.id, ...]
  votes: { '1': null, '2': null, '3': null },
  result: null,               // { consensus: boolean, unanimousChoice: 'A'|'B', votes, message }
  inactivityWarning: false,
  pendingMidGame: {}          // socket.id -> vacantSlot
};

// --- Timers ---
let inactivityTimer = null;
let inactivityWarningTimer = null;
let autoAdvanceTimer = null;

// --- Express Middleware & Static Files ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight /ping endpoint for Render.com uptime monitoring & cold-start prevention
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    happiness: gameState.happiness,
    activePlayers: Object.values(gameState.players).filter(Boolean).length,
    queueCount: gameState.queue.length
  });
});

// REST API for state inspection
app.get('/api/state', (req, res) => {
  res.json(getSanitizedGameState());
});

app.get('/api/dilemmas', (req, res) => {
  res.json({ dilemmas });
});

app.get('/api/settings', (req, res) => {
  res.json({ settings });
});

// Helper: Get local network IPs for LAN testing
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const iface of interfaces[k]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Helper: Broadcast current state to all connected sockets
function broadcastGameState() {
  const baseState = getSanitizedGameState();

  // Send tailored perspective to each active slot
  for (const [slot, socketId] of Object.entries(gameState.players)) {
    if (socketId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const perspectiveText = getCurrentPerspective(slot);
        const perspectiveTitle = settings.perspectiveTitles?.[slot] || `PLAYER ${slot} PERSPECTIVE`;
        socket.emit('game-state', {
          ...baseState,
          assignedSlot: slot,
          isQueued: false,
          myPerspective: perspectiveText,
          myPerspectiveTitle: perspectiveTitle,
          myVote: gameState.votes[slot]
        });
      }
    }
  }

  // Send queue status to waiting room sockets
  gameState.queue.forEach((socketId, idx) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('game-state', {
        ...baseState,
        assignedSlot: null,
        isQueued: true,
        queuePosition: idx + 1,
        totalInQueue: gameState.queue.length
      });
    }
  });

  // Send full state to host dashboard with detailed queue information
  const queueDetails = gameState.queue.map((socketId, idx) => ({
    id: socketId,
    shortId: socketId ? socketId.substring(0, 6) : 'Unknown',
    position: idx + 1
  }));

  io.emit('host:state', {
    ...baseState,
    players: gameState.players,
    queueCount: gameState.queue.length,
    queueDetails,
    votes: gameState.votes,
    dilemmasCount: dilemmas.length,
    settings
  });
}

function getSanitizedGameState() {
  const currentDilemma = dilemmas[gameState.currentDilemmaIndex] || null;
  return {
    happiness: gameState.happiness,
    currentDilemmaIndex: gameState.currentDilemmaIndex,
    totalDilemmas: dilemmas.length,
    status: gameState.status,
    activePlayersCount: Object.values(gameState.players).filter(Boolean).length,
    queueCount: gameState.queue.length,
    currentDilemmaTitle: currentDilemma ? currentDilemma.title : null,
    choices: currentDilemma ? currentDilemma.choices : [],
    result: gameState.result,
    inactivityWarning: gameState.inactivityWarning,
    settings
  };
}

function getCurrentPerspective(slot) {
  const currentDilemma = dilemmas[gameState.currentDilemmaIndex];
  if (!currentDilemma || !currentDilemma.perspectives) return '';
  return currentDilemma.perspectives[slot] || '';
}

// --- Slot Assignment & Queue Management ---
// --- Slot Assignment & Queue Management ---
function assignSlotOrQueue(socket) {
  // Check if player is already assigned
  for (const [slot, id] of Object.entries(gameState.players)) {
    if (id === socket.id) {
      return { slot, isQueued: false };
    }
  }

  // If already in queue
  const qIdx = gameState.queue.indexOf(socket.id);
  if (qIdx !== -1) {
    return { slot: null, isQueued: true, position: qIdx + 1 };
  }

  // Check for vacant slot (1, 2, or 3)
  const vacantSlot = ['1', '2', '3'].find(slot => gameState.players[slot] === null);

  // If game is actively in progress with a vacant slot and empty queue:
  // Present 3rd player with mid-game prompt (Join Current Game vs Wait for Next Game)
  if ((gameState.status === 'active' || gameState.status === 'revealed') && vacantSlot && gameState.queue.length === 0) {
    gameState.pendingMidGame[socket.id] = vacantSlot;
    console.log(`[MID-GAME] Socket ${socket.id} presented mid-game choice for Slot ${vacantSlot}`);
    return { slot: null, isQueued: false, pendingMidGame: true, vacantSlot };
  }

  // If slot available in lobby and no one waiting in queue
  if (vacantSlot && gameState.queue.length === 0) {
    gameState.players[vacantSlot] = socket.id;
    console.log(`[SLOT] Socket ${socket.id} assigned to Slot ${vacantSlot}`);
    checkLobbyReadiness();
    return { slot: vacantSlot, isQueued: false };
  } else {
    // Add to queue
    gameState.queue.push(socket.id);
    const position = gameState.queue.length;
    console.log(`[QUEUE] Socket ${socket.id} added to Queue position #${position}`);
    return { slot: null, isQueued: true, position };
  }
}

function removeSocket(socketId) {
  // Clean up any pending mid-game prompt
  if (gameState.pendingMidGame[socketId]) {
    delete gameState.pendingMidGame[socketId];
  }

  // Remove from active slots
  for (const [slot, id] of Object.entries(gameState.players)) {
    if (id === socketId) {
      gameState.players[slot] = null;
      gameState.votes[slot] = null;
      console.log(`[SLOT] Socket ${socketId} disconnected from Slot ${slot}`);

      // Promote next player from queue if available
      promoteFromQueue(slot);
      checkLobbyReadiness();
      break;
    }
  }

  // Remove from queue
  const qIdx = gameState.queue.indexOf(socketId);
  if (qIdx !== -1) {
    gameState.queue.splice(qIdx, 1);
    console.log(`[QUEUE] Socket ${socketId} removed from queue`);
  }

  broadcastGameState();
}

function promoteFromQueue(slot) {
  if (gameState.queue.length > 0) {
    const nextSocketId = gameState.queue.shift();
    gameState.players[slot] = nextSocketId;
    console.log(`[QUEUE] Socket ${nextSocketId} promoted from queue to Slot ${slot}`);

    const socket = io.sockets.sockets.get(nextSocketId);
    if (socket) {
      socket.emit('assigned-slot', { slot, settings });
    }
  }
}

// --- Session Lifecycle (Manual Start) ---
function checkLobbyReadiness() {
  const activeCount = Object.values(gameState.players).filter(Boolean).length;

  if (gameState.status === 'lobby' || gameState.status === 'ready') {
    if (activeCount >= 2) {
      // 2 or 3 players connected: lobby is ready for manual start!
      gameState.status = 'ready';
    } else {
      // Not enough players, return to waiting
      gameState.status = 'lobby';
    }
  } else if (gameState.status === 'active') {
    // If during an active game all players leave
    if (activeCount === 0) {
      resetSession(false);
    }
  }
}

function startSession() {
  clearAllTimers();

  gameState.status = 'active';
  gameState.currentDilemmaIndex = 0;
  gameState.votes = { '1': null, '2': null, '3': null };
  gameState.result = null;
  gameState.inactivityWarning = false;

  console.log('[SESSION] Started autonomous dilemma session.');

  resetInactivityTimer();
  broadcastGameState();
}

function checkVotesAndEvaluate() {
  // Only evaluate currently active players (those occupying a slot)
  const activeSlots = Object.entries(gameState.players)
    .filter(([slot, id]) => id !== null)
    .map(([slot]) => slot);

  if (activeSlots.length === 0) return;

  // Explicitly count votes so 2-player games resolve without waiting for slot 3
  const votedCount = activeSlots.filter(slot => gameState.votes[slot] !== null).length;
  const allActiveVoted = votedCount === activeSlots.length;

  console.log(`[VOTE] ${votedCount}/${activeSlots.length} active players have voted.`);

  if (allActiveVoted && gameState.status === 'active') {
    clearInactivityTimer();

    const activeVotes = activeSlots.map(slot => gameState.votes[slot]);
    const isUnanimous = activeVotes.every(v => v === activeVotes[0]);
    const unanimousChoice = isUnanimous ? activeVotes[0] : null;

    const previousHappiness = gameState.happiness;
    if (isUnanimous) {
      gameState.happiness = Math.min(10, gameState.happiness + 1);
    } else {
      gameState.happiness = Math.max(0, gameState.happiness - 1);
    }

    gameState.status = 'revealed';
    gameState.result = {
      consensus: isUnanimous,
      unanimousChoice,
      votes: { ...gameState.votes },
      previousHappiness,
      newHappiness: gameState.happiness,
      message: isUnanimous ? settings.unanimousFeedback : settings.splitFeedback
    };

    console.log(`[VOTE EVALUATION] Unanimous: ${isUnanimous} | Happiness: ${gameState.happiness}`);

    // Pulse event for Local Hub (TouchDesigner / Arduino)
    io.emit('happiness-update', {
      happiness: gameState.happiness,
      previousHappiness,
      change: isUnanimous ? +1 : -1,
      reason: isUnanimous ? 'unanimous' : 'split'
    });

    io.emit('pulse', {
      type: isUnanimous ? 'consensus' : 'conflict'
    });

    broadcastGameState();

    // Auto-advance to next dilemma after 6 seconds
    autoAdvanceTimer = setTimeout(() => {
      advanceToNextDilemma();
    }, 6000);
  } else {
    // Partial votes updated
    broadcastGameState();
  }
}

function advanceToNextDilemma() {
  clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;

  if (gameState.currentDilemmaIndex + 1 < dilemmas.length) {
    gameState.currentDilemmaIndex++;
    gameState.status = 'active';
    gameState.votes = { '1': null, '2': null, '3': null };
    gameState.result = null;
    gameState.inactivityWarning = false;

    console.log(`[ADVANCE] Transitioned to Directive #${gameState.currentDilemmaIndex + 1}`);
    resetInactivityTimer();
    broadcastGameState();
  } else {
    // All dilemmas completed
    console.log('[COMPLETED] All dilemmas finished. Session complete.');
    gameState.status = 'completed';
    gameState.result = {
      consensus: true,
      message: settings.sessionCompleted || "All directives resolved. Session concluding..."
    };
    broadcastGameState();

    setTimeout(() => {
      resetSession(true);
    }, 5000);
  }
}

// --- Inactivity Timer (30s Idle + 6s Warning) ---
function resetInactivityTimer() {
  clearInactivityTimer();

  if (gameState.status !== 'active') return;

  // 30 seconds of inactivity triggers warning modal
  inactivityTimer = setTimeout(() => {
    triggerInactivityWarning();
  }, 30000);
}

function triggerInactivityWarning() {
  if (gameState.status !== 'active') return;

  gameState.inactivityWarning = true;
  console.log('[INACTIVITY] 30s elapsed without input. Triggering 6s modal countdown...');

  // Emit warning ONLY to active game players (Slots 1, 2, 3), NOT to waiting queue
  for (const [slot, socketId] of Object.entries(gameState.players)) {
    if (socketId) {
      const s = io.sockets.sockets.get(socketId);
      if (s) {
        s.emit('inactivity-warning', { seconds: 6 });
      }
    }
  }

  broadcastGameState();

  inactivityWarningTimer = setTimeout(() => {
    handleInactivitySessionEnded();
  }, 6000);
}

function handleInactivitySessionEnded() {
  console.log('[INACTIVITY] 6s warning elapsed without response. Session ended due to inactivity.');
  clearAllTimers();

  gameState.happiness = 5;
  gameState.currentDilemmaIndex = 0;
  gameState.votes = { '1': null, '2': null, '3': null };
  gameState.status = 'inactivity-ended';
  gameState.result = null;
  gameState.inactivityWarning = false;

  // Inform active players with the confirmation screen
  for (const [slot, socketId] of Object.entries(gameState.players)) {
    if (socketId) {
      const s = io.sockets.sockets.get(socketId);
      if (s) {
        s.emit('session-inactivity-ended');
      }
    }
  }

  io.emit('happiness-update', {
    happiness: 5,
    change: 0,
    reason: 'inactivity-reset'
  });

  broadcastGameState();
}

function extendTime() {
  console.log('[INACTIVITY] Player requested time extension. Resetting 30s timer.');
  gameState.inactivityWarning = false;
  clearTimeout(inactivityWarningTimer);
  inactivityWarningTimer = null;

  io.emit('inactivity-cleared');
  resetInactivityTimer();
  broadcastGameState();
}

function clearInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  if (inactivityWarningTimer) {
    clearTimeout(inactivityWarningTimer);
    inactivityWarningTimer = null;
  }
  gameState.inactivityWarning = false;
}

function clearAllTimers() {
  clearInactivityTimer();
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function resetSession(promoteWaiting = false) {
  clearAllTimers();

  gameState.happiness = 5;
  gameState.currentDilemmaIndex = 0;
  gameState.votes = { '1': null, '2': null, '3': null };
  gameState.status = 'lobby';
  gameState.result = null;
  gameState.inactivityWarning = false;

  // If resetting upon completion or timeout, we can promote queued players into slots
  if (promoteWaiting && gameState.queue.length > 0) {
    // Release existing slots to give queue a turn
    for (const slot of ['1', '2', '3']) {
      const oldId = gameState.players[slot];
      if (oldId && gameState.queue.length > 0) {
        gameState.players[slot] = null;
        promoteFromQueue(slot);
        // Put old player at the back of the queue
        gameState.queue.push(oldId);
      }
    }
  }

  console.log('[RESET] Session reset to baseline.');

  io.emit('happiness-update', {
    happiness: 5,
    change: 0,
    reason: 'reset'
  });

  checkLobbyReadiness();
  broadcastGameState();
}

// --- Socket.io Event Handling ---
io.on('connection', (socket) => {
  console.log(`[SOCKET] Connected: ${socket.id}`);

  // Assign slot or queue
  const assignment = assignSlotOrQueue(socket);
  socket.emit('init-state', {
    ...assignment,
    settings,
    state: getSanitizedGameState()
  });

  // If mid-game 3rd player join detected, send prompt
  if (assignment.pendingMidGame) {
    const currentDilemma = dilemmas[gameState.currentDilemmaIndex];
    socket.emit('mid-game-prompt', {
      availableSlot: assignment.vacantSlot,
      directiveTitle: currentDilemma ? currentDilemma.title : 'Active Directive',
      directiveIndex: gameState.currentDilemmaIndex + 1
    });
  }

  broadcastGameState();

  // Mid-Game Joining Decision (3rd Player)
  socket.on('choose-mid-game', (data) => {
    const vacantSlot = gameState.pendingMidGame[socket.id];
    delete gameState.pendingMidGame[socket.id];

    if (data?.choice === 'join') {
      if (vacantSlot && gameState.players[vacantSlot] === null && (gameState.status === 'active' || gameState.status === 'revealed')) {
        gameState.players[vacantSlot] = socket.id;
        console.log(`[MID-GAME] Socket ${socket.id} joined active game as Slot ${vacantSlot}`);
        socket.emit('assigned-slot', { slot: vacantSlot, settings });
        broadcastGameState();
      } else {
        // Slot is no longer open or game ended, fallback to queue
        gameState.queue.push(socket.id);
        broadcastGameState();
      }
    } else {
      // Chose to wait for next game
      console.log(`[MID-GAME] Socket ${socket.id} opted to wait for next game.`);
      gameState.queue.push(socket.id);
      broadcastGameState();
    }
  });

  // Return to Lobby after Inactivity Stop
  socket.on('return-to-lobby', () => {
    if (gameState.status === 'inactivity-ended') {
      console.log(`[LOBBY] Socket ${socket.id} returned to lobby after inactivity termination.`);
      gameState.status = 'lobby';
      checkLobbyReadiness();
      broadcastGameState();
    }
  });

  // Player Cast Vote
  socket.on('cast-vote', (data) => {
    // Determine player's slot
    const slot = Object.keys(gameState.players).find(s => gameState.players[s] === socket.id);
    if (!slot) return;

    if (gameState.status === 'active' && ['A', 'B'].includes(data?.choice)) {
      gameState.votes[slot] = data.choice;
      console.log(`[VOTE] Player ${slot} voted: ${data.choice}`);

      // Any vote activity resets inactivity countdown
      resetInactivityTimer();
      checkVotesAndEvaluate();
    }
  });

  // Player Manual Start (Starts game when >= 2 players in lobby)
  socket.on('player-start', () => {
    const activeCount = Object.values(gameState.players).filter(Boolean).length;
    if (activeCount >= 2 && (gameState.status === 'lobby' || gameState.status === 'ready')) {
      console.log(`[START] Player ${socket.id} manually started game.`);
      startSession();
    }
  });

  // Player Extend Time
  socket.on('extend-time', () => {
    extendTime();
  });

  // Host Queue Reordering & Promotion
  socket.on('host:reorder-queue', (data) => {
    const { socketId, direction } = data || {};
    const idx = gameState.queue.indexOf(socketId);
    if (idx !== -1) {
      if (direction === 'up' && idx > 0) {
        const temp = gameState.queue[idx - 1];
        gameState.queue[idx - 1] = gameState.queue[idx];
        gameState.queue[idx] = temp;
      } else if (direction === 'down' && idx < gameState.queue.length - 1) {
        const temp = gameState.queue[idx + 1];
        gameState.queue[idx + 1] = gameState.queue[idx];
        gameState.queue[idx] = temp;
      }
      console.log(`[QUEUE] Reordered socket ${socketId} ${direction}`);
      broadcastGameState();
    }
  });

  socket.on('host:promote-player', (data) => {
    const { socketId, slot } = data || {};
    const qIdx = gameState.queue.indexOf(socketId);
    if (qIdx === -1) return;

    let targetSlot = slot;
    if (!targetSlot || gameState.players[targetSlot] !== null) {
      targetSlot = ['1', '2', '3'].find(s => gameState.players[s] === null);
    }

    if (targetSlot) {
      gameState.queue.splice(qIdx, 1);
      gameState.players[targetSlot] = socketId;
      console.log(`[HOST] Manually promoted socket ${socketId} from queue to Slot ${targetSlot}`);

      const s = io.sockets.sockets.get(socketId);
      if (s) {
        s.emit('assigned-slot', { slot: targetSlot, settings });
      }
      checkLobbyReadiness();
      broadcastGameState();
    }
  });

  // Host Actions
  socket.on('host:skip-dilemma', () => {
    advanceToNextDilemma();
  });

  socket.on('host:set-happiness', (data) => {
    const val = Number(data?.happiness);
    if (!isNaN(val) && val >= 0 && val <= 10) {
      const prev = gameState.happiness;
      gameState.happiness = Math.round(val);
      io.emit('happiness-update', {
        happiness: gameState.happiness,
        previousHappiness: prev,
        change: gameState.happiness - prev,
        reason: 'host-override'
      });
      broadcastGameState();
    }
  });

  socket.on('host:reset-session', () => {
    resetSession(false);
  });

  socket.on('host:save-dilemmas', (data) => {
    if (Array.isArray(data?.dilemmas)) {
      dilemmas = data.dilemmas;
      try {
        fs.writeFileSync(DILEMMAS_FILE, JSON.stringify(dilemmas, null, 2), 'utf-8');
        console.log(`[CMS] Saved ${dilemmas.length} dilemmas to ${DILEMMAS_FILE}`);
        broadcastGameState();
        socket.emit('host:saved-ack', { success: true, count: dilemmas.length });
      } catch (err) {
        socket.emit('host:saved-ack', { success: false, error: err.message });
      }
    }
  });

  socket.on('host:save-settings', (data) => {
    if (data?.settings && typeof data.settings === 'object') {
      settings = { ...settings, ...data.settings };
      try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        console.log(`[CMS] Saved settings to ${SETTINGS_FILE}`);
        broadcastGameState();
        socket.emit('host:saved-settings-ack', { success: true });
      } catch (err) {
        socket.emit('host:saved-settings-ack', { success: false, error: err.message });
      }
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
    removeSocket(socket.id);
  });
});

// --- Server Boot ---
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('\n=============================================================');
  console.log('  DILEMMA BABY - SOCIETY 5.0 FESTIVAL SERVER ACTIVE          ');
  console.log('  Theme: "Reimagining Autonomy"                             ');
  console.log('=============================================================');
  console.log(`Port:                ${PORT}`);
  console.log(`Local Access:        http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`Network (LAN):       http://${ip}:${PORT}`);
  });
  console.log('-------------------------------------------------------------');
  console.log(`Player Join URL:     http://localhost:${PORT}/`);
  console.log(`Host Dashboard:      http://localhost:${PORT}/host.html`);
  console.log(`Health Keep-Alive:   http://localhost:${PORT}/ping`);
  console.log('=============================================================\n');
});
