export const zh = {
  localeId: 'zh-CN',
  tab: '插件市场', title: '插件市场', profile: '安装到', search: '搜索正式目录或社区候选', searchGithub: '搜索社区候选',
  filterAll: '全部', filterInstallable: '可安装', filterCandidates: '待适配',
  refresh: '刷新目录', loading: '正在读取插件目录...', retry: '重试', empty: '暂无可安装的插件。', emptySearch: '没有匹配的插件。',
  catalogSource: '正式目录', githubSource: 'GitHub 候选', stale: '当前显示缓存目录', warningTitle: '部分来源不可用',
  version: '版本', license: '许可证', category: '分类', repository: '代码仓库', manifest: '发现清单', installed: '已安装',
  install: '安装', installing: '正在安装', confirmTitle: '确认安装插件', confirmInstall: '确认安装', cancel: '取消',
  notInstallable: '暂不可安装', candidateStatus: '待适配', admissionReason: '未通过安装准入', unknown: '未声明', status: '状态',
  issueRepositoryUnavailable: '仓库暂时无法读取', issueManifestUnavailable: '未找到插件清单', issueManifestInvalid: '清单不符合 V1 规范',
  issuePackageUnpublished: 'npm 版本尚未发布', issuePackageInvalid: 'npm 元数据不符合要求', issueRepositoryMismatch: 'npm 与 GitHub 仓库不一致',
  installWarning: '插件代码将在 DSH 宿主权限下运行。请先确认代码仓库、版本和许可证。',
  restartRequired: '安装完成。重启当前配置后加载插件。', alreadyInstalled: '当前配置已经安装此插件。',
  selectPlugin: '选择一个插件查看详情。', communitySearchFailed: '社区候选搜索失败。', loadFailed: '暂时无法读取插件目录。',
} as const

export type LocaleKey = keyof typeof zh

export const en: Record<LocaleKey, string> = {
  localeId: 'en',
  tab: 'Marketplace', title: 'Plugin marketplace', profile: 'Install to', search: 'Search catalog or community candidates', searchGithub: 'Search community candidates',
  filterAll: 'All', filterInstallable: 'Installable', filterCandidates: 'Needs adaptation',
  refresh: 'Refresh catalog', loading: 'Loading plugin catalog...', retry: 'Retry', empty: 'No installable plugins are available.', emptySearch: 'No plugins match your search.',
  catalogSource: 'Curated catalog', githubSource: 'GitHub candidate', stale: 'Showing a cached catalog', warningTitle: 'Some sources are unavailable',
  version: 'Version', license: 'License', category: 'Category', repository: 'Repository', manifest: 'Discovery manifest', installed: 'Installed',
  install: 'Install', installing: 'Installing', confirmTitle: 'Confirm plugin install', confirmInstall: 'Install plugin', cancel: 'Cancel',
  notInstallable: 'Not installable', candidateStatus: 'Needs adaptation', admissionReason: 'Installation admission failed', unknown: 'Not declared', status: 'Status',
  issueRepositoryUnavailable: 'Repository is unavailable', issueManifestUnavailable: 'Plugin manifest was not found', issueManifestInvalid: 'Manifest does not conform to V1',
  issuePackageUnpublished: 'npm version is not published', issuePackageInvalid: 'npm metadata is invalid', issueRepositoryMismatch: 'npm and GitHub repositories do not match',
  installWarning: 'Plugin code runs with the DSH host permissions. Review its repository, version, and license first.',
  restartRequired: 'Installed. Restart the active profile to load the plugin.', alreadyInstalled: 'This plugin is already installed in the active profile.',
  selectPlugin: 'Select a plugin to inspect it.', communitySearchFailed: 'Community candidate search failed.', loadFailed: 'The plugin catalog is temporarily unavailable.',
}
