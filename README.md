# DeepSeek Harness Plugin Manager and Marketplace

[简体中文](README.zh-CN.md)

This repository contains two independent community plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

- [`dsh-plugin-manager`](packages/manager) manages enablement and Cordis runtime state for plugins already installed in a profile.
- [`dsh-plugin-marketplace`](packages/marketplace) discovers, inspects, and installs validated npm plugin bundles.

The repository also publishes the versioned [`dsh.plugin` V1 specification](spec/v1) and a curated catalog under [`catalog/v1`](catalog/v1). GitHub's official `dsh-plugin` topic is treated as a community candidate source, not as automatic catalog admission.

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
