/* ==============================================================================
   AUTONOMY BABY - ARDUINO / ESP32 LED CONTROLLER
   Exhibition: "Reimagining Autonomy" (Society 5.0 Festival)
   
   Controls the internal biometric lighting inside the paper-mache baby.
   Receives Serial commands from local_hub.js via USB (9600 baud):
     - "HAPPINESS:X\n" or "H:X\n" -> Set happiness level (0 to 10)
     - "V:1\n" or "PULSE:consensus\n" -> Unanimous agreement harmonic wave
     - "V:0\n" or "PULSE:conflict\n"  -> Disagreement distress glitch flash
     - "RESET\n"                      -> Reset to baseline neutral 5
     - "TEST:<COLOR>\n"               -> Diagnostic test (RED, GREEN, YELLOW, CYAN)

   Visual Feedback Behavior:
     - Happiness 10 (Calm):    Smooth green/cyan pulsing (slow, peaceful breathing)
     - Happiness 5  (Neutral): Soft warm yellow pulsing (steady biomimetic heartbeat)
     - Happiness 0  (Distress): Rapid red/glitch pulsing (erratic tachycardic distress)
   ============================================================================== */

// Set to 1 for WS2812B / NeoPixel addressable strip, or 0 for standard analog RGB LED
#define USE_NEOPIXEL 1

#if USE_NEOPIXEL
  #include <Adafruit_NeoPixel.h>
  #define LED_PIN      6
  #define NUM_LEDS     12   // Adjust to match your strip length inside the baby
  #define BRIGHTNESS   200  // 0 (off) to 255 (maximum brightness)
  Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);
#else
  // Standard 4-pin RGB LED fallback (PWM pins)
  #define PIN_RED      9
  #define PIN_GREEN    10
  #define PIN_BLUE     11
  // Set to 1 for Common Anode LED, 0 for Common Cathode LED
  #define COMMON_ANODE 0
#endif

// --- State Variables ---
int currentHappiness = 5;       // 0 (crisis distress) to 10 (optimal equilibrium)
float pulsePhase = 0.0;
unsigned long lastLoopTime = 0;
bool isFlashing = false;

// Color structure
struct ColorRGB {
  byte r;
  byte g;
  byte b;
};

// Continuous color gradient based on happiness (0 to 10)
// 0: Critical Distress Red       (255, 0, 0)
// 5: Warm Equilibrium Yellow    (255, 190, 20)
// 10: Tranquil Green/Cyan Bliss (0, 255, 180)
ColorRGB calculateHappinessColor(int h) {
  h = constrain(h, 0, 10);
  ColorRGB col;

  if (h <= 5) {
    float ratio = (float)h / 5.0; // 0.0 at h=0, 1.0 at h=5
    col.r = 255;
    col.g = (byte)(ratio * 190.0);
    col.b = (byte)(ratio * 20.0);
  } else {
    float ratio = (float)(h - 5) / 5.0; // 0.0 at h=5, 1.0 at h=10
    col.r = (byte)(255.0 - (ratio * 255.0));
    col.g = (byte)(190.0 + (ratio * 65.0));
    col.b = (byte)(20.0  + (ratio * 160.0));
  }

  return col;
}

// Low-level hardware color output
void writeHardwareColor(byte r, byte g, byte b) {
#if USE_NEOPIXEL
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
#else
  if (COMMON_ANODE) {
    analogWrite(PIN_RED,   255 - r);
    analogWrite(PIN_GREEN, 255 - g);
    analogWrite(PIN_BLUE,  255 - b);
  } else {
    analogWrite(PIN_RED,   r);
    analogWrite(PIN_GREEN, g);
    analogWrite(PIN_BLUE,  b);
  }
#endif
}

// Function forward declarations
void handleCommand(String cmd);
void triggerConsensusWave();
void triggerConflictGlitch();

// --- Setup ---
void setup() {
  Serial.begin(9600);
  randomSeed(analogRead(0));

#if USE_NEOPIXEL
  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show();
#else
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BLUE, OUTPUT);
#endif

  // Initial neutral lighting
  ColorRGB initColor = calculateHappinessColor(currentHappiness);
  writeHardwareColor(initColor.r, initColor.g, initColor.b);

  Serial.println("AUTONOMY_BABY_INITIALIZED");
  Serial.print("ACK_HAPPINESS:");
  Serial.println(currentHappiness);
}

