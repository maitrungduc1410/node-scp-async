import fs from "fs";
import path from "path";
import { errorCode, targetType } from "./constant";
import { EventEmitter } from "events";
import { ScpClient } from ".";
import { CheckResult, ErrorCustom } from "./types";

/**
 * Generate a new Error object with a reformatted error message which
 * is a little more informative and useful to users.
 *
 * @param {Error|string} err - The Error object the new error will be based on
 * @param {number} retryCount - For those functions which use retry. Number of
 *                              attempts to complete before giving up
 * @returns {Error} New error with custom error message
 */
export function formatError(
  err: ErrorCustom | string,
  name = "sftp",
  eCode = errorCode.generic,
  retryCount?: number
) {
  let msg = "";
  let code = "";
  const retry = retryCount
    ? ` after ${retryCount} ${retryCount > 1 ? "attempts" : "attempt"}`
    : "";

  if (err === undefined) {
    msg = `${name}: Undefined error - probably a bug!`;
    code = errorCode.generic;
  } else if (typeof err === "string") {
    msg = `${name}: ${err}${retry}`;
    code = eCode;
  } else if (err.custom) {
    msg = `${name}->${err.message}${retry}`;
    code = err.code!;
  } else {
    switch (err.code) {
      case "ENOTFOUND":
        msg =
          `${name}: ${err.level} error. ` +
          `Address lookup failed for host ${err.hostname}${retry}`;
        break;
      case "ECONNREFUSED":
        msg =
          `${name}: ${err.level} error. Remote host at ` +
          `${err.address} refused connection${retry}`;
        break;
      case "ECONNRESET":
        msg =
          `${name}: Remote host has reset the connection: ` +
          `${err.message}${retry}`;
        break;
      case "ENOENT":
        msg = `${name}: ${err.message}${retry}`;
        break;
      default:
        msg = `${name}: ${err.message}${retry}`;
    }
    code = err.code ? err.code : eCode;
  }
  const newError = new ErrorCustom(msg);
  newError.code = code;
  newError.custom = true;
  return newError;
}

/**
 * Tests an error to see if it is one which has already been customised
 * by this module or not. If not, applies appropriate customisation.
 *
 * @param {Error} err - an Error object
 * @param {String} name - name to be used in customised error message
 * @param {Function} reject - If defined, call this function instead of
 *                            throwing the error
 * @throws {Error}
 */
export function handleError(
  err: ErrorCustom,
  name: string,
  reject: (e: any) => void
) {
  if (reject) {
    if (err.custom) {
      reject(err);
    } else {
      reject(formatError(err, name, undefined, undefined));
    }
  } else {
    if (err.custom) {
      throw err;
    } else {
      throw formatError(err, name, undefined, undefined);
    }
  }
}

/**
 * Remove all ready, error and end listeners.
 *
 * @param {Emitter} emitter - The emitter object to remove listeners from
 */
// function removeListeners(emitter) {
//   const listeners = emitter.eventNames()
//   listeners.forEach((name) => {
//     emitter.removeAllListeners(name)
//   })
// }

/**
 * Simple default error listener. Will reformat the error message and
 * throw a new error.
 *
 * @param {Error} err - source for defining new error
 * @throws {Error} Throws new error
 */
export function makeErrorListener(
  reject: (e: any) => void,
  client: ScpClient,
  name: string
) {
  return (err: Error) => {
    client.errorHandled = true;
    reject(formatError(err, name));
  };
}

export function makeEndListener(client: ScpClient) {
  return () => {
    if (!client.endCalled) {
      console.error("End Listener: Connection ended unexpectedly");
    }
  };
}

export function makeCloseListener(
  client: ScpClient,
  reject?: (e: any) => void,
  name?: string
) {
  return () => {
    if (!client.endCalled) {
      if (reject) {
        reject(formatError("Connection closed unexpectedly", name));
      } else {
        console.error("Connection closed unexpectedly");
      }
    }
    client.sftpWrapper = null;
  };
}

/**
 * @async
 *
 * Tests to see if a path identifies an existing item. Returns either
 * 'd' = directory, 'l' = sym link or '-' regular file if item exists. Returns
 * false if it does not
 *
 * @param {String} localPath
 * @returns {Boolean | String}
 */
