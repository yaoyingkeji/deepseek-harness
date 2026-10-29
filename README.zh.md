# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 仓库说明

> 本仓库是 DeepSeek Harness 的 Deepin v25 桌面端优化修改版，适配并测试通过，其他 Linux 系统需自行测试。

| 分支 | 用途 | 构建产物 |
|------|------|----------|
| **[`linux-custom-titlebar`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-custom-titlebar)**（默认） | 定制优化版：自定义标题栏、系统托盘、桌面通知、自动更新 | `v*-linux-x64-custom` |
| **[`linux-package-official`](https://github.com/yaoyingkeji/deepseek-harness/tree/linux-package-official)** | 官方上游版：仅引入 Linux 打包基建，功能与上游一致 | `v*-linux-x64-official` |
| **[`master`](https://github.com/yaoyingkeji/deepseek-harness/tree/master)** | 纯上游镜像，不含任何 Linux 分支改动 | — |

### 检查更新

| 项目 | 状态 |
|------|------|
| **上游最新版本** | `v0.2.2-alpha.2`（`dsh-v0.2.2-alpha.2`） |
| **上游同步** | ✅ 已同步，0 commits behind |
| **定制版 Linux 发行包** | ✅ `v0.2.2-alpha.2-linux-x64-custom` |
| **官方版 Linux 发行包** | ⏳ 未发布（`v0.2.2-alpha.2-linux-x64-official` 构建中） |
| **自动更新源** | ✅ `linux-latest` → `v0.2.2-alpha.2-linux-x64-custom` |

> 本表在每次云端构建发布后由 GitHub Actions 自动刷新，无需手工维护。查看 [Actions 面板](https://github.com/yaoyingkeji/deepseek-harness/actions/workflows/384236203)。

### `linux-custom-titlebar` — 定制优化版

基于 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 针对 Linux 桌面端优化：

1. **自定义标题栏**：将「应用 / 编辑」菜单内嵌进标题栏，与 Windows 版体验一致，节约屏幕高度
2. **去除原生菜单栏**：抑制 GTK 菜单栏泄漏的调试项，界面更干净
3. **系统托盘 + 关闭行为可配置**：关闭后驻留托盘；通用设置可选「隐藏到托盘」或「退出应用」
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

| 「应用」菜单 | 菜单展开效果 |
| :---: | :---: |
| ![应用菜单](docs/screenshots/linux-custom-titlebar/screenshot-03-app-menu.png) | ![菜单展开效果](docs/screenshots/linux-custom-titlebar/screenshot-04-menu-open.png) |

### `linux-package-official` — 官方上游版

与上游 `master` 功能完全一致，**仅额外注入 Linux 打包基础设施**（`linux-x64` 构建目标、`electron-builder` 配置、`package-linux.sh` 脚本），不做任何 UI 或功能性修改。适合需要官方原版体验的用户。

### `master` — 纯上游镜像

持续同步 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `master` 分支，不做任何额外改动。用于版本对比和上游追踪。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群！扫描下方二维码填写入群问卷，小助手会定期发送入群邀请。

<table>
  <thead>
    <tr>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
