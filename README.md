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
  * [Create a directory on remote server](#Create-a-directory-on-remote-server)
  * [Check if a path exists on remote server](#Check-if-a-path-exists-on-remote-server)
  * [Get stats of a path on remote server](#Get-stats-of-a-path-on-remote-server)
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
const scp = require('node-scp')

scp({
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
const scp = require('node-scp')

async function test() {
  try {
    const c = await scp({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await c.uploadFile('./test.txt', '/workspace/test.txt')
    c.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Scp file from remote server to local
Using `Promise`
```js
const scp = require('node-scp')

scp({
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
const scp = require('node-scp')

async function test () {
  try {
    const client = await scp({
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
const scp = require('node-scp')

scp({
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
const scp = require('node-scp')

async funtion test () {
  try {
    const client = await scp({
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

## Create a directory on remote server
Using `Promise`
```js
const scp = require('node-scp')

scp({
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
const scp = require('node-scp')

async function test() {
  try {
    const client = await scp({
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
const scp = require('node-scp')

scp({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.exists('/server/path')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
const scp = require('node-scp')
async function test() {
  try {
    const client = await scp({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.exists('/server/path')
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
const scp = require('node-scp')

scp({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
  // privateKey: fs.readFileSync('./key.pem'),
  // passphrase: 'your key passphrase',
}).then(client => {
  client.stat('/server/path')
        .then(response => {
          client.close() // remember to close connection after you finish
        })
        .catch(error => {})
}).catch(e => console.log(e))
```

Using `async/await`:
```js
const scp = require('node-scp')

async function test() {
  try {
    const client = await scp({
      host: 'your host',
      port: 22,
      username: 'username',
      password: 'password',
      // privateKey: fs.readFileSync('./key.pem'),
      // passphrase: 'your key passphrase',
    })
    await client.stat('/server/path')
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

**Default authentication method order**: None -> Password -> Private Key
# Support
If you like this project, give me 1 ⭐️