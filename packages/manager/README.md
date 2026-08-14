# DeepSeek Harness Plugin Manager

[简体中文](README.zh-CN.md)

**DeepSeek Harness Plugin Manager** is a Web-based plugin manager for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) and its Cordis plugin runtime. Its defining feature is Cordis HMR-backed hot loading inside a running profile, alongside inspection, search, enable, disable, grouping, and batch management from the Harness Plugins settings page.

This is a community project, not an official DeepSeek Harness package.

## Features

- **Runtime hot loading**: applies enablement changes through the host's existing Cordis HMR, waits for Loader lifecycle settlement, and reports the authoritative result.
- Inspect the current Cordis Loader entries and lifecycle state.
- Enable or disable one plugin without deleting its npm package.
- Expand official Harness workspace groups, toggle all mutable entries in a group, or manage individual Loader entries by their configured names.
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

Open **Settings -> Plugins -> Plugin list**. The manager replaces Harness's read-only list while keeping runtime status visible and adding category grouping, search, and enable/disable controls. Removing the package later uses:

```sh
dsh plugin --profile web remove dsh-plugin-manager
```

For a local checkout or tarball:

```sh
pnpm install
pnpm run build
pnpm --filter dsh-plugin-manager pack
dsh plugin --profile web add ./packages/manager/dsh-plugin-manager-0.1.0.tgz
```

Git installs run the `prepare` build and require explicit build-script authorization under pnpm 10 and newer. Published npm packages and tarballs already contain `lib/` and do not need install-time build permission.

## Behavior and safety

"Disable" means persisting `disabled: true` and asking Cordis to stop the configured plugin; it does not uninstall the dependency. Runtime hot loading is the manager's defining behavior: ordinary leaf plugins are switched in the running process when their lifecycle permits it. If the desired state is saved but does not settle before the timeout, the UI reports that a profile restart is required instead of treating the saved change as a failure. Installing a new plugin or changing dependencies still requires a profile restart. The manager writes only its own marked patch rows and leaves user-authored rows untouched. If a local entry id is ambiguous, the operation fails instead of changing the wrong plugin.

By default, the manager protects its own entry and Loader ancestors, the root Include and profile HMR services, plus the API gateway, Web server, client runtime, settings shell, client module loader, connection, locale, and Host runner. These entries keep profile changes and the management page alive and cannot safely be disabled from that page. Add deployment-specific ids through the Cordis row config:

```yaml
- id: dsh-plugin-manager
  name: dsh-plugin-manager
  config:
    protectedEntries: [my-auth-provider]
    settleTimeoutMs: 8000
```

The Web API follows the same trusted-host decision as the Harness connection. Anyone allowed to use the trusted Web control plane can invoke plugin enablement, so do not expose the Harness Web server to untrusted networks.

## Categories and entry names

Official and third-party packages share one open functional grouping rule. A package can declare `dsh.pluginManager.group` in `package.json`; packages that declare the same group id appear together regardless of publisher. Without a declaration, `repository.directory` in the form `packages/<group>/<package>` supplies a best-effort fallback for any repository. Missing or invalid metadata falls back to **Ungrouped**. Group ids use lowercase letters, digits, dots, underscores, and hyphens. Marketplace display names, summaries, and categories use this repository's V1 `dsh.plugin` field in `package.json`; there is no separate `dsh-plugin.json`.

```json
{
  "dsh": {
    "pluginManager": {
      "group": "llm"
    }
  }
}
```

Groups are collapsed by default and directly list Loader entries by their configured ids, such as `include`, `timer`, and `tool-web`; imported module specifiers are intentionally hidden. A group toggle changes every mutable entry and skips protected infrastructure. Green means fully enabled, while yellow means the group is partially enabled.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

## Publishing

Pushing a `dsh-plugin-manager@X.Y.Z` tag runs `.github/workflows/publish.yml` for `packages/manager`. The workflow verifies that the tag matches the package version, runs the test, typecheck, and build gates, and publishes through npm Trusted Publishing with GitHub OIDC. It does not use a long-lived `NPM_TOKEN`.

Before using the workflow, configure the npm package's Trusted Publisher with GitHub owner `hrhgit`, repository `deepseek-harness-plugin-manager`, workflow filename `publish.yml`, no environment, and `npm publish` as the allowed action. npm exposes this setting only on an existing package, so the initial `0.1.0` release must first be published with a granular access token that has permission for this package and **Bypass two-factor authentication** enabled. Configure Trusted Publishing immediately afterward and revoke the bootstrap token.

For each later release, update and commit the version, then push the commit and its tag:

```powershell
pnpm --filter dsh-plugin-manager exec npm version patch
git tag "dsh-plugin-manager@<version>"
git push origin main --tags
```

The package has one Host entry, one browser entry, generated Typert Remote artifacts, and one `dsh.bundle` patch. It targets the pre-release `0.1.x` Harness APIs; review release notes before upgrading peer dependencies.

Plugin discovery and npm installation belong to the independent `@ruihuahe/dsh-plugin-marketplace` package in this repository. The manager remains focused on enablement and runtime state for installed plugins.

## Discoverability

Recommended GitHub topics: `dsh-plugin`, `deepseek-harness`, `dsh`, `cordis`, `plugin-manager`, `plugin-management`, `web-ui`, `deepseek`, `typescript`.

Search phrases that accurately describe this project include **DeepSeek Harness plugin manager**, **DSH plugin management Web UI**, **Cordis plugin enable and disable**, and **DeepSeek Harness plugin bundle manager**.

## License

[MIT](LICENSE)
