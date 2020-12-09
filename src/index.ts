import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { Client as SSHClient, SFTPWrapper } from 'ssh2'
import { Stats } from 'ssh2-streams'

export interface IScpOptions {
  host?: string
  port?: number
  username?: string
  password?: string
  privateKey?: Buffer | string
  passphrase? : string
  forceIPv4?: boolean
  forceIPv6?: boolean
  readyTimeout?: number
  keepaliveInterval?: number
  keepaliveCountMax?: number
}

export class ScpClient extends EventEmitter {
  private sftpWrapper: SFTPWrapper | null = null
  private sshClient: SSHClient | null = null

  constructor(options: IScpOptions) {
    super()

    const ssh = new SSHClient()
    ssh.on('connect', () => {
      this.emit('connect')
    })
    ssh.on('ready', () => {
      ssh.sftp((err, sftp) => {
        if (err) { throw err }
        // save for reuse
        this.sftpWrapper = sftp
        this.emit('ready')
      })
    })
    ssh.on('error', (err) => {
      this.emit('error', err)
    })
    ssh.on('end', () => {
      this.emit('end')
    })
    ssh.on('close', () => {
      this.emit('close')
    })
    ssh.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      this.emit('keyboard-interactive', name, instructions, instructionsLang, prompts, finish)
    })
    ssh.on('change password', (message, language, done) => {
      this.emit('change password', message, language, done)
    })
    ssh.on('tcp connection', (details, accept, reject) => {
      this.emit('tcp connection', details, accept, reject)
    })

    ssh.connect(options)
    this.sshClient = ssh
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.fastPut(localPath, remotePath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  public async downloadFile(remotePath: string, localPath: string) {
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.fastGet(remotePath, localPath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  public async uploadDir(src: string, dest: string): Promise<void> {
    try {
      const isExist = await this.exists(dest)

      if (!isExist) {
        await this.mkdir(dest)
      }

      const dirEntries = fs.readdirSync(src, {
        encoding: 'utf8',
        withFileTypes: true,
      })

      for (const e of dirEntries) {
        if (e.isDirectory()) {
          const newSrc = path.join(src, e.name)
          const newDst = path.join(dest, e.name)
          await this.uploadDir(newSrc, newDst)
        } else if (e.isFile()) {
          const newSrc = path.join(src, e.name)
          const newDst = path.join(dest, e.name)
          await this.uploadFile(newSrc, newDst)

          // this.client.emit('upload', {source: src, destination: dst})
        }
      }
    } catch (error) {
      throw error
    }
  }

  public async stat(remotePath: string): Promise<Stats> {
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err)
        } else {
          resolve(stats)
        }
      })
    })
  }

  public async mkdir(remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.mkdir(remotePath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  public async exists(remotePath: string): Promise<string | boolean> {
    try {
      const stats = await this.stat(remotePath)

      if (stats.isDirectory()) {
        return 'd'
      }
      if (stats.isSymbolicLink()) {
        return 'l'
      }
      if (stats.isFile()) {
        return '-'
      }
      return false
    } catch (error) {
      return false
    }
  }

  public close() {
    if (this.sftpWrapper) {
      this.sftpWrapper.end()
      this.sftpWrapper = null
    }
    if (this.sshClient) {
      this.sshClient.end()
      this.sshClient = null
    }
  }
}

export async function Client(options: IScpOptions): Promise<ScpClient> {
  const client = new ScpClient(options)

  return new Promise((resolve, reject) => {
    client.on('ready', () => {
      resolve(client)
    })

    client.on('error', (err) => {
      reject(err)
    })
  })
}

module.exports = Client
