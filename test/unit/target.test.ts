import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../src/errors';
import { formatTarget, parseTarget } from '../../src/target';

describe('parseTarget', () => {
  it.each([
    ['host:', { host: 'host', path: '' }],
    ['host:/abs', { host: 'host', path: '/abs' }],
    ['user@host:rel/dir', { host: 'host', username: 'user', path: 'rel/dir' }],
    ['user@example.com:/a:b', { host: 'example.com', username: 'user', path: '/a:b' }],
    ['me@corp@host:/x', { host: 'host', username: 'me@corp', path: '/x' }],
    ['root@[::1]:/tmp', { host: '::1', username: 'root', path: '/tmp' }],
    ['[fe80::1]:', { host: 'fe80::1', path: '' }],
    ['scp://host', { host: 'host', path: '' }],
    [
      'scp://deploy@host:2222/var/www',
      { host: 'host', port: 2222, username: 'deploy', path: '/var/www' },
    ],
    ['scp://u%40x@[::1]/a%20b', { host: '::1', username: 'u@x', path: '/a b' }],
  ])('parses %j', (value, expected) => {
    expect(parseTarget(value)).toEqual(expected);
  });

  it.each(['./a:b', 'dir/file:1', 'C:\\Users\\me', 'D:/data', 'plain', '/abs/path', ':nohost'])(
    'treats %j as local',
    (value) => {
      expect(parseTarget(value)).toBeUndefined();
    },
  );

  it('rejects passwords in URIs and empty user names', () => {
    expect(() => parseTarget('scp://u:secret@host/x')).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
    expect(() => parseTarget('@host:x')).toThrow(/Empty user name/);
  });

  it('formats back to a parseable string', () => {
    const target = fc.record({
      host: fc.oneof(fc.domain(), fc.ipV4(), fc.ipV6()),
      username: fc.option(fc.stringMatching(/^[a-z_][a-z0-9_-]{0,15}$/), { nil: undefined }),
      path: fc.string({ maxLength: 30 }),
    });
    fc.assert(
      fc.property(target, (t) => {
        const input = t.username === undefined ? { host: t.host, path: t.path } : t;
        expect(parseTarget(formatTarget(input))).toEqual(input);
      }),
    );
  });
});
