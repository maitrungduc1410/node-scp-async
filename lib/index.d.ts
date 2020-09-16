/// <reference types="node" />
import { EventEmitter } from 'events';
import { Stats } from 'ssh2-streams';
export interface IScpOptions {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    paths?: string;
}
export declare class ScpClient extends EventEmitter {
    private sftpWrapper;
    private sshClient;
    constructor(options: IScpOptions);
    uploadFile(localPath: string, remotePath: string): Promise<void>;
    downloadFile(remotePath: string, localPath: string): Promise<unknown>;
    uploadDir(src: string, dest: string): Promise<void>;
    stat(remotePath: string): Promise<Stats>;
    mkdir(remotePath: string): Promise<void>;
    exists(remotePath: string): Promise<string | boolean>;
    close(): void;
}
export declare function Client(options: IScpOptions): Promise<ScpClient>;
