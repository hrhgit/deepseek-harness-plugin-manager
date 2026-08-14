# DSH Plugin Marketplace

[简体中文](README.zh-CN.md)

An independent DeepSeek Harness marketplace plugin that reads the curated V1 catalog, validates candidates from GitHub's `dsh-plugin` topic, and installs exact npm versions through the official `dsh plugin` command boundary.

The marketplace does not depend on `dsh-plugin-manager`. Installation changes the profile bundle stack and reports that a restart is required.

## Local install

```sh
pnpm --filter dsh-plugin-marketplace run build
pnpm --filter dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/dsh-plugin-marketplace-0.1.0.tgz
```

The persisted browser field is the normal search query under `dsh-plugin-marketplace.marketplace.global.query.v1`. Selection, confirmation, progress, and operation feedback are intentionally transient.

## License

[MIT](LICENSE)
