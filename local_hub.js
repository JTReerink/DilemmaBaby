// ============================================================================
// DILEMMA BABY - LOCAL CENTRAL HUB RELAY
// Society 5.0 Festival Interactive Installation
// Relays Socket.io events from online server to TouchDesigner (OSC) & Arduino (USB)
// ============================================================================

const { io } = require('socket.io-client');
const osc = require('node-osc');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
let currentHappiness = -1;

// --- Command Line Argument Parsing ---
const args = process.argv.slice(2);

function getArgValue(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}

const isLocal = args.includes('--local') || process.env.LOCAL === 'true';
const DEFAULT_SERVER = isLocal ? 'http://localhost:3000' : (process.env.SERVER_URL || 'https://dilemmababy.jtxr.nl');
const SERVER_URL = getArgValue('--server', DEFAULT_SERVER);

const OSC_HOST = getArgValue('--osc-host', process.env.OSC_HOST || '127.0.0.1');
const OSC_PORT = parseInt(getArgValue('--osc-port', process.env.OSC_PORT || '8000'), 10);

const SERIAL_PORT_NAME = getArgValue('--port', process.env.SERIAL_PORT || null);
const BAUD_RATE = parseInt(getArgValue('--baud', process.env.BAUD_RATE || '115200'), 10);
const SIMULATION_MODE = args.includes('--sim');

console.log('\n=============================================================');
console.log('  DILEMMA BABY - LOCAL HARDWARE & OSC HUB                    ');
console.log('  Society 5.0 Festival | "Reimagining Autonomy"              ');
console.log('=============================================================');
console.log(`Server URL:         ${SERVER_URL}`);
console.log(`OSC Endpoint:       ${OSC_HOST}:${OSC_PORT} (TouchDesigner)`);
console.log(`Target Serial Port: ${SERIAL_PORT_NAME || 'Auto-detecting Arduino...'}`);
console.log(`Baud Rate:          ${BAUD_RATE}`);
console.log(`Simulation Mode:    ${SIMULATION_MODE ? 'ACTIVE (No hardware required)' : 'OFF'}`);
console.log('=============================================================\n');

// ============================================================================
// 1. TOUCHDESIGNER OSC CLIENT
// ============================================================================
let oscClient = null;

try {
  oscClient = new osc.Client(OSC_HOST, OSC_PORT);
  console.log(`[OSC] Initialized client targeting ${OSC_HOST}:${OSC_PORT}`);
} catch (err) {
  console.error(`[OSC] Failed to initialize OSC client:`, err.message);
}

function sendOscMessage(address, value) {
  if (!oscClient) return;

  try {
    oscClient.send(address, value, (err) => {
      if (err) {
        // UDP send error (e.g. host unreachable)
        // Keep quiet or minimal log to avoid spamming console
      } else {
        console.log(`[OSC -> TD] ${address} : ${JSON.stringify(value)}`);
      }
    });
  } catch (err) {
    // Prevent unhandled exceptions from terminating hub
  }
}

// ============================================================================
// 2. ARDUINO USB SERIAL CONNECTION
// ============================================================================
let serialPort = null;
let serialParser = null;
let isScanningForPort = false;
let autoScanInterval = null;

async function autoDetectArduinoPort() {
  try {
    const ports = await SerialPort.list();
    if (!ports || ports.length === 0) return null;

    // Look for Arduino, CH340, FTDI, CP210x, USB Serial in vendor/manufacturer/pnpId
    const knownVendors = ['arduino', 'ch340', 'ftdi', 'silicon labs', 'usb-serial', 'wch', 'wch.cn'];
    const matched = ports.find(p => {
      const desc = `${p.manufacturer || ''} ${p.vendorId || ''} ${p.pnpId || ''} ${p.friendlyName || ''}`.toLowerCase();
      return knownVendors.some(v => desc.includes(v));
    });

    if (matched) {
      return matched.path;
    }

    // Fallback: if only 1 serial port exists, use it
    if (ports.length === 1 && ports[0].path) {
      return ports[0].path;
    }

    return null;
  } catch (err) {
    console.warn('[SERIAL] Error listing serial ports:', err.message);
    return null;
  }
}

