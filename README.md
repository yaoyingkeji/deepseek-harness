# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 仓库说明 / Repository Overview

> 本仓库是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Linux 适配分支集，提供三个互补分支：

| 分支 | 用途 | 构建产物 |
|------|------|----------|
| **[`linux-custom-titlebar`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-custom-titlebar)**（默认） | 定制优化版：自定义标题栏、系统托盘、桌面通知、自动更新 | `v*-linux-x64-custom` |
| **[`linux-package-official`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-package-official)** | 官方上游版：仅引入 Linux 打包基建，功能与上游一致 | `v*-linux-x64-official` |
| **[`master`](https://github.com/yaoyingkeji/deepseek-harness/tree/master)** | 纯上游镜像，不含任何 Linux 分支改动 | — |

### 检查更新 / Status

| 项目 | 状态 |
|------|------|
| **上游最新版本** | `0.2.2-alpha.2`（`dsh-v0.2.2-alpha.2`） |
| **上游同步** | ✅ 已同步，0 commits behind |
| **定制版 Linux 发行包** | ⏳ 构建中（`v0.2.2-alpha.2-linux-x64-custom`），线上为 `v0.2.1-rc.2-linux-x64` |
| **官方版 Linux 发行包** | ⏳ 构建中（`v0.2.2-alpha.2-linux-x64-official`），暂无线上发行包 |
| **自动更新源** | ✅ `linux-latest` → `v0.2.1-rc.2` |

> 发布状态每行左侧为最新源码版本（`apps/desktop/package.json`），右侧为线上已发布的 Release。定制版和官方版的 `0.2.2-alpha.2` 正在 GitHub Actions 云端构建中。更新同步历史请查看 [Actions 面板](https://github.com/yaoyingkeji/deepseek-harness/actions/workflows/384236203)。

### `linux-custom-titlebar` — 定制优化版

基于 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 针对 Linux 桌面端优化：

1. **自定义标题栏**：将 "应用 / 编辑" 菜单内嵌进标题栏，与 Windows 版体验一致，节约屏幕高度
2. **去除原生菜单栏**：抑制 GTK 菜单栏泄漏的调试项，界面更干净
3. **系统托盘 + 关闭行为可配置**：关闭后驻留托盘；通用设置可选 "隐藏到托盘" 或 "退出应用"
4. **桌面通知**：后台任务、审核请求、模型提问等场景弹出原生通知，通知分类可精细开关
5. **自动更新**：指向 `linux-latest` Release，AppImage 支持自动下载安装

#### 下载安装

前往 [Releases 页面](https://github.com/yaoyingkeji/deepseek-harness/releases)，查找 `v*-linux-x64-custom` 标签：

```bash
# AppImage
chmod +x deepseek-harness-*-linux-x64.AppImage
./deepseek-harness-*-linux-x64.AppImage

# deb
sudo dpkg -i deepseek-harness_*_amd64.deb
```

#### 界面截图

| 欢迎界面 | 主界面（自定义标题栏） |
| :---: | :---: |
| ![欢迎界面](docs/screenshots/linux-custom-titlebar/screenshot-01-welcome.png) | ![主界面](docs/screenshots/linux-custom-titlebar/screenshot-02-main-window.png) |

| "应用" 菜单 | 菜单展开效果 |
| :---: | :---: |
| ![应用菜单](docs/screenshots/linux-custom-titlebar/screenshot-03-app-menu.png) | ![菜单展开效果](docs/screenshots/linux-custom-titlebar/screenshot-04-menu-open.png) |

### `linux-package-official` — 官方上游版

与上游 `master` 功能完全一致，**仅额外注入 Linux 打包基础设施**（`linux-x64` 构建目标、`electron-builder` 配置、`package-linux.sh` 脚本），不做任何 UI 或功能性修改。适合需要官方原版体验的用户。

### `master` — 纯上游镜像

持续同步 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `master` 分支，不做任何额外改动。用于版本对比和上游追踪。

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
