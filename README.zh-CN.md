# DeepSeek Harness 插件管理器与市场

[English](README.md)

这个仓库包含两个互相独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件：

- [`dsh-plugin-manager`](packages/manager) 通过 Cordis HMR 在运行中的 profile 内即时热加载已安装插件，并管理其启停和运行状态。
- [`@ruihuahe/dsh-plugin-marketplace`](packages/marketplace) 发现、查看并安装软件包与仓库事实已校验的 npm 插件组合包。

本仓库不制定自有插件规范。自动生成的 [`catalog/v2`](catalog/v2) 从 `dsh-plugin` 话题仓库中发现软件包清单；GitHub Actions 集中校验 npm 精确版本和仓库归属，并记录已发布软件包是否声明官方 `dsh.bundle` 元数据，市场运行时只读取该生成结果。

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
