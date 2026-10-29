# Dilemma Baby — Society 5.0 Festival Installation
**Exhibition Theme:** *"Reimagining Autonomy"*  
**Context:** AHK Society 5.0 (Year 3) — Interactive Speculative Neonatal Installation  
**Repository:** [JTReerink/DilemmaBaby](https://github.com/JTReerink/DilemmaBaby)  
**Production Domain:** [dilemmababy.jtxr.nl](https://dilemmababy.jtxr.nl) (Render.com)

---

## 👶 1. Concept & Installation Architecture

In the center of the exhibition table sits a speculative, paper-mache simulated baby equipped with biometric internal illumination. Around the baby are three outward-facing displays (mobile phones or tablets):
- **Physical Orientation**: Three participants face each other with the baby situated between them.
- **Asymmetric Perspective**: Each participant scans a single QR code on their smartphone and is automatically assigned one of three perspectives:
  - **Player 1**: *Ecological & Environmental Perspective* (extractive impact, supply chains, rare earth minerals).
  - **Player 2**: *Social Triage & Healthcare Perspective* (waiting queues, mortality statistics, resource rationing).
  - **Player 3**: *Algorithmic & Data Autonomy Perspective* (AI risk scoring, institutional compliance, predictive profiling).
- **Consensus & Biometric Feedback**:
  - **Unanimous Alignment (100% agreement)**: The baby calms down and happiness increases (+1, up to 10). Emits harmonic emerald swell.
  - **Discord / Split Decision**: The baby enters distress and happiness decreases (-1, down to 0). Emits erratic crimson tachycardic glitch.
  - **Baseline Equilibrium**: The session commences at happiness level **5** (neutral).
- **Autonomous Operation**: The installation operates completely autonomously without requiring facilitator intervention to start or advance directives. Facilitators have access to an optional Host Dashboard for overrides.

```
                   [ Mobile Players / QR Code ]
                    (100% English Mobile UI)
             Slot 1            Slot 2            Slot 3
          (Ecological)     (Social Triage)     (Autonomy)
               \                 |                 /
                ▼                ▼                ▼
         ==================================================
           ONLINE SERVER (Render.com: dilemmababy.jtxr.nl)
             - Express + Socket.io (WSS & /ping Keep-Alive)
             - Dynamic Slots & Waiting Room Queue
             - Autonomous Inactivity Timer (30s + 6s Warning)
         ==================================================
                                 │
                     Socket.io Client Relay
                                 ▼
         ==================================================
                LOCAL HOST LAPTOP (`local_hub.js`)
         ==================================================
                │                                  │
         OSC (UDP: 8000)                    USB Serial (9600 baud)
                ▼                                  ▼
         [ TouchDesigner ]                  [ Arduino / ESP32 ]
         Visuals & Sound FX                 WS2812B NeoPixel Strip
         `/baby/happiness`                  `HAPPINESS:X\n`
         `/baby/state`                      `V:1\n` / `V:0\n`
         `/baby/pulse`                      `RESET\n`
```

---

## 🚀 2. Quick Start

### A. Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the online server (runs on port 3000 by default)
npm start

# 3. In another terminal on the host laptop, run the local relay hub:
npm run hub -- --local
```

### B. Endpoints & URLs
- **Player Interface (Join via QR Code)**: `http://localhost:3000/` or `https://dilemmababy.jtxr.nl/`
- **Host & Admin Dashboard**: `http://localhost:3000/host.html` or `https://dilemmababy.jtxr.nl/host.html`
- **Uptime & Health Keep-Alive**: `http://localhost:3000/ping` or `https://dilemmababy.jtxr.nl/ping`

---

## ☁️ 3. Deploying to Render.com (`dilemmababy.jtxr.nl`)

The server is optimized for Render's free tier with automated cold-start handling:
1. Link your GitHub repository (`JTReerink/DilemmaBaby`) in Render.com.
2. Select **Web Service** with the following settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
3. In **Custom Domains**, add `dilemmababy.jtxr.nl` and configure the CNAME / DNS records.
4. **Cold-Start Resilience**:
   - Render spins down web services after 15 minutes of inactivity. The player interface features a built-in **"Waking up baby simulator..."** banner that informs visitors during the 30–50s spin-up time while Socket.io automatically reconnects.
   - You can also ping `https://dilemmababy.jtxr.nl/ping` every 10 minutes via an uptime monitor (e.g. UptimeRobot or cron-job.org) to keep the service permanently warm during festival hours.

---

## 📱 4. Player Mobile Experience (`/index.html`)

- **Language**: Strictly **100% English** for international festival visitors.
- **Single QR Code Join**: All participants scan the identical QR code. Slots 1, 2, and 3 are assigned in order of connection.
- **Manual Game Start in Lobby**:
  - The game does **not** auto-start upon 2 players joining.
  - When 2 or 3 players are in the lobby, a prominent **"▶ Start Game"** button appears. Any connected player can click it to commence the session.
- **Late 3rd Player Mid-Game Joining**:
  - If a session is started with 2 players and a 3rd participant joins mid-game, they receive a prompt:
    - **Option 1**: *"Join Current Game"* (Assigns them Slot 3 and brings them immediately to the active directive).
    - **Option 2**: *"Wait for Next Game"* (Places them in the waiting queue to start from Directive 01).
- **Waiting Room Queue**: If a 4th or subsequent participant connects while a session is active, they see a clean waiting screen:
  `"Queue position: #1. Waiting for current session to finish..."`
  When an active player leaves or the session resets, queued visitors are automatically promoted to active slots.
- **Tactile Dilemma Voting**:
  - Displays the case title, choices (Option A & Option B), and the player's secret perspective.
  - Buttons provide tactile vibration feedback on supported smartphones.
  - Upon selecting an option, the vote is locked in with a pending confirmation message.
- **Inactivity Protection & Stopped Screen**:
  - **No Timeout for Waiting Room**: Participants waiting in line never receive idle warnings.
  - **Live Countdown on Extend Button**: When 30 seconds of inactivity elapse, a 6-second modal pops up and the header button counts down in real time: *"⏱️ Extend (6s)"* -> *(5s)*...
  - **Session Ended Confirmation Screen**: If 6 seconds expire without response, the active players see a dedicated screen: *"Session Ended due to inactivity. The game has stopped."* with a **"Return to Lobby"** button.

---

## 🎛️ 5. Host & Facilitator Dashboard (`/host.html`)

The Host Dashboard provides comprehensive monitoring and customization:

### Tab 1: Live Facilitation & Queue Management
- **Live Biometric Status**: Real-time display of happiness level (0–10), active slot assignments, and live queue count.
- **Interactive Waiting Queue Manager**:
  - Renders live list of all queued participants.
  - **Reorder Priority**: Use `▲` (Move Up) or `▼` (Move Down) to reorder participant queue priority.
  - **Direct Slot Promotion**: Click **"Promote (Slot X)"** to immediately admit a waiting participant into any open slot.
- **Vote Matrix**: Real-time inspection of who has voted for Option A or B.
- **Facilitator Controls**:
  - `Adjust Happiness`: Manual `+1` / `-1` or direct slider override.
  - `Skip Dilemma`: Advance immediately to the next case.
  - `Reset Session`: Reset to baseline neutral 5 and return to the lobby.
- **Abstention Tolerance**: If a player abstains or walks away, the host can force-reveal without penalizing consensus if the active participants agree.

### Tab 2: Dilemma CMS Editor
- Dynamically view, edit, add, or delete neonatal dilemmas without modifying source code.
- Customizes Title, Options (A & B), and Perspectives (1, 2, 3).
- Saves directly to `data/dilemmas.json` and synchronizes all active screens.

### Tab 3: UI Text Customizer
- Facilitators can edit all player-facing UI strings on the fly:
  - Consensus Success Message (*"Unanimous decision reached! The baby calms down."*)
  - Conflict Warning Message (*"No consensus reached! The baby becomes uneasy."*)
  - Lobby waiting, ready, and auto-start banners.
  - Queue waiting room text.
  - Inactivity modal warning messages.
- Saves immediately to `data/settings.json` and updates connected clients.

---

## ⚡ 6. Local Laptop Relay (`local_hub.js`)

`local_hub.js` runs locally on the host laptop next to the installation to bridge the cloud server to TouchDesigner and the Arduino.

### Running the Hub:
```bash
# Connect to production cloud server (default: dilemmababy.jtxr.nl):
npm run hub

# Connect to local test server:
npm run hub -- --local

# Specify explicit serial port and OSC target:
node local_hub.js --server https://dilemmababy.jtxr.nl --port COM3 --osc-port 8000

# Simulation mode (no Arduino or serial hardware needed):
npm run hub -- --sim
```

### Supported CLI Flags:
| Flag | Description | Default |
|---|---|---|
| `--server <url>` | Socket.io server endpoint | `https://dilemmababy.jtxr.nl` |
| `--local` | Connects to `http://localhost:3000` | — |
| `--port <com>` | Arduino USB Serial Port (`COM3`, `/dev/ttyUSB0`) | Auto-detect |
| `--baud <baud>` | Serial baud rate | `9600` |
| `--osc-host <ip>` | OSC receiver IP (TouchDesigner) | `127.0.0.1` |
| `--osc-port <p>` | OSC receiver UDP port | `8000` |
| `--sim` | Run in headless simulation mode | `false` |

### TouchDesigner OSC Specification:
Incoming OSC messages sent to `127.0.0.1:8000`:
- `/baby/happiness` *(int: 0–10)*: Current biometric happiness score.
- `/baby/state` *(string)*: Current state (`lobby`, `ready`, `active`, `revealed`, `completed`).
- `/baby/pulse` *(int: 1 or 0)*: Trigger on vote reveal (1 = Consensus swell, 0 = Conflict glitch).
- `/baby/pulseType` *(string)*: `'consensus'` or `'conflict'`.
- `/baby/dilemmaIndex` *(int)*: Zero-based index of current active dilemma.
- `/baby/connected` *(int: 1 or 0)*: Cloud server connection status.

---

## 🤖 7. Arduino NeoPixel Controller (`AutonomyBaby.ino`)

The sketch at `arduino/AutonomyBaby/AutonomyBaby.ino` drives the WS2812B NeoPixel strip inside the paper-mache baby.

### Hardware Wiring:
- **NeoPixel Strip DIN**: Arduino Digital Pin `6` (configurable).
- **Power**: 5V and GND (use external 5V power if driving >15 NeoPixels).
- **Standard RGB Fallback**: If using a classic 4-pin RGB LED, set `#define USE_NEOPIXEL 0` (Pins 9, 10, 11).

### Dynamic Biometric Behavior:
- **Happiness 10 (Tranquil Equilibrium)**:
  - Color: Soothing cyan-green `(0, 255, 180)`.
  - Rhythm: Deep, slow meditative breathing (~20 breaths/min).
- **Happiness 5 (Baseline Neutral)**:
  - Color: Warm soft yellow `(255, 190, 20)`.
  - Rhythm: Steady biomimetic heartbeat (~60 bpm).
- **Happiness 0 (Distress Crisis)**:
  - Color: Alarming pure crimson `(255, 0, 0)`.
  - Rhythm: Rapid tachycardia palpitations (~150 bpm) with sudden erratic glitch jitters.

### Serial Protocol (9600 Baud):
| Command | Action |
|---|---|
| `HAPPINESS:X\n` or `H:X\n` | Updates happiness to `X` (0–10) with smooth continuous color blending |
| `V:1\n` or `PULSE:consensus\n` | Triggers double harmonic emerald swell |
| `V:0\n` or `PULSE:conflict\n` | Triggers 5-step rapid red electric glitch spasm |
| `RESET\n` | Resets happiness to neutral 5 |
| `TEST:<COLOR>\n` | Tests hardware output (`RED`, `GREEN`, `CYAN`, `YELLOW`) |

---

## 🧪 8. Automated Testing

To run the full end-to-end test suite:
```bash
node -e "require('./scratch/test_festival_flow.js')"
```
This runs 24 automated checks verifying:
- `/ping` endpoint response
- 3-player slot assignment and unique perspectives
- 4th player waiting room queueing
- Autonomous start & voting evaluation
- Inactivity extension socket flow
- Host CMS dilemma & settings persistence
- Disconnect handling & dynamic queue promotion
