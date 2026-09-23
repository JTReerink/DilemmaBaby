// ============================================================================
// Autonomy Baby - Web Serial API Bridge for Arduino
// Directly streams serial commands to Arduino over USB from Google Chrome / Edge
// ============================================================================

class ArduinoSerialBridge {
  constructor() {
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.isConnected = false;
    this.baudRate = 9600;
    this.onStatusChange = null;
    this.onLog = null;
  }

  isSupported() {
    return 'serial' in navigator;
  }

  log(msg) {
    console.log('[SERIAL]', msg);
    if (this.onLog) this.onLog(msg);
  }

  async connect(baud = 9600) {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
    }

    this.baudRate = Number(baud) || 9600;

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      
      const encoder = new TextEncoderStream();
      this.outputDone = encoder.readable.pipeTo(this.port.writable);
      this.outputStream = encoder.writable;
      this.writer = this.outputStream.getWriter();

      this.isConnected = true;
      this.log(`Connected at ${this.baudRate} baud`);
      if (this.onStatusChange) this.onStatusChange(true);

      // Start reading in background (optional, handles responses from Arduino)
      this.readLoop();

      return true;
    } catch (err) {
      this.isConnected = false;
      this.log(`Connection error: ${err.message}`);
      if (this.onStatusChange) this.onStatusChange(false);
      throw err;
    }
  }

  async readLoop() {
    try {
      const textDecoder = new TextDecoderStream();
      this.inputDone = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.log(`[RX] ${value.trim()}`);
        }
      }
    } catch (err) {
      if (this.isConnected) {
        this.log(`Read error: ${err.message}`);
      }
    }
  }

  async disconnect() {
    this.isConnected = false;
    try {
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
      this.log('Disconnected');
    } catch (err) {
      this.log(`Disconnect error: ${err.message}`);
    }

    if (this.onStatusChange) this.onStatusChange(false);
  }

  async send(command) {
    const formatted = command.endsWith('\n') ? command : command + '\n';
    this.log(`[TX] ${formatted.trim()}`);

    if (!this.isConnected || !this.writer) {
      return false;
    }

    try {
      await this.writer.write(formatted);
      return true;
    } catch (err) {
      this.log(`Write error: ${err.message}`);
      return false;
    }
  }

  // --- Convenience protocol methods for Autonomy Baby ---
  sendHappiness(level) {
    return this.send(`H:${Math.max(0, Math.min(10, level))}`);
  }

  sendVoteResult(isConsensus) {
    return this.send(`V:${isConsensus ? '1' : '0'}`);
  }

  sendReset() {
    return this.send('RESET');
  }

  sendTestColor(colorName) {
    return this.send(`TEST:${colorName.toUpperCase()}`);
  }
}

// Global singleton instance
window.arduinoSerial = new ArduinoSerialBridge();
