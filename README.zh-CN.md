# DeepSeek Harness 插件管理器

[English](README.md)

**DeepSeek Harness Plugin Manager** 是面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)及其 Cordis 插件运行时的 Web 插件管理工具。它在 Harness 的“插件”设置页中提供查看、搜索、启用、停用、折叠分组和批量管理能力。

这是社区项目，不是 DeepSeek Harness 官方软件包。

## 功能

- 查看当前 Cordis Loader 条目与生命周期状态。
- 启用或停用单个插件，不删除其 npm 软件包。
- 先按 Harness 官方工作区包组分类，再按 npm 包根名折叠条目，并批量启用或停用整个包。
- 把目标状态持久化到当前 profile 的 `cordis.patch.yml`，重启后仍然生效。
- 保护管理器自身及 Web 管理界面的基础插件，避免意外关闭恢复入口。
- 复用 Harness 现有的受信任 Host 策略，不额外开放服务器端口。
- 提供简体中文和英文界面。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-manager
dsh --profile web
```

进入“设置 -> 插件 -> 插件列表”。管理器会替代 Harness 原有的只读列表，在保留运行状态信息的同时加入搜索、包分组和启停控制。移除软件包使用：

```sh
dsh plugin --profile web remove dsh-plugin-manager
```

本地源码或 tarball 安装：

```sh
pnpm install
pnpm run build
pnpm pack
dsh plugin --profile web add ./dsh-plugin-manager-0.1.0.tgz
```

Git 安装会运行 `prepare`，pnpm 10 及更高版本要求用户明确授权构建脚本。npm 正式包和 tarball 已包含 `lib/`，不需要安装时构建权限。

## 行为与安全

界面中的“停用”表示持久化 `disabled: true` 并请求 Cordis 停止已配置的插件，不是卸载 npm 依赖。普通叶子插件会在其生命周期允许时于当前进程即时切换；如果状态已经保存、但在期限内没有完成切换，界面会提示需要重启当前 profile，而不会把已保存的变更当作失败。管理器只维护带自身标记的 patch 行，不改写用户已有行；本地条目 id 存在歧义时会拒绝操作。

默认保护管理器自身、API 网关、Web 服务器、客户端运行时、设置外壳、客户端模块加载器、HMR 桥和 Host runner。可在管理器配置中补充部署自己的基础条目：

```yaml
- id: dsh-plugin-manager
  name: dsh-plugin-manager
  config:
    protectedEntries: [my-auth-provider]
    settleTimeoutMs: 8000
```

Web API 沿用 Harness 连接层的受信任 Host 判定。能够使用受信任 Web 控制面的访问者也能启停插件，因此不要把 Harness Web 服务暴露给不可信网络。

管理器默认保护自身条目及其 Loader 祖先、根 Include、配置 HMR 服务，以及远程接口、Web 服务、客户端运行时、设置页、模块加载、连接和语言服务。这些条目维持配置刷新和管理页面本身，不能从该页面安全停用。

## 分类与分组语义

官方 `@deepseek-ai/dsh-*` 包先按当前兼容 Harness 版本的工作区包组分类，包括 `core`、`bundle`、`boot`、`session`、`interaction`、`extensions` 和 `llm`。每个分类内再按导入模块的 npm 包根名分组：`@scope/package/client` 和 `@scope/package/host` 会归到 `@scope/package`。Cordis 基础设施和社区或本地包各有独立分类。这里的 `bundle` 表示该包在官方仓库中的归属；Cordis 运行时不会保留某个条目最初来自哪个已安装 profile bundle。

## 开发与路线图

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

后续计划包括 npm 插件安装、删除和升级，展示真实 `dsh.bundle` 来源与兼容性，从 npm、GitHub 或专用索引发现社区插件，以及导入导出插件集合。

建议 GitHub Topics：`deepseek-harness`、`dsh`、`cordis`、`plugin-manager`、`plugin-management`、`web-ui`、`deepseek`、`typescript`。

## 许可证

[MIT](LICENSE)
