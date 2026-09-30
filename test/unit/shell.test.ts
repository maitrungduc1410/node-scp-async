import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { quoteArg, quotePosix, quoteWindows } from '../../src/shell';

const hasSh = existsSync('/bin/sh');

/** Everything but NUL, which a C string (and so a path) cannot hold. */
const shellString = fc.string({ unit: 'binary', maxLength: 40 }).filter((s) => !s.includes('\0'));

describe('quotePosix', () => {
  it('leaves safe words alone', () => {
    expect(quotePosix('/var/www/app-1.2_x@host:8080,a=b+c%d')).toBe(
      '/var/www/app-1.2_x@host:8080,a=b+c%d',
    );
  });

  it('single quotes everything else', () => {
    expect(quotePosix('')).toBe("''");
    expect(quotePosix('a b')).toBe("'a b'");
    expect(quotePosix("it's")).toBe(`'it'\\''s'`);
    expect(quotePosix('$(rm -rf /)')).toBe("'$(rm -rf /)'");
    expect(quotePosix('~root')).toBe("'~root'");
    expect(quotePosix('-rf')).toBe('-rf');
  });

  it('rejects NUL', () => {
    expect(() => quotePosix('a\0b')).toThrow(/NUL/);
  });

  it.skipIf(!hasSh)('survives a real /bin/sh unchanged for any input', () => {
    fc.assert(
      fc.property(fc.array(shellString, { minLength: 1, maxLength: 5 }), (args) => {
        const script = `for a in ${args.map(quotePosix).join(' ')}; do printf '%s\\0' "$a"; done`;
        const out = execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
        expect(out.split('\0').slice(0, -1)).toEqual(args);
      }),
      { numRuns: 300 },
    );
  });
});

describe('quoteWindows', () => {
  it('double quotes plain paths', () => {
    expect(quoteWindows('C:\\Users\\me\\My Files')).toBe('"C:\\Users\\me\\My Files"');
  });

  it('keeps a trailing backslash from escaping the closing quote', () => {
    expect(quoteWindows('C:\\')).toBe('"C:\\\\"');
    expect(quoteWindows('C:\\dir\\\\')).toBe('"C:\\dir\\\\\\\\"');
  });

  it('round trips through Windows argument parsing', () => {
    // The CommandLineToArgvW rules for one quoted argument: 2n backslashes before a quote are n
    // backslashes and the quote closes, other backslashes are literal.
    const parse = (quoted: string): string => {
      let out = '';
      let i = 1;
      for (;;) {
        let slashes = 0;
        while (quoted[i] === '\\') {
          slashes++;
          i++;
        }
        if (quoted[i] === '"') {
          out += '\\'.repeat(Math.floor(slashes / 2));
          if (slashes % 2 === 0) return i === quoted.length - 1 ? out : `${out}<junk>`;
          out += '"';
        } else {
          out += '\\'.repeat(slashes);
          if (i >= quoted.length) return `${out}<unterminated>`;
          out += quoted[i];
        }
        i++;
      }
    };
    const windowsPath = fc
      .string({
        unit: fc.constantFrom('a', 'b', ' ', '\\', ':', '.', '-', '(', ')'),
        maxLength: 30,
      })
      .filter((s) => s.length > 0);
    fc.assert(fc.property(windowsPath, (path) => parse(quoteWindows(path)) === path));
  });

  it.each(['a"b', '100%', 'hey!', 'a^b', 'line\nbreak', 'C:\\$(calc)', 'a`b'])(
    'rejects %j',
    (value) => {
      expect(() => quoteWindows(value)).toThrow(/Windows shell/);
    },
  );

  it('is picked by quoteArg for win32', () => {
    expect(quoteArg('x y', 'win32')).toBe('"x y"');
    expect(quoteArg('x y', 'posix')).toBe("'x y'");
  });
});