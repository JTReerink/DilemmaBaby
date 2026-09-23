/* ==============================================================================
   AUTONOMY BABY - ARDUINO LED CONTROLLER
   Exhibition: "Reimagining Autonomy" (Society 5.0)
   
   This sketch controls the internal lighting of the baby simulator.
   It listens to serial commands from the Host Dashboard Web Serial API:
     - "H:5\n"   -> Set happiness level (0 to 10)
     - "V:1\n"   -> Consensus success flash (green harmonic swell)
     - "V:0\n"   -> Consensus failure flash (red distress glitch)
     - "RESET\n" -> Reset to baseline neutral 5
     - "TEST:RED\n", "TEST:GREEN\n", etc.

   Supports:
     - WS2812B / NeoPixel strips (USE_NEOPIXEL = 1)
     - Standard analog RGB LED with PWM (USE_NEOPIXEL = 0)
   ============================================================================== */

// Set to 1 if using WS2812B NeoPixel strip, or 0 if using standard 4-pin RGB LED
#define USE_NEOPIXEL 0

#if USE_NEOPIXEL
  #include <Adafruit_NeoPixel.h>
  #define LED_PIN    6
  #define NUM_LEDS   12
  Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);
#else
  // Standard RGB LED (PWM pins)
  #define PIN_RED    9
  #define PIN_GREEN  10
  #define PIN_BLUE   11
  // Set to 1 for Common Anode LED, 0 for Common Cathode LED
  #define COMMON_ANODE 0
#endif

int currentHappiness = 5; // 0 to 10 (starts at 5 neutral)
unsigned long lastUpdate = 0;
float breathePhase = 0.0;

// Color structure
struct ColorRGB {
  byte r;
  byte g;
  byte b;
};

// Target color palette for happiness 0 to 10
ColorRGB getHappinessColor(int h) {
  switch (h) {
    case 0:  return {255, 0, 0};     // Critical Distress Red
    case 1:  return {255, 20, 0};    // Intense Agitation Red-Orange
    case 2:  return {255, 50, 0};    // Agitated Orange
    case 3:  return {255, 100, 0};   // Troubled Amber-Orange
    case 4:  return {255, 180, 0};   // Anxious Warm Amber
    case 5:  return {0, 180, 255};   // Neutral Equilibrium Cyan
    case 6:  return {0, 220, 200};   // Receptive Aqua
    case 7:  return {40, 220, 120};  // Content Gentle Green
    case 8:  return {0, 240, 80};    // Harmonious Green
    case 9:  return {0, 255, 120};   // Resonant Vibrant Emerald
    case 10: return {0, 255, 200};   // Radiant Golden Bliss
    default: return {0, 180, 255};
  }
}

void setHardwareRGB(byte r, byte g, byte b) {
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

void setup() {
  Serial.begin(9600);

#if USE_NEOPIXEL
  strip.begin();
  strip.setBrightness(180);
  strip.show();
#else
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BLUE, OUTPUT);
#endif

  // Initial neutral state
  ColorRGB initial = getHappinessColor(currentHappiness);
  setHardwareRGB(initial.r, initial.g, initial.b);
  Serial.println("AUTONOMY_BABY_READY");
}

void loop() {
  // Check for incoming serial commands from Web Serial
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleCommand(cmd);
  }

  // Ambient breathing animation
  unsigned long now = millis();
  if (now - lastUpdate > 30) {
    lastUpdate = now;
    
    // Breathing speed adapts to happiness:
    // Low happiness (distress): faster, twitchy
    // High happiness: slow, relaxed, deep
    float speed = 0.05 + ((10 - currentHappiness) * 0.015);
    breathePhase += speed;
    if (breathePhase > 6.28318) breathePhase -= 6.28318;

    float intensity = (sin(breathePhase) + 1.0) / 2.0; // 0.0 to 1.0
    float minBrightness = 0.35;
    float factor = minBrightness + (intensity * (1.0 - minBrightness));

    ColorRGB base = getHappinessColor(currentHappiness);
    setHardwareRGB(
      (byte)(base.r * factor),
      (byte)(base.g * factor),
      (byte)(base.b * factor)
    );
  }
}

void handleCommand(String cmd) {
  if (cmd.startsWith("H:")) {
    int val = cmd.substring(2).toInt();
    currentHappiness = constrain(val, 0, 10);
    Serial.print("ACK_HAPPINESS:");
    Serial.println(currentHappiness);
  } 
  else if (cmd.startsWith("V:")) {
    int outcome = cmd.substring(2).toInt();
    if (outcome == 1) {
      flashGreenWave();
    } else {
      flashRedGlitch();
    }
  } 
  else if (cmd == "RESET") {
    currentHappiness = 5;
    Serial.println("ACK_RESET");
  } 
  else if (cmd.startsWith("TEST:")) {
    String col = cmd.substring(5);
    if (col == "RED") setHardwareRGB(255, 0, 0);
    else if (col == "GREEN") setHardwareRGB(0, 255, 0);
    else if (col == "NEUTRAL") setHardwareRGB(0, 180, 255);
    delay(400);
  }
}

// Temporary flash animations
void flashGreenWave() {
  for (int i = 0; i < 3; i++) {
    setHardwareRGB(0, 255, 100);
    delay(90);
    setHardwareRGB(0, 80, 40);
    delay(70);
  }
}

void flashRedGlitch() {
  for (int i = 0; i < 4; i++) {
    setHardwareRGB(255, 0, 20);
    delay(50);
    setHardwareRGB(0, 0, 0);
    delay(40);
  }
}
