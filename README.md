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
  * [Sets the attributes defined in attributes for path](#sets-the-attributes-defined-in-attributes-for-path)
  * [List all files in remote directory](#List-all-files-in-remote-directory)
  * [Convert relative path to absolute path on remote server](#Convert-relative-path-to-absolute-path-on-remote-server)
  * [Remove file in remote server](#remove-file-in-remote-server)
  * [Remove a directory in remote server](#remove-a-directory-in-remote-server)
  * [Clean a directory in remote server](#clean-a-directory-in-remote-server)
  * [Write data to a file in remote server](#write-data-to-a-file-in-remote-server)
  * [Set the access time and modified time for path](#sets-the-access-time-and-modified-time-for-path)
  * [Create a symlink](#creates-a-symlink-at-linkpath-to-targetpath)
  * [Rename/Move a source to destination](#renamesmoves-srcpath-to-destpath)
  * [Retrieve the target for a symlink](#retrieves-the-target-for-a-symlink-at-path)
  * [Read a file in memory and returns its contents](#reads-a-file-in-memory-and-returns-its-contents)
  * [Retrieve attributes for path](#retrieves-attributes-for-path)
  * [Append data to a file](#appends-data-to-a-file)
  * [Set the mode for a path](#sets-the-mode-for-path)
  * [Set the owner for a path](#sets-the-owner-for-path)
  * [Events](#events)
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
  client.uploadFile(
    './test.txt',
    '/workspace/test.txt',
    // options?: TransferOptions
  )
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
    await client.uploadFile(
      './test.txt',
      '/workspace/test.txt',
      // options?: TransferOptions
    )
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
  client.downloadFile(
    '/workspace/test.txt',
    './test.txt',
    // options?: TransferOptions
  )
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
    await client.downloadFile(
      '/workspace/test.txt',
      './test.txt',
      // options?: TransferOptions
    )
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
    await client.downloadDir('/server/path', './local/dir')
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
  client.mkdir(
    '/server/path',
    // attributes?: InputAttributes
  )
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
    await client.mkdir(
      '/server/path',
      // attributes: InputAttributes
    )
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
    const result = await client.stat('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Sets the attributes defined in `attributes` for `path`
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
  client.setstat('/server/path', {/* InputAttributes */})
        .then(() => {
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
    await client.setstat('/server/path', {/* InputAttributes */})
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
    const result = await client.list('/server/path')
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
    const result = await client.realPath('/server/path')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```
## Remove file in remote server
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
  client.unlink('/server/path/myfile.txt')
        .then(() => {
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
    await client.unlink('/server/path/myfile.txt')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```
## Remove a directory in remote server
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
  client.rmdir('/server/path')
        .then(() => {
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
    await client.rmdir('/server/path')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```
## Clean a directory in remote server
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
  client.emptyDir('/server/path')
        .then(() => {
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
    await client.emptyDir('/server/path')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Write data to a file in remote server
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
  client.writeFile('/server/path/test.txt', 'some data', { /* WriteFileOptions */ })
        .then(() => {
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
    await client.writeFile('/server/path/test.txt', 'some data', { /* WriteFileOptions */ })
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Sets the access time and modified time for `path`
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
  client.utimes('/server/path/test.txt', 1663641640819, 1663641640819)
        .then(() => {
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
    await client.utimes('/server/path/test.txt', 1663641640819, 1663641640819)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Creates a symlink at `linkPath` to `targetPath`
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
  client.symlink('/server/path1/test.txt', '/server/path2/test.txt')
        .then(() => {
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
    await client.symlink('/server/path1/test.txt', '/server/path2/test.txt')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Renames/moves `srcPath` to `destPath`
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
  client.rename('/server/path1/test.txt', '/server/path2/test.txt')
        .then(() => {
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
    await client.rename('/server/path1/test.txt', '/server/path2/test.txt')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Retrieves the target for a symlink at `path`
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
  client.readlink('/server/path1/test.txt')
        .then((result) => {
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
    const result = await client.readlink('/server/path1/test.txt')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Reads a file in memory and returns its contents
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
  client.readFile('/server/path1/test.txt')
        .then((result) => {
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
    const result = await client.readFile('/server/path1/test.txt')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Retrieves attributes for `path`
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
  client.lstat('/server/path1/test.txt')
        .then((result) => {
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
    const result = await client.lstat('/server/path1/test.txt')
    console.log(result)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Appends data to a file
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
  client.appendFile('/server/path1/test.txt', 'some data', {/* WriteFileOptions */})
        .then(() => {
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
    await client.appendFile('/server/path1/test.txt', 'some data', {/* WriteFileOptions */})
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Sets the mode for `path`
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
  client.chmod('/server/path1/test.txt', '+x')
        .then(() => {
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
    await client.chmod('/server/path1/test.txt', '+x')
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Sets the owner for `path`
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
  client.chown('/server/path1/test.txt', 1000, 1000)
        .then(() => {
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
    await client.chown('/server/path1/test.txt', 1000, 1000)
    client.close() // remember to close connection after you finish
  } catch (e) {
    console.log(e)
  }
}

test()
```

## Events
You can listen for any event [provided by SSH2](https://github.com/mscdex/ssh2#client) during an SSH session by passing `events` to `Connection options`

For example:
```ts
try {
  const client = await Client({
    host: "server_ip",
    port: 22,
    username: "username",
    tryKeyboard: true,
    events: {
      "keyboard-interactive": (
        name,
        instructions,
        instructionsLang,
        prompts,
        finish
      ) => {
        finish(['my_password'])
      },
    },
  });

  client.close(); // remember to close connection after you finish
} catch (e) {
  console.log(e);
}
```

## Connection options
Below are available options you can pass when connecting to server:
* **agent** - _string_ - Path to ssh-agent's UNIX socket for ssh-agent-based user authentication. **Windows users: set to 'pageant' for authenticating with Pageant or (actual) path to a cygwin "UNIX socket."** **Default:** (none)

* **agentForward** - _boolean_ - Set to `true` to use OpenSSH agent forwarding (`auth-agent@openssh.com`) for the life of the connection. `agent` must also be set to use this feature. **Default:** `false`

* **algorithms** - _object_ - This option allows you to explicitly override the default transport layer algorithms used for the connection. The value for each category must either be an array of valid algorithm names to set an exact list (with the most preferable first) or an object containing `append`, `prepend`, and/or `remove` properties that each contain an _array_ of algorithm names or RegExps to match to adjust default lists for each category. Valid keys:

    * **cipher** - _mixed_ - Ciphers.
        * Default list (in order from most to least preferable):
          * `chacha20-poly1305@openssh.com` (priority of chacha20-poly1305 may vary depending upon CPU and/or optional binding availability)
          * `aes128-gcm`
          * `aes128-gcm@openssh.com`
          * `aes256-gcm`
          * `aes256-gcm@openssh.com`
          * `aes128-ctr`
          * `aes192-ctr`
          * `aes256-ctr`
        * Other supported names:
          * `3des-cbc`
          * `aes256-cbc`
          * `aes192-cbc`
          * `aes128-cbc`
          * `arcfour256`
          * `arcfour128`
          * `arcfour`
          * `blowfish-cbc`
          * `cast128-cbc`

    * **compress** - _mixed_ - Compression algorithms.
        * Default list (in order from most to least preferable):
          * `none`
          * `zlib@openssh.com`
          * `zlib`
        * Other supported names:

    * **hmac** - _mixed_ - (H)MAC algorithms.
        * Default list (in order from most to least preferable):
          * `hmac-sha2-256-etm@openssh.com`
          * `hmac-sha2-512-etm@openssh.com`
          * `hmac-sha1-etm@openssh.com`
          * `hmac-sha2-256`
          * `hmac-sha2-512`
          * `hmac-sha1`
        * Other supported names:
          * `hmac-md5`
          * `hmac-sha2-256-96`
          * `hmac-sha2-512-96`
          * `hmac-ripemd160`
          * `hmac-sha1-96`
          * `hmac-md5-96`

    * **kex** - _mixed_ - Key exchange algorithms.
        * Default list (in order from most to least preferable):
          * `curve25519-sha256` (node v14.0.0+)
          * `curve25519-sha256@libssh.org` (node v14.0.0+)
          * `ecdh-sha2-nistp256`
          * `ecdh-sha2-nistp384`
          * `ecdh-sha2-nistp521`
          * `diffie-hellman-group-exchange-sha256`
          * `diffie-hellman-group14-sha256`
          * `diffie-hellman-group15-sha512`
          * `diffie-hellman-group16-sha512`
          * `diffie-hellman-group17-sha512`
          * `diffie-hellman-group18-sha512`
        * Other supported names:
          * `diffie-hellman-group-exchange-sha1`
          * `diffie-hellman-group14-sha1`
          * `diffie-hellman-group1-sha1`

    * **serverHostKey** - _mixed_ - Server host key formats.
        * Default list (in order from most to least preferable):
          * `ssh-ed25519` (node v12.0.0+)
          * `ecdsa-sha2-nistp256`
          * `ecdsa-sha2-nistp384`
          * `ecdsa-sha2-nistp521`
          * `rsa-sha2-512`
          * `rsa-sha2-256`
          * `ssh-rsa`
        * Other supported names:
          * `ssh-dss`

* **authHandler** - _mixed_ - Either an array of objects as described below or a function with parameters `(methodsLeft, partialSuccess, callback)` where `methodsLeft` and `partialSuccess` are `null` on the first authentication attempt, otherwise are an array and boolean respectively. Return or call `callback()` with either the name of the authentication method or an object containing the method name along with method-specific details to try next (return/pass `false` to signal no more methods to try). Valid method names are: `'none', 'password', 'publickey', 'agent', 'keyboard-interactive', 'hostbased'`. **Default:** function that follows a set method order: None -> Password -> Private Key -> Agent (-> keyboard-interactive if `tryKeyboard` is `true`) -> Hostbased

    * When returning or calling `callback()` with an object, it can take one of the following forms:

        ```js
        {
          type: 'none',
          username: 'foo',
        }
        ```

        ```js
        {
          type: 'password'
          username: 'foo',
          password: 'bar',
        }
        ```

        ```js
        {
          type: 'publickey'
          username: 'foo',
          // Can be a string, Buffer, or parsed key containing a private key
          key: ...,
          // `passphrase` only required for encrypted keys
          passphrase: ...,
        }
        ```

        ```js
        {
          type: 'hostbased'
          username: 'foo',
          localHostname: 'baz',
          localUsername: 'quux',
          // Can be a string, Buffer, or parsed key containing a private key
          key: ...,
          // `passphrase` only required for encrypted keys
          passphrase: ...,
        }
        ```

        ```js
        {
          type: 'agent'
          username: 'foo',
          // Can be a string that is interpreted exactly like the `agent`
          // connection config option or can be a custom agent
          // object/instance that extends and implements `BaseAgent`
          agent: ...,
        }
        ```

        ```js
        {
          type: 'keyboard-interactive'
          username: 'foo',
          // This works exactly the same way as a 'keyboard-interactive'
          // Client event handler
          prompt: (name, instructions, instructionsLang, prompts, finish) => {
            // ...
          },
        }
        ```

* **debug** - _function_ - Set this to a function that receives a single string argument to get detailed (local) debug information. **Default:** (none)

* **forceIPv4** - _boolean_ - Only connect via resolved IPv4 address for `host`. **Default:** `false`

* **forceIPv6** - _boolean_ - Only connect via resolved IPv6 address for `host`. **Default:** `false`

* **host** - _string_ - Hostname or IP address of the server. **Default:** `'localhost'`

* **hostHash** - _string_ - Any valid hash algorithm supported by node. The host's key is hashed using this algorithm and passed to the **hostVerifier** function as a hex string. **Default:** (none)

* **hostVerifier** - _function_ - Function with parameters `(hashedKey[, callback])` where `hashedKey` is a string hex hash of the host's key for verification purposes. Return `true` to continue with the handshake or `false` to reject and disconnect, or call `callback()` with `true` or `false` if you need to perform asynchronous verification. **Default:** (auto-accept if `hostVerifier` is not set)

* **keepaliveCountMax** - _integer_ - How many consecutive, unanswered SSH-level keepalive packets that can be sent to the server before disconnection (similar to OpenSSH's ServerAliveCountMax config option). **Default:** `3`

* **keepaliveInterval** - _integer_ - How often (in milliseconds) to send SSH-level keepalive packets to the server (in a similar way as OpenSSH's ServerAliveInterval config option). Set to 0 to disable. **Default:** `0`

* **localAddress** - _string_ - IP address of the network interface to use to connect to the server. **Default:** (none -- determined by OS)

* **localHostname** - _string_ - Along with **localUsername** and **privateKey**, set this to a non-empty string for hostbased user authentication. **Default:** (none)

* **localPort** - _string_ - The local port number to connect from. **Default:** (none -- determined by OS)

* **localUsername** - _string_ - Along with **localHostname** and **privateKey**, set this to a non-empty string for hostbased user authentication. **Default:** (none)

* **passphrase** - _string_ - For an encrypted `privateKey`, this is the passphrase used to decrypt it. **Default:** (none)

* **password** - _string_ - Password for password-based user authentication. **Default:** (none)

* **port** - _integer_ - Port number of the server. **Default:** `22`

* **privateKey** - _mixed_ - _Buffer_ or _string_ that contains a private key for either key-based or hostbased user authentication (OpenSSH format). **Default:** (none)

* **readyTimeout** - _integer_ - How long (in milliseconds) to wait for the SSH handshake to complete. **Default:** `20000`

* **sock** - _ReadableStream_ - A _ReadableStream_ to use for communicating with the server instead of creating and using a new TCP connection (useful for connection hopping).

* **strictVendor** - _boolean_ - Performs a strict server vendor check before sending vendor-specific requests, etc. (e.g. check for OpenSSH server when using `openssh_noMoreSessions()`) **Default:** `true`

* **tryKeyboard** - _boolean_ - Try keyboard-interactive user authentication if primary user authentication method fails. If you set this to `true`, you need to handle the `keyboard-interactive` event. **Default:** `false`

* **username** - _string_ - Username for authentication. **Default:** (none)

* **events** - Object - List of events to listen to. **Default:** (none)
# Support
If you like this project, give me 1 ⭐️