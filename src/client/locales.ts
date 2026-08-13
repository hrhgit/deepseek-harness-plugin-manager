/** Simplified Chinese copy for the plugin manager. */
export const zh = {
  tab: '插件列表', title: '插件管理', profile: '当前配置', search: '搜索插件或条目', refresh: '刷新插件状态',
  loading: '正在读取插件...', error: '暂时无法读取插件。', retry: '重试', empty: '暂无可显示的插件。', emptySearch: '没有匹配的插件。',
  enabledCount: '已启用', enablePackage: '启用整个包', disablePackage: '停用整个包', enableEntry: '启用插件', disableEntry: '停用插件',
  enableCategory: '启用组内可修改插件', disableCategory: '停用组内可修改插件',
  protected: '受保护', pending: '等待依赖', loadingPhase: '加载中', active: '运行中', failed: '加载失败', unloading: '正在停用', stopped: '已停用',
  operationFailed: '操作未完全完成',
  restartRequired: '状态已保存，重启当前配置后生效', runtimeSwitch: '尝试即时切换',
  categoryCordis: 'Cordis 基础设施', categoryCore: '产品 API 主干', categoryBundle: '配置组合层', categoryBoot: '启动',
  categorySession: '会话与持久化', categoryInteraction: '人机交互', categoryExtensions: '扩展与自修改', categoryLlm: '模型',
  categoryApi: '远程接口', categoryClient: '浏览器客户端', categoryHost: '宿主服务', categorySettings: '设置', categoryTools: '工具与命令',
  categoryHarnessOther: '其他 Harness 插件', categoryCommunity: '社区与本地', categoryUngrouped: '未分组', entriesCount: '个插件',
} as const

export type LocaleKey = keyof typeof zh

/** English copy checked against the Chinese source keys. */
export const en: Record<LocaleKey, string> = {
  tab: 'Plugin list', title: 'Plugin manager', profile: 'Active profile', search: 'Search plugins or entries', refresh: 'Refresh plugin state',
  loading: 'Reading plugins...', error: 'Plugins are temporarily unavailable.', retry: 'Retry', empty: 'No plugins are available.', emptySearch: 'No matching plugins.',
  enabledCount: 'enabled', enablePackage: 'Enable package', disablePackage: 'Disable package', enableEntry: 'Enable plugin', disableEntry: 'Disable plugin',
  enableCategory: 'Enable mutable plugins in category', disableCategory: 'Disable mutable plugins in category',
  protected: 'Protected', pending: 'Waiting for dependencies', loadingPhase: 'Loading', active: 'Running', failed: 'Load failed', unloading: 'Disabling', stopped: 'Disabled',
  operationFailed: 'The operation did not fully complete',
  restartRequired: 'Saved; restart the active profile to apply', runtimeSwitch: 'Runtime switch attempted',
  categoryCordis: 'Cordis infrastructure', categoryCore: 'Product API spine', categoryBundle: 'Configuration bundles', categoryBoot: 'Boot',
  categorySession: 'Sessions and persistence', categoryInteraction: 'Human interaction', categoryExtensions: 'Extensions and self-modification', categoryLlm: 'Models',
  categoryApi: 'Remote API', categoryClient: 'Browser client', categoryHost: 'Host services', categorySettings: 'Settings', categoryTools: 'Tools and commands',
  categoryHarnessOther: 'Other Harness plugins', categoryCommunity: 'Community and local', categoryUngrouped: 'Ungrouped', entriesCount: 'plugins',
}
