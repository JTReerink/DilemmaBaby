// ============================================================================
// Autonomy Baby - Server
// Reimagining Autonomy (Society 5.0 Interactive Installation)
// Zero-dependency Node.js HTTP + Server-Sent Events (SSE) server
// ============================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'dilemmas.json');

// --- In-Memory State ---
let dilemmas = [];
try {
  const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
  dilemmas = JSON.parse(rawData);
} catch (err) {
  console.error('[SERVER] Error reading dilemmas.json:', err.message);
  dilemmas = [];
}

let gameState = {
  happiness: 5,             // 0 to 10 (5 = neutral)
  currentDilemmaIndex: 0,   // index in dilemmas array
  status: 'voting',         // 'voting' | 'revealed'
  votes: { '1': null, '2': null, '3': null },
  result: null,             // { consensus: boolean, unanimousChoice: 'A'|'B'|null, votes: {...} }
  history: [],              // list of past round results
  autoAdvanceAt: null,      // timestamp in ms when next round will trigger
  autoAdvanceDuration: 8,   // countdown in seconds
  autoAdvanceEnabled: true  // auto advance on/off toggle
};

// Connected SSE clients
const sseClients = new Set();

let autoAdvanceTimer = null;
let autoAdvanceDuration = 8;
let autoAdvanceEnabled = true;

function cancelAutoAdvance() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  gameState.autoAdvanceAt = null;
  gameState.autoAdvanceDuration = autoAdvanceDuration;
  gameState.autoAdvanceEnabled = autoAdvanceEnabled;
}

function startAutoAdvance() {
  cancelAutoAdvance();
  if (!autoAdvanceEnabled) {
    broadcastState();
    return;
  }

  const now = Date.now();
  gameState.autoAdvanceDuration = autoAdvanceDuration;
  gameState.autoAdvanceAt = now + (autoAdvanceDuration * 1000);
  gameState.autoAdvanceEnabled = true;

  autoAdvanceTimer = setTimeout(() => {
    advanceToNextDilemma();
  }, autoAdvanceDuration * 1000);
}

function advanceToNextDilemma() {
  cancelAutoAdvance();
  if (dilemmas.length > 0) {
    gameState.currentDilemmaIndex = (gameState.currentDilemmaIndex + 1) % dilemmas.length;
  }
  gameState.votes = { '1': null, '2': null, '3': null };
  gameState.status = 'voting';
  gameState.result = null;
  broadcastState();
}