export function localExists(localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.stat(localPath, (err, stats) => {
      if (err) {
        if (err.code === "ENOENT") {
          resolve("ENOENT");
        } else {
          reject(err);
        }
      } else {
        if (stats.isDirectory()) {
          resolve("d");
        } else if (stats.isSymbolicLink()) {
          resolve("l");
        } else if (stats.isFile()) {
          resolve("-");
        } else {
          resolve("");
        }
      }
    });
  });
}

/**
 * Used by checkRemotePath and checkLocalPath to help ensure consistent
 * error messages.
 *
 * @param {Error} err - original error
 * @param {String} testPath - path associated with the error
 * @returns {Object} with properties of 'msg' and 'code'.
 */
export function classifyError(err: ErrorCustom, testPath: string) {
  switch (err.code) {
    case "EACCES":
      return {
        msg: `Permission denied: ${testPath}`,
        code: errorCode.permission,
      };
    case "ENOENT":
      return {
        msg: `No such file: ${testPath}`,
        code: errorCode.notexist,
      };
    case "ENOTDIR":
      return {
        msg: `Not a directory: ${testPath}`,
        code: errorCode.notdir,
      };
    default:
      return {
        msg: err.message,
        code: err.code ? err.code : errorCode.generic,
      };
  }
}

export function localAccess(
  localPath: string,
  mode: number
): Promise<CheckResult> {
  return new Promise((resolve) => {
    fs.access(localPath, mode, (err) => {
      if (err) {
        const { msg, code } = classifyError(err, localPath);
        resolve({
          path: localPath,
          valid: false,
          msg,
          code,
        });
      } else {
        resolve({
          path: localPath,
          valid: true,
        });
      }
    });
  });
}

export async function checkLocalReadFile(localPath: string, localType: string) {
  try {
    const rslt: CheckResult = {
      path: localPath,
      type: localType,
    };
    if (localType === "d") {
      rslt.valid = false;
      rslt.msg = `Bad path: ${localPath} must be a file`;
      rslt.code = errorCode.badPath;
      return rslt;
    } else {
      const access = await localAccess(localPath, fs.constants.R_OK);
      if (access.valid) {
        rslt.valid = true;
        return rslt;
      } else {
        rslt.valid = false;
        rslt.msg = access.msg;
        rslt.code = access.code;
        return rslt;
      }
    }
  } catch (err) {
    throw formatError(err as ErrorCustom, "checkLocalReadFile");
  }
}

export async function checkLocalReadDir(localPath: string, localType: string) {
  try {
    const rslt: CheckResult = {
      path: localPath,
      type: localType,
    };
    if (!localType) {
      rslt.valid = false;
      rslt.msg = `No such directory: ${localPath}`;
      rslt.code = errorCode.notdir;
      return rslt;
    } else if (localType !== "d") {
      rslt.valid = false;
      rslt.msg = `Bad path: ${localPath} must be a directory`;
      rslt.code = errorCode.badPath;
      return rslt;
    } else {
      const access = await localAccess(
        localPath,
        fs.constants.R_OK | fs.constants.X_OK
      );
      if (!access.valid) {
        rslt.valid = false;
        rslt.msg = access.msg;
        rslt.code = access.code;
        return rslt;
      }
      rslt.valid = true;
      return rslt;
    }
  } catch (err) {
    throw formatError(err as ErrorCustom, "checkLocalReadDir");
  }
}

export async function checkLocalWriteFile(
  localPath: string,
  localType: string
) {
  try {
    const rslt: CheckResult = {
      path: localPath,
      type: localType,
    };
    if (localType === "d") {
      rslt.valid = false;
      rslt.msg = `Bad path: ${localPath} must be a file`;
      rslt.code = errorCode.badPath;
      return rslt;
    } else if (!localType) {
      const dir = path.parse(localPath).dir;
      const parent = await localAccess(dir, fs.constants.W_OK);
      if (parent.valid) {
        rslt.valid = true;
        return rslt;
      } else {
        rslt.valid = false;
        rslt.msg = parent.msg;
        rslt.code = parent.code;
        return rslt;
      }
    } else {
      const access = await localAccess(localPath, fs.constants.W_OK);
      if (access.valid) {
        rslt.valid = true;
        return rslt;
      } else {
        rslt.valid = false;
        rslt.msg = access.msg;
        rslt.code = access.code;
        return rslt;
      }
    }
  } catch (err) {
    throw formatError(err as ErrorCustom, "checkLocalWriteFile");
  }
}

