import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { excludeMatcher, expandGlob, globBase, globMatcher } from '../../src/glob';

describe('globMatcher', () => {
  it.each([
    ['*.js', 'a.js', true],
    ['*.js', 'dir/a.js', false],
    ['**/*.js', 'a.js', true],
    ['**/*.js', 'x/y/a.js', true],
    ['src/**', 'src/a/b', true],
    ['src/**/test', 'src/test', true],
    ['src/**/test', 'src/a/b/test', true],
    ['?.txt', 'a.txt', true],
    ['?.txt', 'ab.txt', false],
    ['[ab].txt', 'b.txt', true],
    ['[!ab].txt', 'b.txt', false],
    ['*.{js,ts}', 'x.ts', true],
    ['*.{js,ts}', 'x.md', false],
    ['*', '.env', false],
    ['.*', '.env', true],
    ['**/*', 'a/.git/config', false],
    ['a\\*b', 'a*b', true],
    ['a\\*b', 'axb', false],
    ['(x)+.txt', '(x)+.txt', true],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(globMatcher(pattern)(path)).toBe(expected);
  });

  it('matches dot files with dot: true', () => {
    expect(globMatcher('**/*', { dot: true })('a/.git/config')).toBe(true);
  });
});

describe('excludeMatcher', () => {
  const excluded = excludeMatcher(['node_modules', '*.map', 'docs/drafts/', '/build']);

  it.each([
    ['node_modules', true],
    ['packages/x/node_modules', true],
    ['app.js.map', true],
    ['deep/app.js.map', true],
    ['docs/drafts', true],
    ['other/docs/drafts', false],
    ['build', true],
    ['src/build', false],
    ['src/app.js', false],
    ['.env', false],
  ])('%s is excluded: %s', (path, expected) => {
    expect(excluded(path)).toBe(expected);
  });
});

describe('globBase', () => {
  it.each([
    ['dist/**/*.js', { base: 'dist', rest: '**/*.js' }],
    ['/abs/dir/*.txt', { base: '/abs/dir', rest: '*.txt' }],
    ['/*.txt', { base: '/', rest: '*.txt' }],
    ['*.txt', { base: '.', rest: '*.txt' }],
    ['plain/file', { base: 'plain/file', rest: '' }],
  ])('%s', (pattern, expected) => {
    expect(globBase(pattern)).toEqual(expected);
  });
});

describe('expandGlob', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'node-scp-glob-'));
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, 'a', 'one.js'), '');
    await writeFile(join(root, 'a', 'b', 'two.js'), '');
    await writeFile(join(root, 'a', 'b', 'skip.md'), '');
    await writeFile(join(root, 'a', '.hidden.js'), '');
    await symlink(join(root, 'a'), join(root, 'a', 'b', 'loop'));
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('walks recursively, skips dot files and survives symlink loops', async () => {
    const { base, matches } = await expandGlob(`${root}/a/**/*.js`);
    expect(base).toBe(`${root}/a`);
    expect(matches).toEqual(['b/two.js', 'one.js']);
  });

  it('matches one level', async () => {
    expect((await expandGlob('a/*', { cwd: root })).matches).toEqual(
      ['a/b', 'a/one.js'].map((p) => p.slice(2)),
    );
  });
});
