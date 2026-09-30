import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * A small glob matcher for `/` separated relative paths. Supports `*`, `?`, `**`, `[abc]`,
 * `[!abc]` and `{a,b}`. With `dot: false` (the default) wildcards do not match names that start
 * with a dot, like shells and most glob libraries.
 */
export interface GlobOptions {
  dot?: boolean;
}

const MAGIC = /[*?[\]{}]/;

export function hasMagic(pattern: string): boolean {
  return MAGIC.test(pattern);
}

function escapeChar(ch: string): string {
  return /[\\^$.*+?()[\]{}|/-]/.test(ch) ? `\\${ch}` : ch;
}

function segmentSource(segment: string): string {
  let out = '';
  let braces = 0;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (ch === '\\' && i + 1 < segment.length) {
      out += escapeChar(segment[++i]!);
    } else if (ch === '*') {
      while (segment[i + 1] === '*') i++;
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end === -1) {
        out += '\\[';
        continue;
      }
      let body = segment.slice(i + 1, end);
      let negate = false;
      if (body.startsWith('!') || body.startsWith('^')) {
        negate = true;
        body = body.slice(1);
      }
      out += `[${negate ? '^' : ''}${body.replace(/[\\\]^]/g, '\\$&')}]`;
      i = end;
    } else if (ch === '{') {
      braces++;
      out += '(?:';
    } else if (ch === '}' && braces > 0) {
      braces--;
      out += ')';
    } else if (ch === ',' && braces > 0) {
      out += '|';
    } else {
      out += escapeChar(ch);
    }
  }
  return out + ')'.repeat(braces);
}

/** Compiles a glob into a predicate over relative `/` separated paths. */
export function globMatcher(pattern: string, options: GlobOptions = {}): (path: string) => boolean {
  const dot = options.dot ?? false;
  const parts = pattern.split('/').filter((p, i) => p !== '' || i === 0);
  const segments = parts.map((p) =>
    p === '**' ? ('**' as const) : new RegExp(`^(?:${segmentSource(p)})$`),
  );
  const literalDot = parts.map((p) => p.startsWith('.'));

  function match(i: number, names: string[], j: number): boolean {
    if (i === segments.length) return j === names.length;
    const seg = segments[i]!;
    if (seg === '**') {
      if (match(i + 1, names, j)) return true;
      if (j < names.length && (dot || !names[j]!.startsWith('.'))) return match(i, names, j + 1);
      return false;
    }
    if (j === names.length) return false;
    const name = names[j]!;
    if (!dot && name.startsWith('.') && !literalDot[i]) return false;
    return seg.test(name) && match(i + 1, names, j + 1);
  }

  return (path) => match(0, path.split('/').filter(Boolean), 0);
}

/**
 * Builds an exclude predicate in the style of `rsync --exclude`: a pattern without `/` matches
 * the entry name at any depth, a pattern with `/` matches the path from the transfer root.
 */
export function excludeMatcher(patterns: readonly string[]): (path: string) => boolean {
  const tests = patterns.map((pattern) => {
    const trimmed = pattern.replace(/\/+$/, '');
    const matcher = globMatcher(trimmed.replace(/^\/+/, ''), { dot: true });
    if (trimmed.includes('/')) return matcher;
    return (path: string) => matcher(path.slice(path.lastIndexOf('/') + 1));
  });
  return (path) => tests.some((test) => test(path));
}

/** Splits a pattern into the directory to walk and the part that needs matching. */
export function globBase(pattern: string): { base: string; rest: string } {
  const parts = pattern.split('/');
  const index = parts.findIndex((p) => hasMagic(p));
  if (index === -1) return { base: pattern, rest: '' };
  const base = parts.slice(0, index).join('/');
  return {
    base: base === '' && pattern.startsWith('/') ? '/' : base || '.',
    rest: parts.slice(index).join('/'),
  };
}

/**
 * Expands a local glob. Returns matching files and directories relative to the glob base,
 * sorted, together with that base.
 */
export async function expandGlob(
  pattern: string,
  options: GlobOptions & { cwd?: string } = {},
): Promise<{ base: string; matches: string[] }> {
  const { base, rest } = globBase(pattern.replace(/\\/g, '/'));
  const root = resolve(options.cwd ?? '.', base);
  if (rest === '') {
    await stat(root);
    return { base, matches: [''] };
  }
  const matcher = globMatcher(rest, options);
  const deep = rest.includes('**');
  const depth = rest.split('/').length;
  const matches: string[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, rel: string, level: number): Promise<void> {
    const st = await stat(dir).catch(() => undefined);
    if (!st) return;
    const key = `${st.dev}:${st.ino}`;
    if (seen.has(key)) return;
    seen.add(key);
    let entries: string[];
    try {
      entries = (await readdir(dir)).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const abs = join(dir, name);
      if (matcher(childRel)) matches.push(childRel);
      if (deep || level + 1 < depth) {
        const child = await stat(abs).catch(() => undefined);
        if (child?.isDirectory()) await walk(abs, childRel, level + 1);
      }
    }
    seen.delete(key);
  }

  await walk(root, '', 0);
  return { base, matches };
}
