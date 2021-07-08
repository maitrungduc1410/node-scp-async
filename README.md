# New SCP module for NodeJS
A lightweight, fast and secure module to perform SCP commands for NodeJS based on SSH2
# What's new
All functionalities are written using Promise. That means you can use it with `Promise` or `Async/Await` (No more callback hell, Yeah :) )

And other new features:
- Scp a directory from local to remote server and from remote to local
- Perform commands on remote server: `mkdir`, `stat`, check if path exists

# Table of Contents

* [Installation](#installation)
* [Guide](#guide)
  * [Scp file from local to remote server](#scp-file-from-local-to-remote-server)
  * [Scp file from remote server to local](#Scp-file-from-remote-server-to-local)
  * [Scp a directory from local to remote server](#Scp-a-directory-from-local-to-remote-server)
  * [Scp a directory from remote server to local](#Scp-a-directory-from-remote-server-to-local)
  * [Create a directory on remote server](#Create-a-directory-on-remote-server)
  * [Check if a path exists on remote server](#Check-if-a-path-exists-on-remote-server)
  * [Get stats of a path on remote server](#Get-stats-of-a-path-on-remote-server)
  * [List all files in remote directory](#List-all-files-in-remote-directory)
  * [Convert relative path to absolute path on remote server](#Convert-relative-path-to-absolute-path-on-remote-server)
  * [Connection options](#Connection-options)

# Installation
```
npm install --save node-scp
# or
yarn add node-scp
```
# Guide
## Scp file from local to remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.uploadFile('./test.txt', '/workspace/test.txt')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.uploadFile('./test.txt', '/workspace/test.txt')
    // you can perform upload multiple times
    await client.uploadFile('./test1.txt', '/workspace/test1.txt')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Scp file from remote server to local
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.downloadFile('/workspace/test.txt', './test.txt')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test () {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.downloadFile('/workspace/test.txt', './test.txt')
    client.close() // remember to close connection after you finish
  } catch(e) {
    console.log(e)
  }
}

test()
```

## Scp a directory from local to remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.uploadDir('./local/dir', '/server/path')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async funtion test () {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.uploadDir('./local/dir', '/server/path')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Scp a directory from remote server to local
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.downloadDir('/server/path', 'local/path')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async funtion test () {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.downloadDir('./local/dir', '/server/path')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Create a directory on remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.mkdir('/server/path')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.mkdir('/server/path')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Check if a path exists on remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  const result = client.exists('/server/path')
        .then(result => {
          console.log(result)
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'
async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    const result = await client.exists('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Get stats of a path on remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.stat('/server/path')
        .then(result => {
          console.log(result)
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    cosnt result = await client.stat('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## List all files in remote directory
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.list('/server/path')
        .then(result => {
          console.log(result)
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    cosnt result = await client.list('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Convert relative path to absolute path on remote server
Using `Promise`
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

Client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.realPath('/server/path')
        .then(result => {
          console.log(result)
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
// with commonJS
const { Client } = require('node-scp')

// with ES Module
import { Client } from 'node-scp'

async function test() {
  try {
    const client = await Client({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    cosnt result = await client.realPath('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Connection options
Below are available options you can pass when connecting to server:
- **host**: - *string* - Hostname or IP address of the server. **Default**: `localhost`
- **port** - *integer* - Port number of the server. **Default**: `22`
- **forceIPv4** - *boolean* - Only connect via resolved IPv4 address for `host`. **Default**: `false`
- **forceIPv6** - *boolean* - Only connect via resolved IPv6 address for `host`. **Default**: `false`
- **username** - *string* - Username for authentication. **Default**: (none)
- **password** - *string* - Password for password-based user authentication. **Default**: (none)
- **privateKey** - *mixed* - `Buffer` or `string` that contains a private key for either key-based or hostbased user authentication (OpenSSH format). **Default**: (none)
- **passphrase** - *string* - For an encrypted private key, this is the passphrase used to decrypt it. **Default**: (none)
- **readyTimeout** - *integer* - FHow long (in milliseconds) to wait for the SSH handshake to complete. **Default**: `20000`
- **keepaliveInterval** - *integer* - How often (in milliseconds) to send SSH-level keepalive packets to the server (in a similar way as OpenSSH's ServerAliveInterval config option). Set to 0 to disable. **Default**: `0`
- **keepaliveCountMax** - *integer* -  How many consecutive, unanswered SSH-level keepalive packets that can be sent to the server before disconnection (similar to OpenSSH's ServerAliveCountMax config option). **Default**: `3`
- **remoteOsType** - string (value: `posix` | `win32`): use backslash `\` for Windows or slash `/` on posix system (Linux, MacOS) when handling remote server path. **Default**: `posix`
- **Default authentication method order**: None -> Password -> Private Key
# Support
If you like this project, give me 1 ⭐️