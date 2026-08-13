# DeepSeek Harness 插件管理器

[English](README.md)

**DeepSeek Harness Plugin Manager** 是面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)及其 Cordis 插件运行时的 Web 插件管理工具。它在 Harness 的“插件”设置页中提供查看、搜索、启用、停用、折叠分组和批量管理能力。

这是社区项目，不是 DeepSeek Harness 官方软件包。

## 功能

- 查看当前 Cordis Loader 条目与生命周期状态。
- 启用或停用单个插件，不删除其 npm 软件包。
- 展开 Harness 官方工作区分组，批量启停组内可修改条目，或按配置名称操作单个 Loader 条目。
- 把目标状态持久化到当前 profile 的 `cordis.patch.yml`，重启后仍然生效。
- 保护管理器自身及 Web 管理界面的基础插件，避免意外关闭恢复入口。
- 复用 Harness 现有的受信任 Host 策略，不额外开放服务器端口。
- 提供简体中文和英文界面。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-manager
dsh --profile web
```

进入“设置 -> 插件 -> 插件列表”。管理器会替代 Harness 原有的只读列表，在保留运行状态信息的同时加入分类、搜索和启停控制。移除软件包使用：

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

## 分类与条目名称

官方和第三方软件包使用同一套开放的功能分组规则。插件可以在 `package.json` 中声明 `dsh.pluginManager.group`，不同发布者声明相同组 ID 时会进入同一组。未声明时，任何仓库都可以用 `repository.directory` 的 `packages/<组>/<包>` 形式提供尽力而为的回退；元数据缺失或不合法时进入“未分组”。组 ID 只允许小写字母、数字、点、下划线和连字符。丰富的 `dsh-plugin.json` 独立清单与详情页明确留到后续版本设计。

```json
{
  "dsh": {
    "pluginManager": {
      "group": "llm"
    }
  }
}
```

分组默认收起，展开后直接显示 `include`、`timer` 和 `tool-web` 等 Loader 配置名称，不显示导入模块名。组开关只操作可修改条目并跳过受保护基础设施：绿色表示全部启用，黄色表示部分启用。

## 开发与路线图

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

## 发布

推送 `vX.Y.Z` 标签后，`.github/workflows/publish.yml` 会执行发布。工作流先校验标签与 `package.json` 中的版本一致，再运行测试、类型检查和构建，最后通过 GitHub OIDC 与 npm 可信发布完成发布，不保存长期 `NPM_TOKEN`。

使用工作流前，需要在 npm 软件包的可信发布者设置中填写：GitHub 所有者 `hrhgit`、仓库 `deepseek-harness-plugin-manager`、工作流文件名 `publish.yml`，环境留空，允许的操作只勾选 `npm publish`。npm 只在已存在的软件包设置中提供此入口，因此首次 `0.1.0` 发布仍需使用一个有权发布此包、且启用“绕过双重身份验证”的细粒度访问令牌。首次发布后应立即配置可信发布并撤销该引导令牌。

后续每次发布只需更新并提交版本，然后推送提交及标签：

```powershell
npm version patch
git push origin main --follow-tags
```

后续计划包括 npm 插件安装、删除和升级，展示真实 `dsh.bundle` 来源与兼容性，从 npm、GitHub 或专用索引发现社区插件，以及导入导出插件集合。

建议 GitHub Topics：`deepseek-harness`、`dsh`、`cordis`、`plugin-manager`、`plugin-management`、`web-ui`、`deepseek`、`typescript`。

## 许可证

[MIT](LICENSE)
