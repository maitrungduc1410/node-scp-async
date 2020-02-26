# New SCP module for NodeJS
A lightweight, fast and secure module to perform Scp command for NodeJS based on SSH2
# What's new
All functionalities are Promise. That means you can use it with `Promise` or `Async/Await` (No more callback hell, Yeah :) )

And other new features:
- Scp a directory from local to remote server and from remote to local
- Perform commands on remote server: `mkdir`, `stat`, check if path exists

# Install
```
npm install --save node-scp
# or
yarn install node-scp
```
# Guide
## Scp file from local to remote server
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.uploadFile('./test.txt', '/workspace/test.txt')
c.close() // remember to close connection after you finish
```

## Scp file from remote server to local
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.downloadFile('/workspace/test.txt', './test.txt')
c.close() // remember to close connection after you finish
```

## Scp a directory from local to remote server
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.uploadDir('./local/dir', '/server/path')
c.close() // remember to close connection after you finish
```

## Create a directory on remote server
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.mkdir('/server/path')
c.close() // remember to close connection after you finish
```


## Check if a path exists on remote server
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.exists('/server/path')
c.close() // remember to close connection after you finish
```

## Get stats of a path on remote server
Using `Promise`
```js
const client = require('node-scp')

client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
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
const client = require('node-scp')

const c = await client({
  host: 'your host',
  port: 22,
  username: 'username',
  password: 'password',
})
await c.stat('/server/path')
c.close() // remember to close connection after you finish
```

# Support
If you like this project, give me 1 👍