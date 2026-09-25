# Development bootstrap

Completed scope: minimal workspace and tooling, September 24, 2026.

The root specifications and approved foundation decision record remain authoritative.
The historical audit describes the project before reconciliation; it is preserved.

## Setup

Use Node **24.21.0** (also recorded in `.nvmrc` and `.node-version`) and pnpm
**11.24.0**. With nvm installed, run `nvm install` followed by `nvm use`.
Install the pinned package manager with `npm install --global pnpm@11.24.0`
if it is not already available.

From the project root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm list --recursive --depth -1
```

Strict engine and peer checks reject incompatible toolchains. Dependencies use exact
versions and the workspace lockfile provides reproducible resolution.
Git is initialized locally; no remote or commit is created by this bootstrap.

## Version selection

Verified against the official Node release index and npm publisher metadata on
September 24, 2026:

- Node 24.21.0: current Node 24 LTS patch in the release index.
- pnpm 11.24.0: requires Node >=22.13.
- TypeScript 6.0.3: selected stable 6.0 release for parser compatibility.
- ESLint 10.11.0 and @eslint/js 10.0.1: support Node 24.
- typescript-eslint 8.70.1: supports ESLint 10 and TypeScript >=4.8.4, <6.1.0.
- Prettier 3.9.9: supports Node >=14.
- @types/node 24.13.6: matches the runtime major.

The registry's latest TypeScript was 7.0.2, outside the parser's supported range.
NestJS and Prisma were installed in the subsequent API/database foundation slice.
Future mobile work must check Expo/React Native compatibility before selecting
their package versions; they are not installed yet.

Verification sources:

- https://nodejs.org/dist/index.json
- https://registry.npmjs.org/pnpm/11.24.0
- https://registry.npmjs.org/typescript/6.0.3
- https://registry.npmjs.org/eslint/10.11.0
- https://registry.npmjs.org/@eslint%2fjs/10.0.1
- https://registry.npmjs.org/typescript-eslint/8.70.1
- https://registry.npmjs.org/prettier/3.9.9
- https://registry.npmjs.org/@types%2fnode/24.13.6

## Workspace and checks

Workspace discovery covers `apps/*` and `packages/*`. The initial child package was
`@saydaliyati/typescript-config`, a private configuration package with no runtime code.
The subsequent [API/database slice](API-DATABASE-FOUNDATION.md) adds
`@saydaliyati/api` and `@saydaliyati/database`.
The shared base supplies strict checks; each future application selects its own
module system, libraries, framework settings and output behavior.

- `pnpm typecheck`: checks bootstrap JavaScript with TypeScript checkJs and the
  implemented workspace packages with their strict configurations.
- `pnpm lint`: checks tooling and provides recommended JavaScript/TypeScript rules.
- `pnpm format:check` / `pnpm format`: checks or formats implemented source/tooling
  and the new development guides,
  preserving the formatting and contents of historical specifications/assets.
- `pnpm metadata:check`: checks the documentation inventory, complete specification
  SHA-256 coverage and local Markdown file links (not heading anchors or remote URLs).
- `pnpm metadata:update`: explicitly refreshes the inventory and hashes after
  intentional documentation edits. Review changes before accepting new hashes.
- `pnpm check`: now also builds the API/database packages, validates Prisma and
  runs API tests. PostgreSQL integration tests run separately.

Checksums cover all Markdown documents, design assets and PACKAGE-MANIFEST.json.
They do not cover application/tooling files or themselves. The pnpm lockfile records
dependency integrity. The JSON package manifest describes documentation, not npm.

## Bootstrap verification

Verified with Node 24.21.0 and pnpm 11.24.0: dependency installation, an offline
frozen-lockfile reinstall, workspace discovery, formatting, lint and TypeScript
checks all pass. Metadata verification covers 43 Markdown documents and 46 hashes.
Git ignores dependency directories, local environment files and Finder metadata.
The host's global Node remains unchanged; activate the pinned Node version before
running project commands.

## Remaining scope

The bootstrap has been followed by the [API/database foundation](API-DATABASE-FOUNDATION.md),
which includes builds, tests, initial identity migrations and local PostgreSQL.
The [backend authentication slice](AUTHENTICATION.md) now implements registration,
login, session rotation/logout and the patient profile. Mobile, catalog/inventory,
CI and provider integrations remain future work. The first complete journey remains
registration, medicine search and personal inventory.
