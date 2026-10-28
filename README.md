# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 仓库说明 / Repository Overview

> 本仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Linux 适配分支集，提供三个互补分支：

| 分支 | 用途 | 构建产物 |
|------|------|----------|
| **[`linux-custom-titlebar`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-custom-titlebar)** | 定制优化版：自定义标题栏、系统托盘、桌面通知、自动更新 | `v*-linux-x64-custom` |
| **[`linux-package-official`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-package-official)**（当前分支） | 官方上游版：仅引入 Linux 打包基建，功能与上游一致 | `v*-linux-x64-official` |
| **[`master`](https://github.com/yaoyingkeji/deepseek-harness/tree/master)** | 纯上游镜像，不含任何 Linux 分支改动 | — |

### `linux-package-official` — 官方上游版（当前分支）

与 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `master` 分支功能**完全一致**，仅额外注入 Linux 打包基础设施：

- 注册 `linux-x64` 构建目标
- 配置 `electron-builder` 的 Linux AppImage + deb 构建
- 包含 `package-linux.sh` 打包脚本
- 提供 GitHub Actions 云端构建工作流（`.github/workflows/linux-package-release.yml`）

不做任何 UI 或功能性修改，适合需要官方原版体验的用户。

#### 下载安装

前往 [Releases 页面](https://github.com/yaoyingkeji/deepseek-harness/releases)，查找 `v*-linux-x64-official` 标签。

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
