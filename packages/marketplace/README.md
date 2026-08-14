# DSH Plugin Marketplace

[简体中文](README.zh-CN.md)

An independent DeepSeek Harness marketplace plugin that reads one automatically generated plugin catalog and installs exact npm versions through the official `dsh plugin` command boundary.

`.github/workflows/catalog.yml` scans GitHub's `dsh-plugin` topic every six hours and on manual dispatch. The collector reads repository manifests, verifies exact npm versions and repository ownership, and produces the single `catalog/v1/catalog.json` document. It does not rewrite or commit an unchanged catalog; a failed scan leaves the previous published catalog intact.

The unified catalog has three states. **Verified** entries provide a valid V1 manifest and matching npm bundle metadata. **Unverified** entries lack a valid V1 manifest but have a trustworthy npm package, exact version, and repository owner, so they remain installable with an explicit compatibility warning. **Rejected** entries remain visible with their admission reason and cannot be installed. There is no manually curated admission layer at this stage.

The marketplace does not depend on `dsh-plugin-manager`. Installation changes the profile bundle stack and reports that a restart is required.

The runtime catalog is fetched through GitHub's Contents API with its raw media type, which avoids the `raw.githubusercontent.com` timeout seen in some Node network environments. Search filters the downloaded document locally; user machines no longer fan out across GitHub and npm. When the remote document is unavailable, the marketplace shows its last-known-good cache. A first run without a cache returns a warned empty catalog instead of disabling the page.

## Local install

```sh
pnpm --filter dsh-plugin-marketplace run build
pnpm --filter dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/dsh-plugin-marketplace-0.1.0.tgz
```

The browser persists two normal preferences: the search query under `dsh-plugin-marketplace.marketplace.global.query.v1` and the status filter under `dsh-plugin-marketplace.marketplace.global.status_filter.v2`. The old V1 status filter is intentionally not migrated because its enum semantics changed. Selection, confirmation, progress, and operation feedback are transient.

## License

[MIT](LICENSE)
