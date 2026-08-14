# DSH 插件市场

[English](README.md)

这是一个独立的 DeepSeek Harness 市场插件：读取 V1 正式目录，验证 GitHub `dsh-plugin` 话题中的候选仓库，并通过官方 `dsh plugin` 命令边界安装精确的 npm 版本。

市场不依赖 `dsh-plugin-manager`。安装会改变 profile 的组合包列表，因此成功后统一提示重启。

## 本地安装

```sh
pnpm --filter dsh-plugin-marketplace run build
pnpm --filter dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/dsh-plugin-marketplace-0.1.0.tgz
```

浏览器只持久化普通搜索条件，存储键为 `dsh-plugin-marketplace.marketplace.global.query.v1`。当前选择、安装确认、进度和反馈属于临时状态，不会恢复。

## 许可证

[MIT](LICENSE)
