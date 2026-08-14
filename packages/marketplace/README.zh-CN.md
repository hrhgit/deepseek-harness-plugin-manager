# DSH 插件市场

[English](README.md)

这是一个独立的 DeepSeek Harness 市场插件：读取自动生成的统一插件目录，并通过官方 `dsh plugin` 命令边界安装精确的 npm 版本。

`.github/workflows/catalog.yml` 每六小时及手动触发时扫描 GitHub `dsh-plugin` 话题。采集器读取仓库清单并校验 npm 精确版本和仓库归属，生成唯一的 `catalog/v1/catalog.json`。内容没有变化时不会改写文件或产生提交；采集失败时工作流失败，上一份有效目录保持不变。

统一目录使用三种状态：合法 V1 清单和 npm 组合包信息完整的是“已验证”；没有合法 V1 清单，但 npm 包、精确版本和仓库归属可信的是“未验证”，仍可安装并明确提示 DSH 兼容性未验证；未发布 npm、版本不存在、仓库不一致或包名冲突的是“已拒绝”，只展示原因，不允许安装。目前没有人工正式收录层。

市场不依赖 `dsh-plugin-manager`。安装会改变 profile 的组合包列表，因此成功后统一提示重启。

运行时目录通过 GitHub Contents API 的 raw media type 读取，避免部分 Node 网络环境无法访问 `raw.githubusercontent.com`。搜索框只过滤已经下载的目录，不再从用户机器逐仓库调用 GitHub 和 npm。远程目录不可用时显示上一份本地缓存；首次运行且没有缓存时返回带警告的空目录，页面仍然可用。

## 本地安装

```sh
pnpm --filter dsh-plugin-marketplace run build
pnpm --filter dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/dsh-plugin-marketplace-0.1.0.tgz
```

浏览器持久化两项普通偏好：搜索条件使用 `dsh-plugin-marketplace.marketplace.global.query.v1`，状态筛选使用 `dsh-plugin-marketplace.marketplace.global.status_filter.v2`。旧的 V1 状态筛选不会迁移，因为枚举语义已经变化。当前选择、安装确认、进度和反馈属于临时状态，不会恢复。

## 许可证

[MIT](LICENSE)
