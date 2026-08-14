# DSH plugin discovery manifest V1

DSH plugin discovery metadata lives in `package.json`; there is no separate manifest file.

A single-package repository declares `dsh.plugin` at its root. A multi-package repository declares `dsh.catalog` at the root and lists each plugin package directory explicitly:

```json
{
  "private": true,
  "dsh": {
    "catalog": {
      "schemaVersion": 1,
      "packages": ["packages/manager", "packages/marketplace"]
    }
  }
}
```

Each listed package must provide normal npm metadata, `dsh.plugin`, and the official installable bundle contract `dsh.bundle`:

```json
{
  "name": "dsh-example-plugin",
  "version": "1.0.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/example/dsh-plugins.git",
    "directory": "packages/example"
  },
  "dsh": {
    "plugin": {
      "schemaVersion": 1,
      "displayName": { "zh-CN": "示例插件", "en": "Example Plugin" },
      "summary": { "zh-CN": "示例摘要。", "en": "Example summary." },
      "category": "example"
    },
    "bundle": { "patch": "./cordis.patch.yml" }
  }
}
```

Repository paths use forward slashes and cannot be absolute, contain `..`, or repeat.

The generated catalog scans GitHub's `dsh-plugin` topic and records every inspected package in one document:

- `verified`: the V1 manifest is valid, the exact npm version exists, npm declares `dsh.bundle`, and npm points back to the same GitHub repository;
- `unverified`: the V1 manifest is missing or invalid, but the repository still declares an exact npm package/version and npm points back to the same repository;
- `rejected`: installation admission failed, with an explicit issue code and message.

Only `verified` and `unverified` entries are installable. The catalog currently has no manual curation or formal-admission layer.
