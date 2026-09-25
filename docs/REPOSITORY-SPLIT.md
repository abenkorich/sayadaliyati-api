# Independent repository split

The user requested local repositories sayadaliyati-api and sayadaliyati-app and
will manage remote pushes, VPS and domain setup. The original Saydaliyati checkout
is preserved. The API remains an internal pnpm workspace so database and validation
boundaries do not need risky import rewrites. It contains no mobile implementation.
The app is flattened to its repository root, with its own tooling and lockfile.

No actual .env files, dependencies, build output, signing credentials or original
Git internals were copied. Runtime package names and database names are unchanged.
New development ports/Compose identity avoid colliding with the original stack.
Tests may use explicitly injected existing local test services; this does not move
or attach the new development stack to original development volumes.

OpenAPI exchange is explicit: API docs/api.openapi.json -> app
contracts/api.openapi.json. The app's smoke test accepts a URL and dedicated test
credentials rather than importing or bootstrapping backend code. No cross-repository
filesystem imports or workspace dependencies remain.

Historical specification documents remain available in this repository; their
monorepo commands refer to earlier milestones. Follow the current root README for
setup and deployment process entry points. VPS provisioning, production deployment
hardening and push provider setup are outside this local split.