async function connectSerial() {
  if (SIMULATION_MODE) {
    console.log('[SERIAL] Simulation mode: Skipping physical serial connection.');
    return;
  }

  if (serialPort && serialPort.isOpen) {
    return; // Already open
  }

  let portToOpen = SERIAL_PORT_NAME;
  if (!portToOpen) {
    portToOpen = await autoDetectArduinoPort();
  }

  if (!portToOpen) {
    if (!isScanningForPort) {
      console.log('[SERIAL] No Arduino detected on USB. Polling every 4 seconds...');
      isScanningForPort = true;

      // List all available ports to help the user identify the correct one
      try {
        const allPorts = await SerialPort.list();
        if (allPorts.length === 0) {
          console.log('[SERIAL] No serial ports found on this system at all.');
        } else {
          console.log('[SERIAL] Available serial ports:');
          allPorts.forEach(p => {
            console.log(`  - ${p.path}  |  Manufacturer: ${p.manufacturer || 'Unknown'}  |  VendorID: ${p.vendorId || '-'}  |  PnP: ${p.pnpId || '-'}`);
          });
          console.log('[SERIAL] Tip: pass --port <portname> to force a specific port, e.g. --port COM3');
        }
      } catch (listErr) {
        console.warn('[SERIAL] Could not list available ports:', listErr.message);
      }
    }
    return;
  }

  isScanningForPort = false;
  console.log(`[SERIAL] Attempting to connect to Arduino on ${portToOpen} (${BAUD_RATE} baud)...`);

  try {
    serialPort = new SerialPort({
      path: portToOpen,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    serialPort.open((err) => {
      if (err) {
        console.warn(`[SERIAL] Could not open ${portToOpen}: ${err.message}. Retrying in 4s...`);
        serialPort = null;
        return;
      }

      console.log(`[SERIAL] Connected successfully to Arduino on ${portToOpen}!`);
      
      serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
      serialParser.on('data', (line) => {
        const text = line.trim();
        if (text) {
          console.log(`[ARDUINO -> HUB] ${text}`);
        }
      });

      // Synchronize initial state
      sendSerialCommand(`HAPPINESS:${currentHappiness}`);
    });

    serialPort.on('close', () => {
      console.warn('[SERIAL] Connection closed. Auto-reconnect will monitor ports...');
      serialPort = null;
      serialParser = null;
    });

    serialPort.on('error', (err) => {
      console.warn(`[SERIAL] Port error: ${err.message}`);
      serialPort = null;
      serialParser = null;
    });

  } catch (err) {
    console.warn(`[SERIAL] Failed to open port ${portToOpen}:`, err.message);
    serialPort = null;
  }
}

function sendSerialCommand(cmd) {
  const line = `${cmd}\n`;
  if (SIMULATION_MODE) {
    console.log(`[SIM SERIAL -> ARDUINO] ${line.trim()}`);
    return;
  }

  if (serialPort && serialPort.isOpen) {
    serialPort.write(line, (err) => {
      if (err) {
        console.warn(`[SERIAL] Write error:`, err.message);
      } else {
        console.log(`[SERIAL -> ARDUINO] Sent: ${cmd}`);
      }
    });
  } else {
    // Buffer or log
    console.log(`[SERIAL PENDING (Disconnected)] Would send: ${cmd}`);
  }
}

// Start auto-detection polling
autoScanInterval = setInterval(() => {
  if (!serialPort || !serialPort.isOpen) {
    connectSerial();
  }
}, 4000);
connectSerial();

// ============================================================================
// 3. SOCKET.IO CLIENT (SERVER CONNECTION)
// ============================================================================
currentHappiness = 5;

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

socket.on('connect', () => {
  console.log(`[SOCKET] Connected to Dilemma Baby server at: ${SERVER_URL} (ID: ${socket.id})`);
  socket.emit('register-hub');
  sendOscMessage('/baby/connected', 1);
});

socket.on('connect_error', (err) => {
  console.warn(`[SOCKET] Connection error to ${SERVER_URL}: ${err.message}`);
  sendOscMessage('/baby/connected', 0);
});

socket.on('disconnect', (reason) => {
  console.warn(`[SOCKET] Disconnected from server: ${reason}`);
  sendOscMessage('/baby/connected', 0);
});

// Full state sync
socket.on('game-state', (state) => {
  if (!state) return;

  if (typeof state.happiness === 'number' && state.happiness !== currentHappiness) {
    currentHappiness = state.happiness;
    sendOscMessage('/baby/happiness', currentHappiness);
    sendSerialCommand(`HAPPINESS:${currentHappiness}`);
    sendSerialCommand(`H:${currentHappiness}`);
  }

  if (state.status) {
    sendOscMessage('/baby/state', state.status);
  }

  if (state.currentDilemmaIndex !== undefined) {
    sendOscMessage('/baby/dilemmaIndex', state.currentDilemmaIndex);
  }
});

// Dedicated happiness update event
socket.on('happiness-update', (data) => {
  if (!data) return;

  const happiness = typeof data.happiness === 'number' ? data.happiness : currentHappiness;
  currentHappiness = happiness;

  console.log(`[UPDATE] Baby Happiness: ${happiness}/10 (Reason: ${data.reason || 'vote'})`);

  // Relay to TouchDesigner via OSC
  sendOscMessage('/baby/happiness', happiness);
  sendOscMessage('/baby/happinessChange', data.change || 0);

  // Relay to Arduino via Serial
  sendSerialCommand(`HAPPINESS:${happiness}`);
  sendSerialCommand(`H:${happiness}`);

  if (data.reason === 'reset') {
    sendSerialCommand('RESET');
  }
});

// Dedicated pulse trigger (Consensus or Conflict)
socket.on('pulse', (data) => {
  const isConsensus = data?.type === 'consensus';
  console.log(`[PULSE] ${isConsensus ? 'CONSENSUS SWELL' : 'CONFLICT GLITCH'}`);

  // OSC pulse trigger to TouchDesigner
  sendOscMessage('/baby/pulse', isConsensus ? 1 : 0);
  sendOscMessage('/baby/pulseType', isConsensus ? 'consensus' : 'conflict');

  // Serial hardware pulse
  sendSerialCommand(isConsensus ? 'V:1' : 'V:0');
});

// Clean shutdown handler
function shutdown() {
  console.log('\n[HUB] Shutting down cleanly...');
  if (autoScanInterval) clearInterval(autoScanInterval);
  if (oscClient) oscClient.close();
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      console.log('[HUB] Closed serial port.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
