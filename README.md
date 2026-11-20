# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Repository notes

> This is a fork build repository (Yaoying Tech). The **`linux-package-official`** branch is the
> **official upstream variant**: it matches upstream `deepseek-ai/deepseek-harness` `master`
> feature-for-feature and only injects Linux packaging infrastructure. No UI or functional changes.
> Use it if you want the stock upstream experience with Linux installers.

| Branch | Purpose | Artifacts |
|--------|---------|-----------|
| **[`linux-custom-titlebar`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-custom-titlebar)** (default) | Customized: native titlebar integration, tray, desktop notifications, configurable close behavior, multiple update channels | `v*-linux-x64-custom` |
| **[`linux-package-official`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-package-official)** | Official upstream variant: Linux packaging only | `v*-linux-x64-official` |
| **[`master`](https://github.com/yaoyingkeji/deepseek-harness/tree/master)** | Pure upstream mirror, no Linux changes | — |

### `linux-package-official` — official upstream variant

**Feature-identical to upstream `master`**; only Linux packaging infrastructure is injected.
No custom titlebar, no tray, no extra notifications, no close-behavior switch.

What is added on top of upstream:

| Area | Content |
|------|---------|
| **Build target** | `linux-x64` packaging target (`desktop-build-paths.*`, `package-target.ts`) |
| **electron-builder** | Linux section: `AppImage` + `deb`, icon set, `maintainer` / `synopsis` / `executableName`, `StartupWMClass` |
| **Update feed** | "Check for updates" points at the `linux-latest-official` release |
| **Build script** | `package-linux.sh` |
| **CI workflow** | `.github/workflows/linux-package-release.yml` |
| **Publish/upload** | `desktop-publish-*` and retain/upload paths handle `linux-x64` (artifacts are published by the workflow, not COS) |
| **Publisher package types** | `linux-x64` added to `DesktopAutoUpdateTarget`, zod schemas and `desktopPackageWorkflows` |

Known differences from upstream: an added `homepage` field in `apps/desktop/package.json`; reserved
i18n strings for `no_release` / `upstream_available` update phases that the (upstream-identical)
update coordinator never emits; and local copies of `desktop-auto-update-environment.*`,
`desktop-publish-targets.ts`, `desktop-release-store.ts` kept for the packaging chain.

Artifacts: `v*-linux-x64-official` (AppImage + `.deb`), feed: `linux-latest-official`.
The native Office engine is **not** bundled here — use the `linux-custom-titlebar` artifacts if needed.

### `master` — pure upstream mirror

Tracks upstream `master` and mirrors its tags and releases. Used for comparison and upstream tracking.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
