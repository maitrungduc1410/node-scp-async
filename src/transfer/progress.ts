import type { TransferProgress } from '../types';

/** Aggregates per-file byte counts into {@link TransferProgress} events. */
export class ProgressTracker {
  transferred = 0;
  filesCompleted = 0;
  directories = 0;
  readonly #onProgress: ((progress: TransferProgress) => void) | undefined;
  readonly #total: number | undefined;
  readonly #filesTotal: number | undefined;
  readonly #perFile = new Map<string, number>();

  constructor(
    onProgress: ((progress: TransferProgress) => void) | undefined,
    total: number | undefined,
    filesTotal: number | undefined,
  ) {
    this.#onProgress = onProgress;
    this.#total = total;
    this.#filesTotal = filesTotal;
  }

  /** Records that `fileTransferred` bytes of `path` have moved so far. */
  update(path: string, fileTransferred: number, fileSize: number): void {
    const previous = this.#perFile.get(path) ?? 0;
    const delta = fileTransferred - previous;
    if (delta <= 0 && fileTransferred !== 0) return;
    this.#perFile.set(path, fileTransferred);
    this.transferred += Math.max(0, delta);
    this.#emit(path, fileTransferred, fileSize);
  }

  complete(path: string, fileSize: number): void {
    const previous = this.#perFile.get(path) ?? 0;
    if (fileSize > previous) this.transferred += fileSize - previous;
    this.#perFile.delete(path);
    this.filesCompleted++;
    this.#emit(path, fileSize, fileSize);
  }

  #emit(path: string, fileTransferred: number, fileSize: number): void {
    this.#onProgress?.({
      path,
      fileTransferred,
      fileSize,
      transferred: this.transferred,
      total: this.#total,
      filesCompleted: this.filesCompleted,
      filesTotal: this.#filesTotal,
    });
  }
}
