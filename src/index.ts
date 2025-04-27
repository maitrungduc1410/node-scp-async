import { EventEmitter } from "events";
import { mkdirSync, readdirSync, existsSync } from "fs";
import { join, win32, posix } from "path";
import {
  Client as SSHClient,
  ConnectConfig,
  InputAttributes,
  SFTPWrapper,
  Stats,
  TransferOptions,
  WriteFileOptions,
  ParsedKey,
  UNIXConnectionDetails,
  AcceptConnection,
  RejectConnection,
} from "ssh2";
import { targetType } from "./constant";
import * as utils from "./utils";
import { ClientEvents } from "./types";

export type TScpOptions = ConnectConfig & {
  remoteOsType?: "posix" | "win32";
  events?: ClientEvents;
};

export class ScpClient extends EventEmitter {
  sftpWrapper: SFTPWrapper | null = null;
  sshClient: SSHClient | null = null;
  remotePathSep = posix.sep;
  endCalled = false;
  errorHandled = false;

  constructor(options: TScpOptions) {
    super();

    const ssh = new SSHClient();
    ssh
      .on("connect", () => this.emit("connect"))
      .on("ready", () => {
        ssh.sftp((err, sftp) => {
          if (err) {
            throw err;
          }
          // save for reuse
          this.sftpWrapper = sftp;
          this.emit("ready");
        });
      })
      .on("error", (err) => this.emit("error", err))
      .on("end", () => this.emit("end"))
      .on("close", () => {
        if (!this.endCalled) {
          this.sftpWrapper = null;
        }
        this.emit("close");
      })
      .on(
        "keyboard-interactive",
        (name, instructions, instructionsLang, prompts, finish) =>
          this.emit(
            "keyboard-interactive",
            name,
            instructions,
            instructionsLang,
            prompts,
            finish
          )
      )
      .on("change password", (message, done) =>
        this.emit("change password", message, done)
      )
      .on("tcp connection", (details, accept, reject) =>
        this.emit("tcp connection", details, accept, reject)
      )
      .on("banner", (message) => this.emit("banner", message))
      .on("greeting", (greeting) => this.emit("banner", greeting))
      .on("handshake", (negotiated) => this.emit("handshake", negotiated))
      .on("hostkeys", (keys: ParsedKey[]) => this.emit("hostkeys", keys))
      .on("timeout", () => this.emit("timeout"))
      .on(
        "unix connection",
        (
          info: UNIXConnectionDetails,
          accept: AcceptConnection,
          reject: RejectConnection
        ) => this.emit("unix connection", info, accept, reject)
      )
      .on("x11", (message) => this.emit("x11", message));
    ssh.connect(options);
    this.sshClient = ssh;

    if (options.remoteOsType === "win32") {
      this.remotePathSep = win32.sep;
    }
  }

