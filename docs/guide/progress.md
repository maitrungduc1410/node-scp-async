---
description: "Track node-scp transfers with onProgress and cancel them with AbortSignal, including timeouts, with a live demo of what your callback receives."
---

# Progress and cancelling

`upload()` and `download()` take an `onProgress` callback and an `AbortSignal`. Press **Start**
below to watch what your callback receives, then try `controller.abort()` halfway through.

<ProgressDemo />

## What `onProgress` receives

| Field | Meaning |
| --- | --- |
| `path` | The file that is moving right now, relative to what you copy, using `/`. |
| `fileTransferred` / `fileSize` | Bytes of that file done so far, and its size. |
| `transferred` | Bytes done in the whole operation. |
| `total` | Bytes of the whole operation, when known up front. |
| `filesCompleted` | Files finished so far. |
| `filesTotal` | Number of files, when known up front. |

`total` and `filesTotal` are known for uploads and SFTP downloads. An SCP download only learns
about each file when the server sends it, so both are `undefined` there. Write your progress
display so it copes with that:

```ts
const onProgress = (p: TransferProgress) => {
  const done = `${(p.transferred / 1e6).toFixed(1)} MB`;
  const line = p.total ? `${done} of ${(p.total / 1e6).toFixed(1)} MB` : done;
  process.stdout.write(`\r${line}, ${p.filesCompleted} files, now ${p.path}`);
};

await client.download('/var/backups', './backups', { recursive: true, onProgress });
```

The callback runs often, many times per file. Keep it cheap, or throttle what you render.

## Cancel a transfer

Pass the `signal` of an `AbortController` and call `abort()` whenever you want to stop:

```ts
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());

try {
  await client.upload('./media', '/srv/media', { recursive: true, signal: controller.signal });
} catch (err) {
  if (isScpError(err, ErrorCode.Aborted)) console.log('stopped by the user');
  else throw err;
}
```

The promise rejects right away with an `ERR_ABORTED` error. What is already on the other side
stays there: finished files are complete, and a file that was being written may be cut short.
Over SFTP, files already in flight finish in the background.

## Put a time limit on it

`AbortSignal.timeout()` and `AbortSignal.any()` cover the common cases without a controller:

```ts
// Give up after two minutes.
await client.upload('./dist', '/var/www/app', {
  recursive: true,
  signal: AbortSignal.timeout(120_000),
});

// Stop on a timeout or when the user cancels, whichever comes first.
const signal = AbortSignal.any([AbortSignal.timeout(120_000), controller.signal]);
```

Signals work the same on `connect()`, `writeFile()` and `readFile()`.
