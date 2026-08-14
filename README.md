# DeepSeek Harness Plugin Manager and Marketplace

[简体中文](README.zh-CN.md)

This repository contains two independent community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

- [`dsh-plugin-manager`](packages/manager) hot-loads already installed plugins through Cordis HMR in a running profile and manages their enablement and runtime state.
- [`@ruihuahe/dsh-plugin-marketplace`](packages/marketplace) discovers, inspects, and installs validated npm plugin bundles.

The repository also publishes the versioned [`dsh.plugin` V1 specification](spec/v1) and an automatically generated plugin catalog under [`catalog/v1`](catalog/v1). GitHub Actions scans the `dsh-plugin` topic every six hours and performs the GitHub, exact npm version, repository ownership, and V1 manifest checks centrally; the runtime marketplace only reads the generated result.

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