  /**
   * Uploads a file from `localPath` to `remotePath` using parallel reads for faster throughput.
   */
  public async uploadFile(
    localPath: string,
    remotePath: string,
    options: TransferOptions = {}
  ): Promise<void> {
    utils.haveConnection(this, "uploadFile");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.fastPut(localPath, remotePath, options, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Downloads a file at `remotePath` to `localPath` using parallel reads for faster throughput.
   */
  public async downloadFile(
    remotePath: string,
    localPath: string,
    options: TransferOptions = {}
  ): Promise<void> {
    utils.haveConnection(this, "downloadFile");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.fastGet(remotePath, localPath, options, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Clean a directory in remote server
   */
  public async emptyDir(dir: string): Promise<void> {
    utils.haveConnection(this, "uploadDir");
    try {
      const isExist = await this.exists(dir);

      if (!isExist) {
        await this.mkdir(dir);
      } else if (isExist === "d") {
        await this.rmdir(dir);
        await this.mkdir(dir);
      }
    } catch (error) {
      throw error;
    }
  }

  public async uploadDir(src: string, dest: string): Promise<void> {
    utils.haveConnection(this, "uploadDir");
    try {
      const isExist = await this.exists(dest);

      if (!isExist) {
        await this.mkdir(dest);
      }

      const dirEntries = readdirSync(src, {
        encoding: "utf8",
        withFileTypes: true,
      });

      for (const e of dirEntries) {
        if (e.isDirectory()) {
          const newSrc = join(src, e.name);
          const newDst = utils.joinRemote(this, dest, e.name);
          await this.uploadDir(newSrc, newDst);
        } else if (e.isFile()) {
          const newSrc = join(src, e.name);
          const newDst = utils.joinRemote(this, dest, e.name);
          await this.uploadFile(newSrc, newDst);

          // this.client.emit('upload', {source: src, destination: dst})
        }
      }
    } catch (error) {
      throw error;
    }
  }

  public async downloadDir(remotePath: string, localPath: string) {
    utils.haveConnection(this, "downloadDir");
    const remoteInfo: any = await utils.checkRemotePath(
      this,
      remotePath,
      targetType.readDir
    );
    if (!remoteInfo.valid) {
      throw new Error(remoteInfo.msg);
    }

    if (!existsSync(localPath)) {
      mkdirSync(localPath);
    }

    const localInfo = await utils.checkLocalPath(
      localPath,
      targetType.writeDir
    );

    if (localInfo.valid && !localInfo.type) {
      mkdirSync(localInfo.path, { recursive: true });
    }

    if (!localInfo.valid) {
      throw new Error(localInfo.msg);
    }
    const fileList = await this.list(remoteInfo.path);
    for (const f of fileList) {
      if (f.type === "d") {
        const newSrc = remoteInfo.path + this.remotePathSep + f.name;
        const newDst = join(localInfo.path, f.name);
        await this.downloadDir(newSrc, newDst);
      } else if (f.type === "-") {
        const src = remoteInfo.path + this.remotePathSep + f.name;
        const dst = join(localInfo.path, f.name);
        await this.downloadFile(src, dst);
        this.sshClient!.emit("download", { source: src, destination: dst });
      } else {
        console.log(`downloadDir: File ignored: ${f.name} not regular file`);
      }
    }
    return `${remoteInfo.path} downloaded to ${localInfo.path}`;
  }

  /**
   * Retrieves attributes for `path`.
   */
  public async stat(remotePath: string): Promise<Stats> {
    utils.haveConnection(this, "stat");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err);
        } else {
          resolve(stats);
        }
      });
    });
  }

  /**
   * Sets the attributes defined in `attributes` for `path`.
   */
  public async setstat(
    path: string,
    attributes: InputAttributes = {}
  ): Promise<void> {
    utils.haveConnection(this, "setstat");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.setstat(path, attributes, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Removes the file/symlink at `path`.
   */
  public async unlink(remotePath: string): Promise<void> {
    utils.haveConnection(this, "unlink");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.unlink(remotePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // _rmdir - only works with an empty directory
  async _rmdir(remotePath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      this.sftpWrapper!.rmdir(remotePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async rmdir(remotePath: string): Promise<void> {
    const files = await this.list(remotePath);
    for (const file of files) {
      const fullFilename = utils.joinRemote(this, remotePath, file.name);
      if (file.type === "d") {
        await this.rmdir(fullFilename);
      } else {
        await this.unlink(fullFilename);
      }
    }
    await this._rmdir(remotePath);
  }

  /**
   * Creates a new directory `path`.
   */
  public async mkdir(
    remotePath: string,
    attributes: InputAttributes = {},
    options: { recursive?: boolean} = {}
  ): Promise<void> {
    utils.haveConnection(this, "mkdir");
    
    if (!options.recursive) {
      // Simple case: create a single directory
      return new Promise((resolve, reject) => {
        this.sftpWrapper!.mkdir(remotePath, attributes, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    
    // Recursive case: create parent directories if they don't exist
    const parts = remotePath.split(this.remotePathSep).filter(p => p);
    let currentPath = remotePath.startsWith(this.remotePathSep) ? this.remotePathSep : '';
    
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? utils.joinRemote(this, currentPath, parts[i]) : parts[i];
      
      try {
        const exists = await this.exists(currentPath);
        if (!exists) {
          await new Promise<void>((resolve, reject) => {
            this.sftpWrapper!.mkdir(currentPath, attributes, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } else if (exists !== 'd') {
          throw new Error(`Cannot create directory '${remotePath}': Path exists and is not a directory`);
        }
      } catch (err: any) {
        // Ignore error if directory already exists
        if (err.code !== 'EEXIST') {
          throw err;
        }
      }
    }
  }

  public async exists(remotePath: string): Promise<string | boolean> {
    utils.haveConnection(this, "exists");
    try {
      const stats = await this.stat(remotePath);

      if (stats.isDirectory()) {
        return "d";
      }
      if (stats.isSymbolicLink()) {
        return "l";
      }
      if (stats.isFile()) {
        return "-";
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Writes data to a file
   */
  public async writeFile(
    remotePath: string,
    data: string | Buffer,
    options: WriteFileOptions = {}
  ): Promise<void> {
    utils.haveConnection(this, "writeFile");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.writeFile(remotePath, data, options, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Sets the access time and modified time for `path`.
   */
  public async utimes(
    path: string,
    atime: number | Date,
    mtime: number | Date
  ): Promise<void> {
    utils.haveConnection(this, "utimes");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.utimes(path, atime, mtime, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Creates a symlink at `linkPath` to `targetPath`.
   */
  public async symlink(targetPath: string, linkPath: string): Promise<void> {
    utils.haveConnection(this, "symlink");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.symlink(targetPath, linkPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Renames/moves `srcPath` to `destPath`.
   */
  public async rename(srcPath: string, destPath: string): Promise<void> {
    utils.haveConnection(this, "rename");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.rename(srcPath, destPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Retrieves the target for a symlink at `path`.
   */
  public async readlink(path: string): Promise<string> {
    utils.haveConnection(this, "readlink");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.readlink(path, (err, target) => {
        if (err) {
          reject(err);
        } else {
          resolve(target);
        }
      });
    });
  }

  /**
   * Reads a file in memory and returns its contents
   */
  public async readFile(remotePath: string): Promise<Buffer> {
    utils.haveConnection(this, "readFile");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.readFile(remotePath, (err, handle) => {
        if (err) {
          reject(err);
        } else {
          resolve(handle);
        }
      });
    });
  }

  /**
   * Retrieves attributes for `path`. If `path` is a symlink, the link itself is stat'ed
   * instead of the resource it refers to.
   */
  public async lstat(path: string): Promise<Stats> {
    utils.haveConnection(this, "lstat");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.lstat(path, (err, stats) => {
        if (err) {
          reject(err);
        } else {
          resolve(stats);
        }
      });
    });
  }

  /**
   * Appends data to a file
   */
  public async appendFile(
    remotePath: string,
    data: string | Buffer,
    options: WriteFileOptions
  ): Promise<void> {
    utils.haveConnection(this, "appendFile");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.appendFile(remotePath, data, options, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Sets the mode for `path`.
   */
  public async chmod(path: string, mode: number | string): Promise<void> {
    utils.haveConnection(this, "chmod");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.chmod(path, mode, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Sets the owner for `path`.
   */
  public async chown(path: string, uid: number, gid: number): Promise<void> {
    utils.haveConnection(this, "chown");
    return new Promise((resolve, reject) => {
      this.sftpWrapper!.chown(path, uid, gid, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close SSH connection
   */
  public close() {
    if (this.sshClient && this.sftpWrapper) {
      this.sshClient.end();
      this.sshClient = null;
      this.sftpWrapper = null;
    }

    this.endCalled = true;
  }

  /**
   * List all files and directories at remotePath
   */
  public async list(remotePath: string, pattern = /.*/): Promise<any> {
    const _list = (aPath: string, filter: RegExp | string) => {
      return new Promise((resolve, reject) => {
        const reg = /-/gi;
        this.sftpWrapper!.readdir(aPath, (err, fileList) => {
          if (err) {
            reject(err);
          } else {
            let newList: any = [];
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
                    user: item.longname.substr(1, 3).replace(reg, ""),
                    group: item.longname.substr(4, 3).replace(reg, ""),
                    other: item.longname.substr(7, 3).replace(reg, ""),
                  },
                  owner: item.attrs.uid,
                  group: item.attrs.gid,
                };
              });
            }
            // provide some compatibility for auxList
            let regex: RegExp;
            if (filter instanceof RegExp) {
              regex = filter;
            } else {
              const newPattern = filter.replace(/\*([^*])*?/gi, ".*");
              regex = new RegExp(newPattern);
            }
            resolve(newList.filter((item: any) => regex.test(item.name)));
          }
        });
      });
    };

    utils.haveConnection(this, "list");
    const pathInfo = await utils.checkRemotePath(
      this,
      remotePath,
      targetType.readDir
    );
    if (!pathInfo.valid) {
      throw new Error("Remote path is invalid");
    }
    return _list(pathInfo.path, pattern);
  }

  /**
   * Resolves `path` to an absolute path.
   */
  public realPath(remotePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const closeListener = utils.makeCloseListener(this, reject, "realPath");
      this.sshClient!.prependListener("close", closeListener);
      const errorListener = utils.makeErrorListener(reject, this, "realPath");
      this.sshClient!.prependListener("error", errorListener);
      if (utils.haveConnection(this, "realPath", reject)) {
        this.sftpWrapper!.realpath(remotePath, (err, absPath) => {
          if (err) {
            reject(
              utils.formatError(`${err.message} ${remotePath}`, "realPath")
            );
          }
          resolve(absPath);
          this.removeListener("error", errorListener);
          this.removeListener("close", closeListener);
        });
      }
    });
  }
}

export async function Client(options: TScpOptions): Promise<ScpClient> {
  const client = new ScpClient(options);

  return new Promise((resolve, reject) => {
    client.on("ready", () => {
      resolve(client);
    });

    client.on("error", (err) => {
      reject(err);
    });

    client.on("close", () => {
      client.removeAllListeners();
    });

    for (const event in options.events) {
      client.on(event, (...args) => {
        (options.events![event as keyof ClientEvents] as (...args: any[]) => void)(...args);
      });
    }
  });
}

export default Client;
