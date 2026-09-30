import type { Stats } from 'node:fs';
import { chmod, mkdir, readdir, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { ErrorCode, fromLocalError, ScpError, throwIfAborted } from '../errors';
import type { EntryInfo, EntryType } from '../types';

export interface LocalFileNode {
  kind: 'file';
  /** Relative path from the transfer root using `/`. Empty for the root itself. */
  rel: string;
  name: string;
  abs: string;
  size: number;
  mode: number;
  atime: number;
  mtime: number;
}

export interface LocalDirNode {
  kind: 'dir';
  rel: string;
  name: string;
  abs: string;
  mode: number;
  atime: number;
  mtime: number;
  children: LocalNode[];
}

export type LocalNode = LocalFileNode | LocalDirNode;

export type Filter = ((path: string, entry: EntryInfo) => boolean) | undefined;

function seconds(ms: number): number {
  return Math.floor(ms / 1000);
}

function entryType(st: Stats): EntryType {
  if (st.isFile()) return 'file';
  if (st.isDirectory()) return 'directory';
  if (st.isSymbolicLink()) return 'symlink';
  return 'other';
}

export async function statLocal(path: string): Promise<Stats> {
  try {
    return await stat(path);
  } catch (err) {
    throw fromLocalError(err, 'stat', path);
  }
}

export function fileNode(abs: string, rel: string, name: string, st: Stats): LocalFileNode {
  return {
    kind: 'file',
    rel,
    name,
    abs,
    size: st.size,
    mode: st.mode & 0o7777,
    atime: seconds(st.atimeMs),
    mtime: seconds(st.mtimeMs),
  };
}

/**
 * Walks a local directory following symlinks, with loop protection based on device and inode.
 * Entries that are neither files nor directories (sockets, devices) are skipped.
 */
export async function walkLocal(
  root: string,
  filter: Filter,
  signal: AbortSignal | undefined,
): Promise<LocalDirNode> {
  const rootStat = await statLocal(root);
  const seen = new Set<string>();

  async function visit(abs: string, rel: string, name: string, st: Stats): Promise<LocalDirNode> {
    throwIfAborted(signal);
    const key = `${st.dev}:${st.ino}`;
    if (seen.has(key)) {
      throw new ScpError(ErrorCode.Local, `Symlink loop detected at '${abs}'`, { path: abs });
    }
    seen.add(key);
    const node: LocalDirNode = {
      kind: 'dir',
      rel,
      name,
      abs,
      mode: st.mode & 0o7777,
      atime: seconds(st.atimeMs),
      mtime: seconds(st.mtimeMs),
      children: [],
    };
    let names: string[];
    try {
      names = (await readdir(abs)).sort();
    } catch (err) {
      throw fromLocalError(err, 'readdir', abs);
    }
    for (const child of names) {
      const childAbs = join(abs, child);
      const childRel = rel === '' ? child : `${rel}/${child}`;
      const childStat = await statLocal(childAbs);
      const info: EntryInfo = {
        type: entryType(childStat),
        size: childStat.size,
        mode: childStat.mode & 0o7777,
      };
      if (info.type !== 'file' && info.type !== 'directory') continue;
      if (filter && !filter(childRel, info)) continue;
      if (childStat.isDirectory()) {
        node.children.push(await visit(childAbs, childRel, child, childStat));
      } else {
        node.children.push(fileNode(childAbs, childRel, child, childStat));
      }
    }
    seen.delete(key);
    return node;
  }

  return visit(root, '', '', rootStat);
}

export interface TreeTotals {
  files: number;
  directories: number;
  bytes: number;
}

export function totals(node: LocalNode): TreeTotals {
  if (node.kind === 'file') return { files: 1, directories: 0, bytes: node.size };
  const sum: TreeTotals = { files: 0, directories: 1, bytes: 0 };
  for (const child of node.children) {
    const t = totals(child);
    sum.files += t.files;
    sum.directories += t.directories;
    sum.bytes += t.bytes;
  }
  return sum;
}

export function flatten(root: LocalDirNode): { dirs: LocalDirNode[]; files: LocalFileNode[] } {
  const dirs: LocalDirNode[] = [];
  const files: LocalFileNode[] = [];
  dirs.push(root);
  for (let i = 0; i < dirs.length; i++) {
    for (const child of dirs[i]!.children) {
      if (child.kind === 'dir') dirs.push(child);
      else files.push(child);
    }
  }
  return { dirs, files };
}

export async function ensureLocalDir(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    throw fromLocalError(err, 'mkdir', path);
  }
  const st = await statLocal(path);
  if (!st.isDirectory()) {
    throw new ScpError(ErrorCode.NotADirectory, `'${path}' exists and is not a directory`, {
      path,
    });
  }
}

export async function applyLocalAttributes(
  path: string,
  attrs: { mode?: number | undefined; atime?: number | undefined; mtime?: number | undefined },
): Promise<void> {
  try {
    if (attrs.mode !== undefined) await chmod(path, attrs.mode & 0o7777);
    if (attrs.mtime !== undefined) await utimes(path, attrs.atime ?? attrs.mtime, attrs.mtime);
  } catch (err) {
    throw fromLocalError(err, 'set attributes on', path);
  }
}
