// import { SFTPWrapper } from "ssh2";

declare module 'shell-module' {
  interface IScpOptions {
    host?: string
    port?: number
    username?: string
    password?: string
    paths?: string
  }

  export class ScpClient {
    // private sftp: SFTPWrapper
    constructor(options: IScpOptions)
  }
}