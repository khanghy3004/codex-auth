---
name: npm-package-publish
description: Package codex-auth as @loongphy/codex-auth and publish to npm on tag pushes
---

# Plan

Package `codex-auth` as the public npm package `@loongphy/codex-auth` and make `v*` tag pushes publish both GitHub release assets and npm packages automatically. Use npm's platform-aware install model: one root package exposes the command, and three platform packages carry the actual binaries for Linux x64, macOS ARM64, and Windows x64.

## Requirements
- Publish the root npm package as `@loongphy/codex-auth`.
- Publish three platform packages for binary delivery:
  - `@loongphy/codex-auth-linux-x64`
  - `@loongphy/codex-auth-darwin-arm64`
  - `@loongphy/codex-auth-win32-x64`
- Keep the installed command name as `codex-auth`.
- On `v*` tag push, publish stable versions to npm dist-tag `latest`.
- On prerelease tags such as `v1.2.0-rc.1`, publish to npm dist-tag `next`.
- Enforce version alignment between git tag, npm package versions, and `src/version.zig`.
- Preserve the existing GitHub Release flow for downloadable archives.

## Scope
- In: npm package structure, binary packaging, publish workflow, version validation, README/install docs updates, and release automation.
- Out: adding a JS/TS library API, changing CLI behavior, or replacing the existing shell/PowerShell installers.

## Files and entry points
- `package.json` at repo root for the npm entry package
- `bin/` or equivalent root-package launcher for resolving and executing the installed platform binary
- `npm/` or `dist/npm/` subtree for the root package plus three platform package manifests and binaries
- `.github/workflows/ci.yml` for build, package, release, and npm publish automation
- `src/version.zig` for CLI version output alignment
- `README.md` for npm install and usage documentation
- `docs/implement.md` for packaging and release-process documentation

## Data model / API changes
- New public npm install surface:
  - `npm install -g @loongphy/codex-auth`
  - `npx @loongphy/codex-auth ...`
- No new runtime API; this remains a CLI-only package.
- New npm publish requirement: configure Trusted Publishing for the root package and all three platform packages.

## Action items
[ ] Add a root npm package manifest for `@loongphy/codex-auth` with `bin`, `optionalDependencies`, `files`, license/readme metadata, and publish config for a public scoped package.
[ ] Add a launcher script that resolves the installed platform package and execs the contained `codex-auth` binary, with a clear error when the current OS/arch is unsupported or the platform package is missing.
[ ] Create three platform package directories with package manifests that declare strict `os` and `cpu` fields and contain exactly one packaged binary for the matching target.
[ ] Extend the build pipeline to compile release binaries for the three supported targets and stage them into the matching platform package directories.
[ ] Add a version-check step that fails if the pushed tag version, root package version, platform package versions, and `src/version.zig` do not match exactly.
[ ] Update the tag workflow so platform packages publish first, then the root package publishes after all three succeed.
[ ] Keep GitHub Release creation in the same workflow, but make npm install independent from GitHub Release downloads.
[ ] Update `README.md` with npm install instructions, `npx` usage, and the supported platform matrix.
[ ] Update `docs/implement.md` to describe the npm packaging model and the tag-to-npm publish rules, and to reconcile the current ARM64 release-support gap with the new plan.

## Testing and validation
- `zig build test`
- Build all three supported release targets in CI before any publish step.
- `npm pack` for the root package and at least one platform package to verify package contents.
- Install from packed tarballs in CI on the host runner and verify `codex-auth --version`.
- If any `.zig` file changes during implementation, run `zig build run -- list` per repo policy.

## Risks and edge cases
- Current CI only publishes three x64 GitHub artifacts, so the ARM64 matrix needs to be added carefully to avoid claiming support without producing artifacts.
- npm root-package publish must wait for platform packages, otherwise fresh installs can fail during the propagation window.
- Windows package layout and executable path handling need explicit verification in the launcher.
- Tag/version mismatch handling must fail early to avoid partial npm publishes with inconsistent versions.

## Assumptions
- `@loongphy/codex-auth` is available on npm and can be published as a public scoped package.
- The preferred distribution model is a root package plus per-platform binary packages using npm `optionalDependencies` and `os/cpu`, not a single all-platform tarball and not a postinstall GitHub download step.
- Existing shell and PowerShell installers remain supported and continue to use GitHub Releases.
