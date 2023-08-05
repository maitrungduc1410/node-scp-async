export enum errorCode {
  generic = "ERR_GENERIC_CLIENT",
  connect = "ERR_NOT_CONNECTED",
  badPath = "ERR_BAD_PATH",
  permission = "EACCES",
  notexist = "ENOENT",
  notdir = "ENOTDIR",
}

export enum targetType {
  writeFile = 1,
  readFile = 2,
  writeDir = 3,
  readDir = 4,
  readObj = 5,
  writeObj = 6,
}

export const CLIENT_EVENTS = new Set([
  "banner",
  "ready",
  "tcp connection",
  "x11",
  "keyboard-interactive",
  "change password",
  "error",
  "end",
  "close",
  "timeout",
  "connect",
  "greeting",
  "handshake",
  "hostkeys",
  "unix connection",
]);
