# Autonomy Baby — Interactive Installation
**Exhibition Theme:** *Reimagining Autonomy*  
**Context:** AHK Society 5.0 (Year 3)

---

## 1. Concept & Installation Architecture
In the center of a circular or triangular table sits a simulated baby with internal illumination. Around the baby are three outward-facing screens:
- **Participants**: Sit or stand facing each other across the table with the baby situated between them.
- **Physical Asymmetry**: Participants cannot see each other’s screens directly.
- **Invisible Asymmetry**: Each screen displays the same overarching neonatal dilemma, but the critical findings differ:
  - **Screen 1**: Ecological & systemic resource extraction externalities.
  - **Screen 2**: Medical triage, social priority queues, and human displacement.
  - **Screen 3**: Algorithmic governance, data rights, and loss of personal autonomy.
  *Note:* The UI **does not** label the screens by theme; participants assume they are reading the objective reality and must talk across the table to discover their divergent information.
- **Consensus Rule**:
  - **Unanimous Alignment (3/3 identical)**: The decision counts as a harmonious resolution. Baby happiness increases (+1).
  - **Divergence (split vote)**: The decision fails to achieve consensus. The baby enters distress and happiness decreases (-1).
- **Scale**: Happiness ranges from **0 to 10** (starts at **5**, neutral equilibrium).

---

## 2. Quick Start

### Starting the Server
Double-click `start.bat` in the root folder, or run:
```bash
node server.js
```
The server will start on port `3000` and automatically output local and Wi-Fi network addresses.

### URLs
- **Installation Portal (Launcher)**: `http://localhost:3000/`
- **Screen 1**: `http://localhost:3000/screen.html?id=1`
- **Screen 2**: `http://localhost:3000/screen.html?id=2`
- **Screen 3**: `http://localhost:3000/screen.html?id=3`
- **Host & Admin Dashboard**: `http://localhost:3000/host.html`

*Multi-Device Setup (Tablets / iPads / Laptops):*  
Connect all devices to the same local Wi-Fi router. Open `http://<HOST_IP>:3000` (e.g. `http://192.168.1.50:3000`) on each device.

---

## 3. Host Dashboard & Facilitator Features

The Host Dashboard (`/host.html`) provides two main panels:

### Panel 1: Live Facilitation
- **Reset Experience Button**: Emergency reset that sets happiness to 5, clears all player votes, and returns to Directive 01.
- **Happiness Master Gauge**: Live display (0–10) with manual override buttons (`-1 Distress`, `+1 Harmony`) and an interactive slider.
- **Custodian Matrix**: Live tracking of Screen 1, Screen 2, and Screen 3 indicating who has submitted and which option they chose.
- **Abstention-Tolerant Force Reveal**: If someone does not answer and the host clicks "Force Reveal Outcome", consensus is evaluated solely from active votes (e.g. 2 votes for A and 1 unvoted = Consensus on A).
- **Auto-Continue Countdown**: Once decisions are revealed, all screens display an animated countdown bar and automatically transition to the next directive after a few seconds (default: 8s). The host can change the delay (5s, 8s, 12s, 15s, or Manual), skip the timer, or pause it.
- **Directive Inspector**: View all three screen variations side-by-side to monitor what participants are debating.
- **Round Navigation**: Next Directive, Previous Directive, Reopen Voting, and Force Reveal buttons.
- **Arduino Web Serial Manager**: Connect directly to the Arduino over USB in Google Chrome or Microsoft Edge with 1 click. Includes manual test color buttons and a live serial transmission log.
- **Biometric Soundboard**: Procedural Web Audio API sound triggers (Heartbeat lub-dub, Coo, Whimper) without external sound file dependencies.

### Panel 2: Dilemma & Prompt Editor (Admin CMS)
- Access via the **"Dilemmas & Prompts (Admin)"** tab.
- Easily edit:
  - Case Directive Title
  - Core Context Scenario
  - Screen 1 Specific Finding (Ecological)
  - Screen 2 Specific Finding (Social Triage)
  - Screen 3 Specific Finding (Autonomy)
  - Choice A Label & Subtext
  - Choice B Label & Subtext
- Add new cases, duplicate existing ones, or delete cases.
- Click **"Save All Changes & Synchronize Screens"** to save directly to `data/dilemmas.json` on the server and update all active screens in real time.

---

## 4. Arduino LED Integration

When you are ready to connect the physical baby's LED:
1. Open the reference sketch at `arduino/AutonomyBaby/AutonomyBaby.ino` in the Arduino IDE.
2. In the sketch header, set:
   - `USE_NEOPIXEL 1` if using a WS2812B addressable strip (Pin 6).
   - `USE_NEOPIXEL 0` if using a standard analog 4-pin RGB LED (Pins 9, 10, 11).
3. Upload to your Arduino (Uno, Nano, Mega, or ESP32).
4. Plug the Arduino into the host computer's USB port.
5. In Chrome or Edge on the Host Dashboard (`/host.html`), click **"Connect Arduino"** and select the Arduino COM port.
6. The dashboard will automatically stream serial commands:
   - `H:<0-10>\n` (sets happiness level and color)
   - `V:1\n` (triggers consensus green harmonic wave)
   - `V:0\n` (triggers discord red glitch)
   - `RESET\n` (resets to neutral 5)
