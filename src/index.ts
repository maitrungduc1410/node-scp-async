import { EventEmitter } from 'events'
import { mkdirSync, readdirSync, existsSync } from 'fs'
import { join, win32, posix } from 'path'
import { Client as SSHClient, SFTPWrapper } from 'ssh2'
import { Stats } from 'ssh2-streams'
import { targetType } from './constant'
import * as utils from './utils'

export interface IScpOptions {
  host?: string
  port?: number
  username?: string
  password?: string
  privateKey?: Buffer | string
  passphrase?: string
  forceIPv4?: boolean
  forceIPv6?: boolean
  readyTimeout?: number
  keepaliveInterval?: number
  keepaliveCountMax?: number
  remoteOsType?: 'posix' | 'win32',
  sock?: NodeJS.ReadableStream | undefined;
}

export class ScpClient extends EventEmitter {
  sftpWrapper: SFTPWrapper | null = null
  sshClient: SSHClient | null = null
  remotePathSep = posix.sep
  endCalled = false
  errorHandled = false

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
      if (!this.endCalled) {
        this.sftpWrapper = null
      }
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

    if (options.remoteOsType === 'win32') {
      this.remotePathSep = win32.sep
    }
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<void> {
    utils.haveConnection(this, 'uploadFile')
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

  public async downloadFile(remotePath: string, localPath: string): Promise<void> {
    utils.haveConnection(this, 'downloadFile')
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

  public async emptyDir(dir: string): Promise<void> {
    utils.haveConnection(this, 'uploadDir')
    try {
      const isExist = await this.exists(dir)

      if (!isExist) {
        await this.mkdir(dir)
      } else if (isExist === 'd') {
        await this.rmdir(dir)
        await this.mkdir(dir)
      }
    }
    catch (error) {
      throw error
    }
  }

  public async uploadDir(src: string, dest: string): Promise<void> {
    utils.haveConnection(this, 'uploadDir')
    try {
      const isExist = await this.exists(dest)

      if (!isExist) {
        await this.mkdir(dest)
      }

      const dirEntries = readdirSync(src, {
        encoding: 'utf8',
        withFileTypes: true,
      })

      for (const e of dirEntries) {
        if (e.isDirectory()) {
          const newSrc = join(src, e.name)
          const newDst = utils.joinRemote(this, dest, e.name)
          await this.uploadDir(newSrc, newDst)
        } else if (e.isFile()) {
          const newSrc = join(src, e.name)
          const newDst = utils.joinRemote(this, dest, e.name)
          await this.uploadFile(newSrc, newDst)

          // this.client.emit('upload', {source: src, destination: dst})
        }
      }
    } catch (error) {
      throw error
    }
  }

  public async downloadDir(remotePath: string, localPath: string) {
    utils.haveConnection(this, 'downloadDir')
    try {
      const remoteInfo: any = await utils.checkRemotePath(
        this,
        remotePath,
        targetType.readDir
      )
      if (!remoteInfo.valid) {
        throw new Error(remoteInfo.msg)
      }

      if (!existsSync(localPath)) {
        mkdirSync(localPath)
      }

      const localInfo = await utils.checkLocalPath(localPath, targetType.writeDir)

      if (localInfo.valid && !localInfo.type) {
        mkdirSync(localInfo.path, { recursive: true })
      }

      if (!localInfo.valid) {
        throw new Error(localInfo.msg)
      }
      const fileList = await this.list(remoteInfo.path)
      for (const f of fileList) {
        if (f.type === 'd') {
          const newSrc = remoteInfo.path + this.remotePathSep + f.name
          const newDst = join(localInfo.path, f.name)
          await this.downloadDir(newSrc, newDst)
        } else if (f.type === '-') {
          const src = remoteInfo.path + this.remotePathSep + f.name
          const dst = join(localInfo.path, f.name)
          await this.downloadFile(src, dst)
          this.sshClient!.emit('download', { source: src, destination: dst })
        } else {
          console.log(`downloadDir: File ignored: ${f.name} not regular file`)
        }
      }
      return `${remoteInfo.path} downloaded to ${localInfo.path}`
    } catch (err) {
      throw new Error(err)
    }
  }

  public async stat(remotePath: string): Promise<Stats> {
    utils.haveConnection(this, 'stat')
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

  public async unlink(remotePath: string): Promise<void> {
    utils.haveConnection(this, 'unlink')
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.unlink(remotePath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  // _rmdir - only works with an empty directory
  async _rmdir(remotePath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.sftpWrapper!.rmdir(remotePath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  public async rmdir(remotePath: string): Promise<void> {
    const files = await this.list(remotePath)
    for (const file of files) {
      const fullFilename = utils.joinRemote(this, remotePath, file.name)
      if (file.type === 'd') {
        await this.rmdir(fullFilename)
      } else {
        await this.unlink(fullFilename)
      }
    }
    await this._rmdir(remotePath)
  }

  public async mkdir(remotePath: string): Promise<void> {
    utils.haveConnection(this, 'mkdir')
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
    utils.haveConnection(this, 'exists')
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

    this.endCalled = true
  }

  public async list(remotePath: string, pattern = /.*/): Promise<any> {
    const _list = (aPath: string, filter: RegExp | string) => {
      return new Promise((resolve, reject) => {
        const reg = /-/gi
        this.sftpWrapper!.readdir(aPath, (err, fileList) => {
          if (err) {
            reject(err)
          } else {
            let newList: any = []
            // reset file info
            if (fileList) {
              newList = fileList.map((item) => {
                return {
                  type: item.longname.substr(0, 1),
                  name: item.filename,
                  size: item.attrs.size,
                  modifyTime: item.attrs.mtime * 1000,
                  accessTime: item.attrs.atime * 1000,
                  rights: {
                    user: item.longname.substr(1, 3).replace(reg, ''),
                    group: item.longname.substr(4, 3).replace(reg, ''),
                    other: item.longname.substr(7, 3).replace(reg, '')
                  },
                  owner: item.attrs.uid,
                  group: item.attrs.gid
                }
              })
            }
            // provide some compatibility for auxList
            let regex: RegExp
            if (filter instanceof RegExp) {
              regex = filter
            } else {
              const newPattern = filter.replace(/\*([^*])*?/gi, '.*')
              regex = new RegExp(newPattern)
            }
            resolve(newList.filter((item: any) => regex.test(item.name)))
          }
        })
      })
    }

    try {
      utils.haveConnection(this, 'list')
      const pathInfo = await utils.checkRemotePath(
        this,
        remotePath,
        targetType.readDir
      )
      if (!pathInfo.valid) {
        throw new Error('Remote path is invalid')
      }
      return _list(pathInfo.path, pattern)
    } catch (err) {
      throw new Error(err)
    }
  }

  public realPath(remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const closeListener = utils.makeCloseListener(this, reject, 'realPath')
      this.sshClient!.prependListener('close', closeListener)
      const errorListener = utils.makeErrorListener(reject, this, 'realPath')
      this.sshClient!.prependListener('error', errorListener)
      if (utils.haveConnection(this, 'realPath', reject)) {
        this.sftpWrapper!.realpath(remotePath, (err, absPath) => {
          if (err) {
            if (err.code === 2) {
              resolve('')
            } else {
              reject(
                utils.formatError(
                  `${err.message} ${remotePath}`,
                  'realPath',
                  err.code
                )
              )
            }
          }
          resolve(absPath)
          this.removeListener('error', errorListener)
          this.removeListener('close', closeListener)
        })
      }
    })
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

export default Client
