# Changesets

Every pull request that changes published behaviour adds a changeset:

```sh
pnpm changeset
```

Pick the bump (patch for fixes, minor for new features, major for breaking changes) and write
one or two sentences for the changelog. The release workflow turns pending changesets into a
"chore: release" pull request; merging that pull request publishes to npm.
