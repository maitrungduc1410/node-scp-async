// Publishes the current version to npm unless it is already there. Run by the release workflow
// through `pnpm release`, after `pnpm build`. npm uses trusted publishing (OIDC) in CI, so no
// token is needed, and attaches a provenance statement.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const spec = `${name}@${version}`;

let published = false;
try {
  published =
    execFileSync('npm', ['view', spec, 'version'], { encoding: 'utf8' }).trim() === version;
} catch {
  published = false;
}

if (published) {
  console.log(`${spec} is already on npm, nothing to publish`);
  process.exit(0);
}

const gitTag = `v${version}`;
// A tag left by an earlier run that failed to publish must not fail this run after npm publish,
// which cannot be undone.
const tagged = (() => {
  try {
    execFileSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${gitTag}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
})();

const distTag = version.includes('-') ? 'next' : 'latest';
execFileSync('npm', ['publish', '--access', 'public', '--provenance', '--tag', distTag], {
  stdio: 'inherit',
});
if (!tagged) execFileSync('git', ['tag', gitTag], { stdio: 'inherit' });
// changesets/action reads this line to push the tag and create the GitHub release.
console.log(`New tag: ${spec}`);