// --- Main Loop ---
void loop() {
  // 1. Process Serial Commands from local_hub.js
  while (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      handleCommand(cmd);
    }
  }

  if (isFlashing) return;

  // 2. Dynamic Heartbeat & Breathing Rhythm Animation
  unsigned long now = millis();
  if (now - lastLoopTime >= 25) { // ~40 FPS animation loop
    float delta = (now - lastLoopTime) / 1000.0;
    lastLoopTime = now;

    // Pulsing rate scales inversely with happiness:
    // Happiness 10 -> Slow, deep, calm breathing (~0.35 Hz = ~21 breaths/min)
    // Happiness 5  -> Steady rhythmic heartbeat (~1.0 Hz = ~60 bpm)
    // Happiness 0  -> Rapid, tachycardic agitation (~2.6 Hz = ~156 bpm)
    float frequency = 0.35 + ((10.0 - (float)currentHappiness) * 0.22);
    pulsePhase += frequency * 6.28318 * delta;
    if (pulsePhase > 6.28318) pulsePhase -= 6.28318;

    // Intensity profile:
    // At high happiness: gentle, smooth sinusoidal breathing
    // At low happiness: sharp, irregular cardiac palpitations with random twitch
    float intensity = 0.0;

    if (currentHappiness >= 7) {
      // Gentle sine curve: 0.40 to 1.00
      intensity = 0.40 + (0.60 * ((sin(pulsePhase) + 1.0) / 2.0));
    } else if (currentHappiness >= 3) {
      // Natural cardiac beat (dual peak)
      float s = sin(pulsePhase);
      float beat = (s > 0) ? pow(s, 2.5) : 0.0;
      intensity = 0.30 + (0.70 * beat);
    } else {
      // Distress tachycardia with micro-glitch jitters
      float s = sin(pulsePhase);
      float beat = (s > 0) ? pow(s, 4.0) : 0.0;
      intensity = 0.20 + (0.80 * beat);

      // Random distress flicker (1 in 8 chance per cycle)
      if (random(0, 100) < 12) {
        intensity = intensity * ((float)random(20, 80) / 100.0);
      }
    }

    ColorRGB base = calculateHappinessColor(currentHappiness);
    writeHardwareColor(
      (byte)(base.r * intensity),
      (byte)(base.g * intensity),
      (byte)(base.b * intensity)
    );
  }
}

// --- Command Parser ---
void handleCommand(String cmd) {
  // Happiness updates: "HAPPINESS:7" or "H:7"
  if (cmd.startsWith("HAPPINESS:") || cmd.startsWith("H:")) {
    int colonIdx = cmd.indexOf(':');
    int val = cmd.substring(colonIdx + 1).toInt();
    currentHappiness = constrain(val, 0, 10);
    Serial.print("ACK_HAPPINESS:");
    Serial.println(currentHappiness);
  }
  // Consensus / Conflict flash triggers
  else if (cmd == "V:1" || cmd == "PULSE:consensus") {
    triggerConsensusWave();
  }
  else if (cmd == "V:0" || cmd == "PULSE:conflict") {
    triggerConflictGlitch();
  }
  // Reset command
  else if (cmd == "RESET") {
    currentHappiness = 5;
    Serial.println("ACK_RESET");
    Serial.print("ACK_HAPPINESS:");
    Serial.println(currentHappiness);
  }
  // Diagnostic test commands: "TEST:CYAN", "TEST:YELLOW", "TEST:RED", "TEST:GREEN"
  else if (cmd.startsWith("TEST:")) {
    String colorName = cmd.substring(5);
    colorName.toUpperCase();
    if (colorName == "RED")         writeHardwareColor(255, 0, 0);
    else if (colorName == "GREEN")  writeHardwareColor(0, 255, 100);
    else if (colorName == "CYAN")   writeHardwareColor(0, 255, 200);
    else if (colorName == "YELLOW") writeHardwareColor(255, 190, 20);
    else writeHardwareColor(200, 200, 200);
    delay(400);
  }
}

// --- Consensus Swell: Warm, soothing emerald harmonic wave ---
void triggerConsensusWave() {
  isFlashing = true;
  for (int cycle = 0; cycle < 2; cycle++) {
    // Swell to bright emerald cyan
    for (int b = 40; b <= 255; b += 25) {
      writeHardwareColor(0, b, (byte)(b * 0.7));
      delay(18);
    }
    // Gentle release
    for (int b = 255; b >= 60; b -= 25) {
      writeHardwareColor(0, b, (byte)(b * 0.7));
      delay(18);
    }
  }
  isFlashing = false;
}

// --- Conflict Glitch: Sudden, alarming electric red stutter ---
void triggerConflictGlitch() {
  isFlashing = true;
  for (int i = 0; i < 5; i++) {
    writeHardwareColor(255, 0, 0);     // Sharp crimson flash
    delay(45);
    writeHardwareColor(0, 0, 0);       // Dark void
    delay(35);
  }
  // Lingering embers of alarm
  writeHardwareColor(180, 20, 0);
  delay(120);
  isFlashing = false;
}
