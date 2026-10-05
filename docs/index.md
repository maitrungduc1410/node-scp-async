---
description: "Copy files to and from any SSH server from Node.js: SFTP when the server has it, the real SCP protocol when it does not. Library, CLI and GitHub Action."
layout: home

hero:
  name: node-scp
  text: Copy files over SSH, to any server
  tagline: SFTP when the server has it, the real SCP protocol when it does not. One small API for cloud VMs, OpenWrt routers and network gear.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is node-scp?
      link: /guide/
    - theme: alt
      text: API reference
      link: /api/

features:
  - icon: 🔀
    title: Works where SFTP does not
    details: "protocol: 'auto' uses SFTP when the server offers it and falls back to SCP, so Dropbear, routers and switches just work."
    link: /guide/protocols
    linkText: How it picks
  - icon: ⚡
    title: Fast with many files
    details: Parallel SFTP transfers and TCP_NODELAY make trees of small files up to 10 times faster than other ssh2 based libraries.
    link: /comparison
    linkText: See the numbers
  - icon: 🛡️
    title: Safe by default
    details: Remote paths are shell quoted, names sent by the server are checked against path traversal, and the CLI pins host keys.
    link: /guide/connecting#verify-the-host-key
    linkText: Verify the server
  - icon: 🧭
    title: Modern API
    details: TypeScript, ESM and CommonJS, await using, AbortSignal, progress events, filters and typed errors with stable codes.
    link: /guide/transfers
    linkText: Upload and download
  - icon: 🧰
    title: CLI and GitHub Action
    details: The same engine as npx node-scp and as a deploy step in your workflows, with exclude patterns and host key pinning.
    link: /guide/cli
    linkText: Command line
  - icon: 🔁
    title: Easy upgrades
    details: Drop in layers for node-scp 0.x and the unmaintained scp2 package. Change one import, then move at your own pace.
    link: /migration/from-0.x
    linkText: Upgrade guides
---

<div class="home-section vp-doc">

## Copy a folder in three lines

::: code-group

```ts [Library]
import { connect } from 'node-scp';

await using client = await connect({ host: 'example.com', username: 'deploy', privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
```

```ts [One call]
import { upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
```

```sh [CLI]
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

```yaml [GitHub Action]
- uses: maitrungduc1410/node-scp-async@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: deploy
    private-key: ${{ secrets.DEPLOY_KEY }}
    source: dist/
    target: /var/www/app
```

:::

## Works with the servers you actually have

Pick a server to see what node-scp does with it.

<!--@include: ./parts/server-picker.md-->

## How it picks the protocol

```mermaid
flowchart LR
  A(["connect()"]) --> B{"protocol option"}
  B -- "'scp'" --> S["SCP<br/>scp -t / scp -f over an exec channel"]
  B -- "'auto' (default) or 'sftp'" --> C{"Does the server<br/>offer SFTP?"}
  C -- yes --> F["SFTP<br/>client.fs is available"]
  C -- "no, and 'auto'" --> S
  C -- "no, and 'sftp'" --> E["ERR_SFTP_UNAVAILABLE"]
```

## Fast where it matters

Uploads to OpenSSH on the same machine, mean of several runs. Most of the gap on small files comes
from `TCP_NODELAY`; [the comparison page](/comparison) explains it.

<BenchChart />

</div>
