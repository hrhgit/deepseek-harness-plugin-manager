# DeepSeek Harness Plugin Manager and Marketplace

[简体中文](README.zh-CN.md)

This repository contains two independent community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

- [`dsh-plugin-manager`](packages/manager) hot-loads already installed plugins through Cordis HMR in a running profile and manages their enablement and runtime state.
- [`@ruihuahe/dsh-plugin-marketplace`](packages/marketplace) discovers, inspects, and installs npm plugin bundles with verified package and repository facts.

This repository does not define its own plugin specification. The automatically generated [`catalog/v2`](catalog/v2) discovers package manifests in `dsh-plugin` topic repositories; GitHub Actions centrally verifies an exact npm version and repository ownership, and records whether the published package declares the official `dsh.bundle` metadata. The runtime marketplace only reads that generated result.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

Package releases use tags in the form `dsh-plugin-manager@<version>` or `dsh-plugin-marketplace@<version>`.

## License

[MIT](LICENSE)