export async function checkLocalWriteDir(localPath: string, localType: string) {
  try {
    const rslt: CheckResult = {
      path: localPath,
      type: localType,
    };
    if (!localType) {
      const parent = path.parse(localPath).dir;
      const access = await localAccess(parent, fs.constants.W_OK);
      if (access.valid) {
        rslt.valid = true;
        return rslt;
      } else {
        rslt.valid = false;
        rslt.msg = access.msg;
        rslt.code = access.code;
        return rslt;
      }
    } else if (localType !== "d") {
      rslt.valid = false;
      rslt.msg = `Bad path: ${localPath} must be a directory`;
      rslt.code = errorCode.badPath;
      return rslt;
    } else {
      const access = await localAccess(localPath, fs.constants.W_OK);
      if (access.valid) {
        rslt.valid = true;
        return rslt;
      } else {
        rslt.valid = false;
        rslt.msg = access.msg;
        rslt.code = access.code;
        return rslt;
      }
    }
  } catch (err) {
    throw formatError(err as ErrorCustom, "checkLocalWriteDir");
  }
}

export async function checkLocalPath(
  lPath: string,
  target = targetType.readFile
) {
  const localPath = path.resolve(lPath);
  const type = await localExists(localPath);
  switch (target) {
    case targetType.readFile:
      return checkLocalReadFile(localPath, type);
    case targetType.readDir:
      return checkLocalReadDir(localPath, type);
    case targetType.writeFile:
      return checkLocalWriteFile(localPath, type);
    case targetType.writeDir:
      return checkLocalWriteDir(localPath, type);
    default:
      return {
        path: localPath,
        type,
        valid: true,
      };
  }
}

export async function normalizeRemotePath(client: ScpClient, aPath: string) {
  try {
    if (aPath.startsWith("..")) {
      const root = await client.realPath("..");
      return root + client.remotePathSep + aPath.substring(3);
    } else if (aPath.startsWith(".")) {
      const root = await client.realPath(".");
      return root + client.remotePathSep + aPath.substring(2);
    }
    return aPath;
  } catch (err) {
    throw formatError(err as ErrorCustom, "normalizeRemotePath");
  }
}

export function checkReadObject(aPath: string, type: string) {
  return {
    path: aPath,
    type,
    valid: type ? true : false,
    msg: type ? undefined : `No such file ${aPath}`,
    code: type ? undefined : errorCode.notexist,
  };
}

export function checkReadFile(aPath: string, type: string) {
  if (!type) {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `No such file: ${aPath}`,
      code: errorCode.notexist,
    };
  } else if (type === "d") {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `Bad path: ${aPath} must be a file`,
      code: errorCode.badPath,
    };
  }
  return {
    path: aPath,
    type,
    valid: true,
  };
}

export function checkReadDir(aPath: string, type: string) {
  if (!type) {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `No such directory: ${aPath}`,
      code: errorCode.notdir,
    };
  } else if (type !== "d") {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `Bad path: ${aPath} must be a directory`,
      code: errorCode.badPath,
    };
  }
  return {
    path: aPath,
    type,
    valid: true,
  };
}

export async function checkWriteFile(
  client: ScpClient,
  aPath: string,
  type: string
) {
  if (type && type === "d") {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `Bad path: ${aPath} must be a regular file`,
      code: errorCode.badPath,
    };
  } else if (!type) {
    const { root, dir } = path.parse(aPath);
    // let parentDir = path.parse(aPath).dir;
    if (!dir) {
      return {
        path: aPath,
        type: false,
        valid: false,
        msg: `Bad path: ${aPath} cannot determine parent directory`,
        code: errorCode.badPath,
      };
    }
    if (root === dir) {
      return {
        path: aPath,
        type,
        valid: true,
      };
    }
    const parentType = await client.exists(dir);
    if (!parentType) {
      return {
        path: aPath,
        type,
        valid: false,
        msg: `Bad path: ${dir} parent not exist`,
        code: errorCode.badPath,
      };
    } else if (parentType !== "d") {
      return {
        path: aPath,
        type,
        valid: false,
        msg: `Bad path: ${dir} must be a directory`,
        code: errorCode.badPath,
      };
    }
    return {
      path: aPath,
      type,
      valid: true,
    };
  }
  return {
    path: aPath,
    type,
    valid: true,
  };
}

