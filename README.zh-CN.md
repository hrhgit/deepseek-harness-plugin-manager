# DeepSeek Harness 插件管理器与市场

[English](README.md)

这个仓库包含两个互相独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件：

- [`dsh-plugin-manager`](packages/manager) 通过 Cordis HMR 在运行中的 profile 内即时热加载已安装插件，并管理其启停和运行状态。
- [`@ruihuahe/dsh-plugin-marketplace`](packages/marketplace) 发现、查看并安装经过验证的 npm 插件组合包。

仓库同时维护版本化的 [`dsh.plugin` V1 规范](spec/v1)和 [`catalog/v1`](catalog/v1) 自动插件目录。GitHub Actions 每六小时扫描 `dsh-plugin` 话题，集中完成 GitHub、npm 精确版本、仓库归属和 V1 清单校验；市场运行时只读取生成结果。

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
