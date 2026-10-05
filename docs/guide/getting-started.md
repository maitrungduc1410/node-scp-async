---
description: "Install node-scp, connect with a private key, agent or password, upload a folder and download a file, then close the connection safely with await using."
---

# Getting started

This page takes you from an empty project to your first upload in a few minutes.

## 1. Install

::: code-group

```sh [npm]
npm install node-scp
```

```sh [pnpm]
pnpm add node-scp
```

```sh [yarn]
yarn add node-scp
```

```sh [bun]
bun add node-scp
```

:::

node-scp ships TypeScript types and works with both `import` and `require`.

## 2. Connect and copy

```ts
import { readFileSync } from 'node:fs';
import { connect } from 'node-scp';

const client = await connect({
  host: 'example.com',
  username: 'deploy',
  privateKey: readFileSync('/home/me/.ssh/id_ed25519'),
});

try {
  await client.upload('./dist', '/var/www/app', { recursive: true });
  await client.download('/var/log/app.log', './logs/app.log');
  console.log(`copied over ${client.protocol}`); // 'sftp' or 'scp'
} finally {
  await client.close();
}
```

What happens here:

1. `connect()` opens the SSH connection, logs in and decides between SFTP and SCP.
2. `upload()` copies the local `dist` folder so that `/var/www/app` becomes a copy of it.
   `recursive: true` is needed for folders, like `scp -r`.
3. `download()` copies one remote file. Missing local folders (`./logs`) are created.
4. `close()` ends the connection. Always close, or the process keeps running.

::: tip Let the language close it for you
With `await using` the connection closes at the end of the block, even when something throws.
It needs Node 24 or newer, or TypeScript 5.2 or newer, which compiles it for older Node versions.

```ts
await using client = await connect({ host, username, privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
// closed here
```

:::

## 3. Log in the way your server expects

| You have | Pass to `connect()` |
| --- | --- |
| A private key file | `privateKey: readFileSync(path)` |
| A key with a passphrase | `privateKey` and `passphrase` |
| A running ssh-agent | `agent: process.env.SSH_AUTH_SOCK` |
| A password | `password: process.env.SSH_PASSWORD` |

Keep secrets out of your code: read them from files, environment variables or a secret store.
[Connecting](./connecting) covers keyboard interactive logins, jump hosts and host key checks.

## 4. Or skip the code

The same engine runs from a terminal:

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

See [Command line](./cli), or the [GitHub Action](/recipes/github-actions) for CI.

## Where to go next

- [Upload and download](./transfers): where files end up, filters, permissions, parallel copies.
- [Progress and cancelling](./progress): progress bars and `AbortSignal`, with a live demo.
- [Files in memory](./files-in-memory): write a string or a stream straight to a remote file.
- [Handling errors](./errors): stable error codes you can branch on.
