import { main } from './main';

main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`node-scp: ${String(err)}\n`);
    process.exitCode = 1;
  },
);
