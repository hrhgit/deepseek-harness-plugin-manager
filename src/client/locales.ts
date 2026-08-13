/** Simplified Chinese copy for the plugin manager. */
export const zh = {
  tab: '插件列表', title: '插件管理', profile: '当前配置', search: '搜索插件或条目', refresh: '刷新插件状态',
  loading: '正在读取插件...', error: '暂时无法读取插件。', retry: '重试', empty: '暂无可显示的插件。', emptySearch: '没有匹配的插件。',
  enabledCount: '已启用', enablePackage: '启用整个包', disablePackage: '停用整个包', enableEntry: '启用插件', disableEntry: '停用插件',
  protected: '受保护', pending: '等待依赖', loadingPhase: '加载中', active: '运行中', failed: '加载失败', unloading: '正在停用', stopped: '已停用',
  operationFailed: '操作未完全完成',
} as const

export type LocaleKey = keyof typeof zh

/** English copy checked against the Chinese source keys. */
export const en: Record<LocaleKey, string> = {
  tab: 'Plugin list', title: 'Plugin manager', profile: 'Active profile', search: 'Search plugins or entries', refresh: 'Refresh plugin state',
  loading: 'Reading plugins...', error: 'Plugins are temporarily unavailable.', retry: 'Retry', empty: 'No plugins are available.', emptySearch: 'No matching plugins.',
  enabledCount: 'enabled', enablePackage: 'Enable package', disablePackage: 'Disable package', enableEntry: 'Enable plugin', disableEntry: 'Disable plugin',
  protected: 'Protected', pending: 'Waiting for dependencies', loadingPhase: 'Loading', active: 'Running', failed: 'Load failed', unloading: 'Disabling', stopped: 'Disabled',
  operationFailed: 'The operation did not fully complete',
}
