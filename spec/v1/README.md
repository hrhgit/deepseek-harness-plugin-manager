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

Repository paths use forward slashes and cannot be absolute, contain `..`, or repeat. Marketplace admission additionally verifies that the exact npm version exists, declares `dsh.bundle`, and points back to the same GitHub repository.
