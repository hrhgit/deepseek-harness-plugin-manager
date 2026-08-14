# DeepSeek Harness 插件管理器与市场

[English](README.md)

这个仓库包含两个互相独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件：

- [`dsh-plugin-manager`](packages/manager) 管理当前 profile 中已安装插件的启停和 Cordis 运行状态。
- [`dsh-plugin-marketplace`](packages/marketplace) 发现、查看并安装经过验证的 npm 插件组合包。

仓库同时维护版本化的 [`dsh.plugin` V1 规范](spec/v1)和 [`catalog/v1`](catalog/v1) 正式目录。GitHub 官方推荐的 `dsh-plugin` 话题只作为社区候选来源，不会自动获得正式收录。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

发布标签分别使用 `dsh-plugin-manager@<版本>` 和 `dsh-plugin-marketplace@<版本>`。

## 许可证

[MIT](LICENSE)
