# DSH 插件市场

[English](README.md)

这是一个独立的 DeepSeek Harness 市场插件：读取自动生成的统一插件目录，并通过官方 `dsh plugin` 命令边界安装精确的 npm 版本。

`.github/workflows/catalog.yml` 每六小时及手动触发时搜索 GitHub `dsh-plugin` 话题。它从每个仓库的文件树中发现 `package.json`，不依赖市场自定义清单。定时任务以已提交的扫描检查点和最新目录为依据：未变化的仓库直接保留，不重新读取清单或 npm 元数据；检查点之后更新的仓库才重新校验。手动触发可选择完整复核，用于主动重查全部仓库。采集器生成唯一的 `catalog/v2/catalog.json`，仅在条目或覆盖范围变化时改写；独立检查点会在每次成功扫描后推进。采集失败时上一份有效目录和检查点保持不变。

统一目录有两种安装状态：“可安装”表示 npm 包、精确版本和仓库归属均可信；“无可安装包”保留具体事实原因且不能安装。每个条目还会单独显示已发布软件包是否声明官方 `dsh.bundle` 元数据，但不会把它作为市场准入要求。目录与界面都先按可安装性排序，再按条目 ID 排序。目前没有人工正式收录层，也不制定市场自有的插件元数据规范。

市场不依赖 `dsh-plugin-manager`。安装会改变 profile 的组合包列表，因此成功后统一提示重启。

运行时目录通过 GitHub Contents API 的 raw media type 读取，避免部分 Node 网络环境无法访问 `raw.githubusercontent.com`。搜索框只过滤已经下载的目录，不再从用户机器逐仓库调用 GitHub 和 npm。远程目录不可用时显示上一份本地缓存；首次运行且没有缓存时返回带警告的空目录，页面仍然可用。

## 本地安装

```sh
pnpm --filter @ruihuahe/dsh-plugin-marketplace run build
pnpm --filter @ruihuahe/dsh-plugin-marketplace pack
dsh plugin --profile web add ./packages/marketplace/hrhgit-dsh-plugin-marketplace-0.1.0.tgz
```

浏览器持久化两项普通偏好：搜索条件使用 `dsh-plugin-marketplace.marketplace.global.query.v1`，可安装性筛选使用 `dsh-plugin-marketplace.marketplace.global.status_filter.v3`。旧的状态筛选不会迁移，因为枚举语义已经变化。当前选择、安装确认、进度和反馈属于临时状态，不会恢复。

## 许可证

[MIT](LICENSE)
