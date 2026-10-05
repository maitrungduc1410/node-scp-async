---
description: "node-scp 命令行：用 npx 像 scp 一样复制，文件最终放在哪里，从环境变量读取凭据，固定主机密钥，以及所有选项的说明。"
---

# 命令行

`node-scp` 的用法和 `scp` 一样，并且会替你选择 SFTP 或 SCP。无需全局安装，`npx` 会自动下载：

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

## 常用命令 {#everyday-commands}

```sh
# 上传一个目录
npx node-scp -r ./dist deploy@example.com:/var/www/app

# 把一个文件下载到本地目录中（注意末尾的斜杠）
npx node-scp root@192.168.1.1:/etc/config/network ./backup/

# 有多个源时，总是放进目标目录中
npx node-scp -r ./public ./package.json deploy@example.com:/srv/app/

# 跳过文件；模式中不含 / 时，会匹配任意层级
npx node-scp -r --exclude node_modules --exclude '*.map' . deploy@example.com:/srv/app/

# 自定义端口，两种写法都可以
npx node-scp -P 2222 ./file.txt deploy@example.com:/tmp/
npx node-scp ./file.txt scp://deploy@example.com:2222/tmp/

# 没有 SFTP、登录又慢的设备
npx node-scp --protocol scp --timeout 60000 ./firmware.bin admin@10.0.0.10:flash:firmware.bin
```

远程位置的写法是 `[user@]host:[path]` 或 `scp://[user@]host[:port]/[path]`。

## 文件最终放在哪里 {#where-files-end-up}

与库不同，命令行遵循 `scp` 的规则：目标是已存在的目录或以 `/` 结尾时，源会被复制到它**里面**。

<DestinationDemo initial="cli" />

## 登录 {#logging-in}

命令行会从以下位置收集凭据：

| 来源 | 用途 |
| --- | --- |
| `NODE_SCP_PRIVATE_KEY` | 私钥内容。优先于 `-i`。 |
| `-i <file>` | 私钥文件。 |
| `NODE_SCP_PASSPHRASE` | 加密私钥的口令。 |
| `NODE_SCP_PASSWORD` | 密码。 |
| `SSH_AUTH_SOCK` | 正在运行的 ssh-agent。 |
| `~/.ssh/id_ed25519`、`id_ecdsa`、`id_rsa` | 仅当以上都未设置时使用：取其中第一个存在的文件。 |

找到的所有凭据都会提供给服务器。ssh2 会先尝试密码，然后是私钥，最后是 agent。

命令行从不接受通过参数传入密码，因为参数会留在 shell 历史和进程列表中。请使用环境变量：

```sh
NODE_SCP_PASSWORD="$ROUTER_PASSWORD" npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## 固定主机密钥 {#pin-the-host-key}

不提供指纹时，命令行会接受任何主机密钥并打印警告。请在可信网络中获取一次指纹，之后每次都传入：

```sh
ssh-keyscan -t ed25519 example.com 2>/dev/null | ssh-keygen -lf -
# 256 SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk example.com (ED25519)

npx node-scp --fingerprint SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk -r ./dist deploy@example.com:/var/www/app
```

`--fingerprint` 可以重复使用，`NODE_SCP_FINGERPRINT` 接受以逗号分隔的列表。

## 所有选项 {#all-options}

| 选项 | 含义 |
| --- | --- |
| `-r`, `--recursive` | 复制目录。 |
| `-p`, `--preserve` | 保留文件的 mode 和时间。 |
| `-P`, `--port <port>` | SSH 端口，默认为 22。 |
| `-i`, `--identity <file>` | 私钥文件。 |
| `-u`, `--user <name>` | 远程位置中没有用户名时使用的用户名。 |
| `--protocol <name>` | `auto`（默认）、`sftp` 或 `scp`。 |
| `-c`, `--concurrency <n>` | SFTP 复制目录时并行传输的文件数，默认为 4。 |
| `--exclude <pattern>` | 跳过匹配的条目，可重复使用。 |
| `--fingerprint <fp>` | 期望的主机密钥，格式为 `SHA256:...`，可重复使用。 |
| `--scp-command <cmd>` | 远程的 scp 命令，默认为 `scp`。 |
| `--timeout <ms>` | 连接超时，默认为 20000。 |
| `-q`, `--quiet` | 只输出错误。 |
| `-h`, `--help` / `-V`, `--version` | 帮助和版本。 |

## 在 CI 中使用 {#in-ci}

[GitHub Action](/zh/recipes/github-actions) 封装的就是这个命令行。在其他 CI 系统中，可以直接调用它，并通过环境变量传入私钥：

```sh
NODE_SCP_PRIVATE_KEY="$DEPLOY_KEY" npx node-scp@1 -r --fingerprint "$DEPLOY_FP" dist/ deploy@example.com:/var/www/app
```
