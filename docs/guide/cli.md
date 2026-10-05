---
description: "The node-scp command line: scp style copies with npx, where files end up, credentials from the environment, host key pinning and every option explained."
---

# Command line

`node-scp` works like `scp`, with SFTP or SCP chosen for you. There is nothing to install
globally, `npx` fetches it:

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

## Everyday commands

```sh
# Upload a folder
npx node-scp -r ./dist deploy@example.com:/var/www/app

# Download a file into a local folder (note the trailing slash)
npx node-scp root@192.168.1.1:/etc/config/network ./backup/

# Several sources always go into the target folder
npx node-scp -r ./public ./package.json deploy@example.com:/srv/app/

# Skip files, at any depth when the pattern has no /
npx node-scp -r --exclude node_modules --exclude '*.map' . deploy@example.com:/srv/app/

# A custom port, either way
npx node-scp -P 2222 ./file.txt deploy@example.com:/tmp/
npx node-scp ./file.txt scp://deploy@example.com:2222/tmp/

# A device without SFTP, and a slow login
npx node-scp --protocol scp --timeout 60000 ./firmware.bin admin@10.0.0.10:flash:firmware.bin
```

Remote locations are written `[user@]host:[path]` or `scp://[user@]host[:port]/[path]`.

## Where files end up

Unlike the library, the CLI follows `scp` rules: when the target is an existing folder, or ends
with `/`, sources are copied **into** it.

<DestinationDemo initial="cli" />

## Logging in

The CLI collects credentials from these places:

| Source | Used as |
| --- | --- |
| `NODE_SCP_PRIVATE_KEY` | Private key contents. Takes precedence over `-i`. |
| `-i <file>` | Private key file. |
| `NODE_SCP_PASSPHRASE` | Passphrase for an encrypted private key. |
| `NODE_SCP_PASSWORD` | Password. |
| `SSH_AUTH_SOCK` | The running ssh-agent. |
| `~/.ssh/id_ed25519`, `id_ecdsa`, `id_rsa` | Only when none of the above is set: the first of these files that exists. |

Everything it finds is offered to the server. ssh2 tries the password first, then the private
key, then the agent.

Passwords are never accepted as arguments, since those end up in shell history and process
lists. Use the environment:

```sh
NODE_SCP_PASSWORD="$ROUTER_PASSWORD" npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## Pin the host key

Without a fingerprint the CLI accepts any host key and prints a warning. Get the fingerprint once
from a network you trust, then pass it every time:

```sh
ssh-keyscan -t ed25519 example.com 2>/dev/null | ssh-keygen -lf -
# 256 SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk example.com (ED25519)

npx node-scp --fingerprint SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk -r ./dist deploy@example.com:/var/www/app
```

`--fingerprint` can be repeated, and `NODE_SCP_FINGERPRINT` takes a comma separated list.

## All options

| Option | Meaning |
| --- | --- |
| `-r`, `--recursive` | Copy directories. |
| `-p`, `--preserve` | Keep file modes and times. |
| `-P`, `--port <port>` | SSH port. Defaults to 22. |
| `-i`, `--identity <file>` | Private key file. |
| `-u`, `--user <name>` | User name when the location has none. |
| `--protocol <name>` | `auto` (default), `sftp` or `scp`. |
| `-c`, `--concurrency <n>` | Parallel files for SFTP directory copies. Defaults to 4. |
| `--exclude <pattern>` | Skip matching entries. Repeatable. |
| `--fingerprint <fp>` | Expected host key, `SHA256:...`. Repeatable. |
| `--scp-command <cmd>` | Remote scp command. Defaults to `scp`. |
| `--timeout <ms>` | Connection timeout. Defaults to 20000. |
| `-q`, `--quiet` | Print nothing but errors. |
| `-h`, `--help` / `-V`, `--version` | Help and version. |

## In CI

The [GitHub Action](/recipes/github-actions) wraps this CLI. On other CI systems, call it
directly and pass the key through the environment:

```sh
NODE_SCP_PRIVATE_KEY="$DEPLOY_KEY" npx node-scp@1 -r --fingerprint "$DEPLOY_FP" dist/ deploy@example.com:/var/www/app
```
