# DeepSeek Harness Plugin Manager

[简体中文](README.zh-CN.md)

**DeepSeek Harness Plugin Manager** is a Web-based plugin manager for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) and its Cordis plugin runtime. It lets operators inspect, search, enable, disable, group, and batch-manage runtime plugins from the Harness Plugins settings page.

This is a community project, not an official DeepSeek Harness package.

## Features

- Inspect the current Cordis Loader entries and lifecycle state.
- Enable or disable one plugin without deleting its npm package.
- Collapse entries by their npm package root and enable or disable a package group in one action.
- Persist desired state in the active profile's `cordis.patch.yml` so it survives restart.
- Protect the manager itself and the Web management surface from accidental shutdown.
- Use Harness's existing trusted-host transport policy; the plugin does not open another server.
- English and Simplified Chinese Web UI.

## Install

Install the package into the `web` profile:

```sh
dsh plugin --profile web add dsh-plugin-manager
dsh --profile web
```

Open **Settings -> Plugins -> Plugin list**. The manager replaces Harness's read-only list while keeping runtime status visible and adding search, package grouping, and enable/disable controls. Removing the package later uses:

```sh
dsh plugin --profile web remove dsh-plugin-manager
```

For a local checkout or tarball:

```sh
pnpm install
pnpm run build
pnpm pack
dsh plugin --profile web add ./dsh-plugin-manager-0.1.0.tgz
```

Git installs run the `prepare` build and require explicit build-script authorization under pnpm 10 and newer. Published npm packages and tarballs already contain `lib/` and do not need install-time build permission.

## Behavior and safety

"Disable" means stopping a configured Cordis plugin and persisting `disabled: true`; it does not uninstall the dependency. The manager writes only its own marked patch rows and leaves user-authored rows untouched. If a local entry id is ambiguous, the operation fails instead of changing the wrong plugin.

By default, the manager protects its own entry plus the API gateway, Web server, client runtime, settings shell, client module loader, HMR bridge, and Host runner. Add deployment-specific ids through the Cordis row config:

```yaml
- id: dsh-plugin-manager
  name: dsh-plugin-manager
  config:
    protectedEntries: [my-auth-provider]
    settleTimeoutMs: 8000
```

The Web API follows the same trusted-host decision as the Harness connection. Anyone allowed to use the trusted Web control plane can invoke plugin enablement, so do not expose the Harness Web server to untrusted networks.

## Package grouping

Grouping is based on the imported npm package root: `@scope/package/client` and `@scope/package/host` appear under `@scope/package`. Cordis built-ins such as `cordis:group` remain separate. A Harness `dsh.bundle` is a distribution layer and is not currently retained as runtime provenance, so bundle-origin grouping belongs to a later release.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

The package has one Host entry, one browser entry, generated Typert Remote artifacts, and one `dsh.bundle` patch. It targets the pre-release `0.1.x` Harness APIs; review release notes before upgrading peer dependencies.

## Roadmap

- Install, remove, and update npm plugin packages.
- Display true `dsh.bundle` provenance and compatibility metadata.
- Discover community plugins from npm, GitHub, or a dedicated index.
- Import and export curated plugin sets.

## Discoverability

Recommended GitHub topics: `deepseek-harness`, `dsh`, `cordis`, `plugin-manager`, `plugin-management`, `web-ui`, `deepseek`, `typescript`.

Search phrases that accurately describe this project include **DeepSeek Harness plugin manager**, **DSH plugin management Web UI**, **Cordis plugin enable and disable**, and **DeepSeek Harness plugin bundle manager**.

## License

[MIT](LICENSE)