export async function checkWriteDir(
  client: ScpClient,
  aPath: string,
  type: string
) {
  if (type && type !== "d") {
    return {
      path: aPath,
      type,
      valid: false,
      msg: `Bad path: ${aPath} must be a directory`,
      code: errorCode.badPath,
    };
  } else if (!type) {
    const { root, dir } = path.parse(aPath);
    if (root === dir) {
      return {
        path: aPath,
        type,
        valid: true,
      };
    }
    if (!dir) {
      return {
        path: aPath,
        type: false,
        valid: false,
        msg: `Bad path: ${aPath} cannot determine directory parent`,
        code: errorCode.badPath,
      };
    }
    const parentType = await client.exists(dir);
    if (parentType && parentType !== "d") {
      return {
        path: aPath,
        type,
        valid: false,
        msg: "Bad path: Parent Directory must be a directory",
        code: errorCode.badPath,
      };
    }
  }
  // don't care if parent does not exist as it might be created
  // via recursive call to mkdir.
  return {
    path: aPath,
    type,
    valid: true,
  };
}

export function checkWriteObject(aPath: string, type: string) {
  // for writeObj, not much error checking we can do
  // Just return path, type and valid indicator
  return {
    path: aPath,
    type,
    valid: true,
  };
}

export async function checkRemotePath(
  client: ScpClient,
  rPath: string,
  target = targetType.readFile
) {
  const aPath = await normalizeRemotePath(client, rPath);
  const type = await client.exists(aPath);
  switch (target) {
    case targetType.readObj:
      return checkReadObject(aPath, type as string);
    case targetType.readFile:
      return checkReadFile(aPath, type as string);
    case targetType.readDir:
      return checkReadDir(aPath, type as string);
    case targetType.writeFile:
      return checkWriteFile(client, aPath, type as string);
    case targetType.writeDir:
      return checkWriteDir(client, aPath, type as string);
    case targetType.writeObj:
      return checkWriteObject(aPath, type as string);
    default:
      throw formatError(
        `Unknown target type: ${target}`,
        "checkRemotePath",
        errorCode.generic
      );
  }
}

/**
 * Check to see if there is an active sftp connection
 *
 * @param {Object} client - current sftp object
 * @param {String} name - name given to this connection
 * @param {Function} reject - if defined, call this rather than throw
 *                            an error
 * @returns {Boolean} True if connection OK
 * @throws {Error}
 */
export function haveConnection(
  client: ScpClient,
  name: string,
  reject?: (e: any) => void
) {
  if (!client.sftpWrapper) {
    const newError = formatError(
      "No SFTP connection available",
      name,
      errorCode.connect
    );
    if (reject) {
      reject(newError);
      return false;
    } else {
      throw newError;
    }
  }
  return true;
}

export function dumpListeners(emitter: EventEmitter) {
  const eventNames = emitter.eventNames();
  if (eventNames.length) {
    console.log("Listener Data");
    eventNames.map((n: any) => {
      const listeners = emitter.listeners(n);
      console.log(`${n}: ${emitter.listenerCount(n)}`);
      console.dir(listeners);
      listeners.map((l) => {
        console.log(`listener name = ${l.name}`);
      });
    });
  }
}

export function hasListener(
  emitter: EventEmitter,
  eventName: string,
  listenerName: string
) {
  const listeners = emitter.listeners(eventName);
  const matches = listeners.filter((l) => l.name === listenerName);
  return matches.length === 0 ? false : true;
}

export function joinRemote(client: ScpClient, ...args: string[]) {
  if (client.remotePathSep === path.win32.sep) {
    return path.win32.join(...args);
  }
  return path.posix.join(...args);
}
