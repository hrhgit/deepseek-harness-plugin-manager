# DSH Plugin Marketplace

[简体中文](README.zh-CN.md)

An independent DeepSeek Harness marketplace plugin that reads one automatically generated plugin catalog and installs exact npm versions through the official `dsh plugin` command boundary.

`.github/workflows/catalog.yml` searches GitHub's `dsh-plugin` topic every six hours and on manual dispatch. It finds `package.json` files from each repository tree rather than relying on a marketplace-defined manifest. Scheduled runs use a committed scan checkpoint plus the last generated catalog: unchanged repositories are retained without rereading their manifests or npm metadata, while repositories updated since that checkpoint are revalidated. Manual dispatch offers a full reconciliation for deliberately rechecking every repository. The collector produces the single `catalog/v2/catalog.json` document and only rewrites it when its entries or coverage change; its separate checkpoint advances after each successful scan. A failed scan leaves the previous published catalog and checkpoint intact.

The unified catalog has two installation states. **Installable** entries have a trustworthy npm package, exact version, and matching repository ownership. **No installable package** entries remain visible with their factual reason and cannot be installed. Separately, each entry shows whether its published package declares the official `dsh.bundle` metadata, without making that metadata a marketplace admission requirement. Every catalog and UI list is ordered by installable status and then entry ID. There is no manually curated admission layer or marketplace-defined plugin metadata standard.

The marketplace does not depend on `dsh-plugin-manager`. Installation changes the profile bundle stack and reports that a restart is required.

The runtime catalog is fetched through GitHub's Contents API with its raw media type, which avoids the `raw.githubusercontent.com` timeout seen in some Node network environments. Search filters the downloaded document locally; user machines no longer fan out across GitHub and npm. When the remote document is unavailable, the marketplace shows its last-known-good cache. A first run without a cache returns a warned empty catalog instead of disabling the page.

## Local install

```sh
pnpm --filter @ruihuahe/dsh-plugin-marketplace run build
pnpm --filter @ruihuahe/dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/hrhgit-dsh-plugin-marketplace-0.1.0.tgz
```

The browser persists two normal preferences: the search query under `dsh-plugin-marketplace.marketplace.global.query.v1` and the availability filter under `dsh-plugin-marketplace.marketplace.global.status_filter.v3`. The old status filter is intentionally not migrated because its enum semantics changed. Selection, confirmation, progress, and operation feedback are transient.

## License

[MIT](LICENSE)
