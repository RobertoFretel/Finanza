export class IdGenerator {
  private lastTimestamp: bigint = 0n;
  private sequence: bigint = 0n;

  /**
   * Genera un ID BigInt basato su Timestamp (ms) + Sequenza
   */
  public nextId(): bigint {
    let now = BigInt(Date.now());

    if (now === this.lastTimestamp) {
      // Se siamo nello stesso millisecondo, incrementa la sequenza
      this.sequence = (this.sequence + 1n) & 0xFFFn; // Max 4095 ID per millisecondo
      if (this.sequence === 0n) {
        // Se la sequenza si esaurisce nello stesso ms, aspetta che il tempo cambi
        while (now <= this.lastTimestamp) {
          now = BigInt(Date.now());
        }
      }
    } else {
      // Nuovo millisecondo, resetta la sequenza
      this.sequence = 0n;
    }

    this.lastTimestamp = now;

    // Sposta il timestamp di 12 bit a sinistra e aggiunge la sequenza
    return (now << 12n) | this.sequence;
  }
}