function broadcastState() {
  const currentDilemma = dilemmas[gameState.currentDilemmaIndex] || null;
  const payload = JSON.stringify({
    ...gameState,
    totalDilemmas: dilemmas.length,
    currentDilemma
  });

  const message = `data: ${payload}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

function evaluateVotes() {
  const v1 = gameState.votes['1'];
  const v2 = gameState.votes['2'];
  const v3 = gameState.votes['3'];

  // Check if all 3 have submitted
  if (v1 && v2 && v3) {
    const isConsensus = (v1 === v2 && v2 === v3);
    const unanimousChoice = isConsensus ? v1 : null;
    
    const previousHappiness = gameState.happiness;
    if (isConsensus) {
      gameState.happiness = Math.min(10, gameState.happiness + 1);
    } else {
      gameState.happiness = Math.max(0, gameState.happiness - 1);
    }

    gameState.status = 'revealed';
    gameState.result = {
      consensus: isConsensus,
      unanimousChoice,
      votes: { ...gameState.votes },
      previousHappiness,
      newHappiness: gameState.happiness,
      dilemmaId: dilemmas[gameState.currentDilemmaIndex]?.id || null,
      dilemmaTitle: dilemmas[gameState.currentDilemmaIndex]?.title || '',
      forced: false
    };

    gameState.history.push({
      round: gameState.history.length + 1,
      ...gameState.result,
      timestamp: new Date().toISOString()
    });

    startAutoAdvance();
    broadcastState();
  } else {
    // Partial votes broadcast
    broadcastState();
  }
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

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

// Request Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2e6) { // 2MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for local multi-device flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // -------------------------------------------------------------
  // SSE Real-Time Endpoint
  // -------------------------------------------------------------
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    sseClients.add(res);

    // Initial state push
    const currentDilemma = dilemmas[gameState.currentDilemmaIndex] || null;
    res.write(`data: ${JSON.stringify({
      ...gameState,
      totalDilemmas: dilemmas.length,
      currentDilemma
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // -------------------------------------------------------------
  // REST API Endpoints
  // -------------------------------------------------------------
  if (pathname === '/api/state' && req.method === 'GET') {
    const currentDilemma = dilemmas[gameState.currentDilemmaIndex] || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...gameState,
      totalDilemmas: dilemmas.length,
      currentDilemma
    }));
    return;
  }

  if (pathname === '/api/dilemmas' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dilemmas }));
    return;
  }

  if (pathname === '/api/network-info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      port: PORT,
      localIps: getLocalIpAddresses()
    }));
    return;
  }

  // Submit a vote from Screen 1, 2, or 3
  if (pathname === '/api/vote' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const screenId = String(data.screenId);
      const choice = data.choice; // 'A' or 'B'

      if (!['1', '2', '3'].includes(screenId) || !['A', 'B'].includes(choice)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid screenId or choice' }));
        return;
      }

      // Record vote if currently in voting status
      if (gameState.status === 'voting') {
        gameState.votes[screenId] = choice;
        evaluateVotes();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, votes: gameState.votes, status: gameState.status }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // HOST: Reset Experience
  if (pathname === '/api/host/reset' && req.method === 'POST') {
    try {
      await parseJsonBody(req);
      cancelAutoAdvance();
      gameState.happiness = 5;
      gameState.votes = { '1': null, '2': null, '3': null };
      gameState.status = 'voting';
      gameState.result = null;
      gameState.currentDilemmaIndex = 0;
      broadcastState();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Experience reset to neutral.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // HOST: Set Happiness Directly
  if (pathname === '/api/host/set-happiness' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const newHappiness = Number(data.happiness);
      if (isNaN(newHappiness) || newHappiness < 0 || newHappiness > 10) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Happiness must be between 0 and 10' }));
        return;
      }

      gameState.happiness = Math.round(newHappiness);
      broadcastState();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, happiness: gameState.happiness }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // HOST: Next Dilemma
  if (pathname === '/api/host/next-dilemma' && req.method === 'POST') {
    advanceToNextDilemma();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, currentDilemmaIndex: gameState.currentDilemmaIndex }));
    return;
  }

  // HOST: Previous Dilemma
  if (pathname === '/api/host/prev-dilemma' && req.method === 'POST') {
    cancelAutoAdvance();
    if (dilemmas.length > 0) {
      gameState.currentDilemmaIndex = (gameState.currentDilemmaIndex - 1 + dilemmas.length) % dilemmas.length;
    }
    gameState.votes = { '1': null, '2': null, '3': null };
    gameState.status = 'voting';
    gameState.result = null;
    broadcastState();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, currentDilemmaIndex: gameState.currentDilemmaIndex }));
    return;
  }

  // HOST: Jump to specific dilemma
  if (pathname === '/api/host/select-dilemma' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const idx = Number(data.index);
      if (isNaN(idx) || idx < 0 || idx >= dilemmas.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid dilemma index' }));
        return;
      }
      cancelAutoAdvance();
      gameState.currentDilemmaIndex = idx;
      gameState.votes = { '1': null, '2': null, '3': null };
      gameState.status = 'voting';
      gameState.result = null;
      broadcastState();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, currentDilemmaIndex: gameState.currentDilemmaIndex }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // HOST: Reopen / Restart current dilemma round
  if (pathname === '/api/host/reopen-voting' && req.method === 'POST') {
    cancelAutoAdvance();
    gameState.votes = { '1': null, '2': null, '3': null };
    gameState.status = 'voting';
    gameState.result = null;
    broadcastState();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Voting reopened for current directive' }));
    return;
  }

  // HOST: Force Reveal
  if (pathname === '/api/host/force-reveal' && req.method === 'POST') {
    // Only count participants who actually cast an answer.
    // If one of 3 has not answered, it is disregarded in consensus calculation.
    const activeEntries = Object.entries(gameState.votes).filter(([id, val]) => val !== null);
    const activeVotes = activeEntries.map(([id, val]) => val);

    let isConsensus = false;
    let unanimousChoice = null;

    if (activeVotes.length > 0) {
      // Check if all who submitted cast the exact same choice
      isConsensus = activeVotes.every(v => v === activeVotes[0]);
      if (isConsensus) {
        unanimousChoice = activeVotes[0];
      }
    }

    const previousHappiness = gameState.happiness;
    if (isConsensus) {
      gameState.happiness = Math.min(10, gameState.happiness + 1);
    } else {
      gameState.happiness = Math.max(0, gameState.happiness - 1);
    }

    gameState.status = 'revealed';
    gameState.result = {
      consensus: isConsensus,
      unanimousChoice,
      votes: { ...gameState.votes },
      activeVoteCount: activeVotes.length,
      previousHappiness,
      newHappiness: gameState.happiness,
      dilemmaId: dilemmas[gameState.currentDilemmaIndex]?.id || null,
      dilemmaTitle: dilemmas[gameState.currentDilemmaIndex]?.title || '',
      forced: true
    };

    gameState.history.push({
      round: gameState.history.length + 1,
      ...gameState.result,
      timestamp: new Date().toISOString()
    });

    startAutoAdvance();
    broadcastState();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, result: gameState.result }));
    return;
  }

  // HOST: Configure Auto-Advance
  if (pathname === '/api/host/configure-auto-advance' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      if (typeof data.enabled === 'boolean') {
        autoAdvanceEnabled = data.enabled;
        gameState.autoAdvanceEnabled = autoAdvanceEnabled;
      }
      if (data.duration && !isNaN(Number(data.duration))) {
        autoAdvanceDuration = Math.max(1, Math.min(60, Number(data.duration)));
        gameState.autoAdvanceDuration = autoAdvanceDuration;
      }
      if (!autoAdvanceEnabled) {
        cancelAutoAdvance();
      } else if (gameState.status === 'revealed' && !autoAdvanceTimer) {
        startAutoAdvance();
      }
      broadcastState();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled: autoAdvanceEnabled, duration: autoAdvanceDuration }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // HOST: Skip Countdown
  if (pathname === '/api/host/skip-countdown' && req.method === 'POST') {
    advanceToNextDilemma();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // HOST: Pause Countdown
  if (pathname === '/api/host/pause-countdown' && req.method === 'POST') {
    cancelAutoAdvance();
    broadcastState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // HOST: Save Dilemmas (Admin Content Management)
  if (pathname === '/api/host/save-dilemmas' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      if (!Array.isArray(data.dilemmas)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'dilemmas must be an array' }));
        return;
      }

      dilemmas = data.dilemmas;
      // Persist to file
      fs.writeFileSync(DATA_FILE, JSON.stringify(dilemmas, null, 2), 'utf-8');

      // Validate current index
      if (gameState.currentDilemmaIndex >= dilemmas.length) {
        gameState.currentDilemmaIndex = Math.max(0, dilemmas.length - 1);
      }

      broadcastState();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: dilemmas.length }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // -------------------------------------------------------------
  // Clean URL Rewrites & Static File Server
  // -------------------------------------------------------------
  let filePath = '';
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else if (pathname === '/host' || pathname === '/host.html' || pathname === '/admin') {
    filePath = path.join(PUBLIC_DIR, 'host.html');
  } else if (pathname === '/screen/1') {
    res.writeHead(302, { 'Location': '/screen.html?id=1' });
    res.end();
    return;
  } else if (pathname === '/screen/2') {
    res.writeHead(302, { 'Location': '/screen.html?id=2' });
    res.end();
    return;
  } else if (pathname === '/screen/3') {
    res.writeHead(302, { 'Location': '/screen.html?id=3' });
    res.end();
    return;
  } else {
    filePath = path.join(PUBLIC_DIR, pathname);
  }

  // Safe path check to prevent path traversal
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(normalizedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(normalizedPath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('\n=============================================================');
  console.log('  AUTONOMY BABY - SOCIETY 5.0 INSTALLATION SERVER ACTIVE     ');
  console.log('  Exhibition Theme: "Reimagining Autonomy"                   ');
  console.log('=============================================================');
  console.log(`Local Access:        http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`Network (LAN):       http://${ip}:${PORT}`);
  });
  console.log('-------------------------------------------------------------');
  console.log(`Screen 1:            http://localhost:${PORT}/screen.html?id=1`);
  console.log(`Screen 2:            http://localhost:${PORT}/screen.html?id=2`);
  console.log(`Screen 3:            http://localhost:${PORT}/screen.html?id=3`);
  console.log(`Host & Admin Screen: http://localhost:${PORT}/host.html`);
  console.log('=============================================================\n');
});
