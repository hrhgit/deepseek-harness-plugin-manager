# DSH 插件市场

[English](README.md)

这是一个独立的 DeepSeek Harness 市场插件：读取 V1 正式目录，发现 GitHub `dsh-plugin` 话题中的候选仓库，并通过官方 `dsh plugin` 命令边界安装精确的 npm 版本。

市场把发现与安装准入分开处理。话题命中的仓库即使尚未采用 V1 清单，也会显示在“社区候选”列表；只要能从仓库的 `package.json` 确定 npm 包和精确版本，并通过 npm 与 GitHub 仓库归属校验，就可以直接安装。此类候选会明确提示 DSH 兼容性尚未由 V1 清单验证；未发布 npm、版本不存在或仓库归属不一致的候选仍不可安装。

市场不依赖 `dsh-plugin-manager`。安装会改变 profile 的组合包列表，因此成功后统一提示重启。

## 本地安装

```sh
pnpm --filter dsh-plugin-marketplace run build
pnpm --filter dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/dsh-plugin-marketplace-0.1.0.tgz
```

浏览器持久化两项普通偏好：搜索条件使用 `dsh-plugin-marketplace.marketplace.global.query.v1`，状态筛选使用 `dsh-plugin-marketplace.marketplace.global.status_filter.v1`。当前选择、安装确认、进度和反馈属于临时状态，不会恢复。

## 许可证

[MIT](LICENSE)
