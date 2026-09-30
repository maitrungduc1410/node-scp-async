import type { Readable } from 'node:stream';

const HIGH_WATER_MARK = 1 << 20;
const LOW_WATER_MARK = 1 << 18;

export class EndOfStreamError extends Error {
  override readonly name = 'EndOfStreamError';
}

/**
 * Pull based reader over a push based stream. Pauses the source while more than
 * {@link HIGH_WATER_MARK} bytes are buffered so a slow disk applies backpressure to the channel.
 */
export class ByteReader {
  readonly #stream: Readable;
  readonly #chunks: Buffer[] = [];
  #size = 0;
  #ended = false;
  #error: Error | undefined;
  #paused = false;
  #wake: (() => void) | undefined;

  constructor(stream: Readable) {
    this.#stream = stream;
    stream.on('data', (chunk: Buffer) => {
      this.#chunks.push(chunk);
      this.#size += chunk.length;
      if (this.#size >= HIGH_WATER_MARK && !this.#paused) {
        this.#paused = true;
        stream.pause();
      }
      this.#notify();
    });
    const end = () => {
      this.#ended = true;
      this.#notify();
    };
    stream.on('end', end);
    stream.on('close', end);
    stream.on('error', (err: Error) => {
      this.#error = err;
      this.#notify();
    });
  }

  /** Reads one byte, or returns `null` at a clean end of stream. */
  async readByte(): Promise<number | null> {
    if (!(await this.#fill(1))) return null;
    return this.#take(1)[0]!;
  }

  /** Reads up to and excluding the next `\n`. */
  async readLine(maxLength = 64 * 1024): Promise<string> {
    for (;;) {
      const index = this.#indexOfNewline();
      if (index !== -1) {
        const line = this.#take(index + 1);
        return line.subarray(0, index).toString('utf8');
      }
      if (this.#size > maxLength) throw new Error('SCP control line is too long');
      if (!(await this.#fill(this.#size + 1))) {
        throw new EndOfStreamError('Channel closed in the middle of a control line');
      }
    }
  }

  /** Yields exactly `length` bytes as they arrive. */
  async *readExactly(length: number): AsyncGenerator<Buffer> {
    let remaining = length;
    while (remaining > 0) {
      if (!(await this.#fill(1))) {
        throw new EndOfStreamError(`Channel closed with ${remaining} bytes still expected`);
      }
      const chunk = this.#take(Math.min(remaining, this.#chunks[0]!.length));
      remaining -= chunk.length;
      yield chunk;
    }
  }

  #indexOfNewline(): number {
    let offset = 0;
    for (const chunk of this.#chunks) {
      const i = chunk.indexOf(0x0a);
      if (i !== -1) return offset + i;
      offset += chunk.length;
    }
    return -1;
  }

  async #fill(n: number): Promise<boolean> {
    while (this.#size < n) {
      if (this.#error) throw this.#error;
      if (this.#ended) return false;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
    return true;
  }

  #take(n: number): Buffer {
    let out: Buffer;
    const first = this.#chunks[0]!;
    if (first.length === n) {
      out = first;
      this.#chunks.shift();
    } else if (first.length > n) {
      out = first.subarray(0, n);
      this.#chunks[0] = first.subarray(n);
    } else {
      out = Buffer.allocUnsafe(n);
      let written = 0;
      while (written < n) {
        const chunk = this.#chunks[0]!;
        const count = Math.min(chunk.length, n - written);
        chunk.copy(out, written, 0, count);
        written += count;
        if (count === chunk.length) this.#chunks.shift();
        else this.#chunks[0] = chunk.subarray(count);
      }
    }
    this.#size -= n;
    if (this.#paused && this.#size <= LOW_WATER_MARK) {
      this.#paused = false;
      this.#stream.resume();
    }
    return out;
  }

  #notify(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }
}
