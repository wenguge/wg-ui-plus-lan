export const shellText = {
  serverConnectionLost: '与服务器的连接已断开。',
  applyNotice: '应用更改将重新生成服务器配置文件并重启 WireGuard。',
  applyChanges: '应用更改',
  applyFailure: '应用更改失败。',
  undoChanges: '撤销更改',
  undoConfirmation: '将所有待应用的配置更改恢复到上一次成功应用的状态。撤销后将刷新页面。',
  undoFailure: '撤销更改失败。',
  configurationConflict: '服务端的待应用状态已变化。请查看更新后的状态，再决定是否重试。',
  wireguardRestarted: '已重启服务器上的 WireGuard。',
};

export const trafficResetText = {
  totalButton: '重置累计总流量',
  peerButton: '重置此节点累计流量',
  peerLabel: (name: string) => `重置「${name}」的累计流量`,
  totalConfirmation: '将顶部累计上传和下载归零，各节点继续按各自的计数统计。',
  peerConfirmation: (name: string) => `将「${name}」的累计上传和下载归零，顶部总量继续按原计数统计。`,
  totalSuccess: '已重置顶部累计总流量。',
  peerSuccess: (name: string) => `已重置「${name}」的累计流量。`,
  error: '重置累计流量失败。',
};

export const peerExportText = {
  preview: '实际下发配置',
  endpoint: 'VPN 连接端点',
  address: '节点隧道地址',
  routes: '走 VPN 的目标',
  dns: '客户端 DNS',
  autoDns: '自动',
  deviceDns: '沿用设备 DNS',
  vpnDns: '使用 VPN DNS',
  dnsHint: '自动模式下，内网分流沿用设备 DNS，全隧道使用 VPN DNS。',
  serverRoute: '下发 VPN 服务端的隧道路由',
  serverRouteHint: '用于直接访问服务端的隧道地址。全隧道路由已覆盖该地址。',
  allIPv4: '全部 IPv4 请求',
  allIPv6: '全部 IPv6 请求',
  noRoutes: '无',
  saveToPreview: '请先保存节点设置，再预览或导出。',
};

export const httpErrorText = [
  { from: 0, to: 0, message: '与服务器通信时发生错误。' },
  { from: 401, to: 401, message: '身份验证失败，请重新登录。' },
  { from: 403, to: 403, message: '你没有权限执行此操作。' },
  { from: 404, to: 404, message: '找不到请求的资源。' },
  { from: 407, to: 407, message: '代理服务器需要身份验证。' },
  { from: 408, to: 408, message: '请求超时。' },
  { from: 500, to: 500, message: '服务器内部错误。' },
  { from: 501, to: 501, message: '服务器尚未实现此功能。' },
  { from: 502, to: 502, message: '网关错误，请检查反向代理是否能连接上游服务。' },
  { from: 503, to: 599, message: '服务器请求失败，请查看服务端日志。' },
];

const fieldErrorText: Record<string, string | undefined> = {
  required: '请填写此字段。',
  blank: '此字段不能为空。',
  null: '此字段不能为 null。',
  does_not_exist: '所选对象不存在。',
  incorrect_type: '输入的数据类型不正确。',
  unique: '此值已存在。',
};

export function formatValidationError(code: string, detail: string): string {
  const localized = fieldErrorText[code];
  if (localized) {
    return localized;
  }

  return detail
    .replace(' is not a valid network address. Example ', ' 不是有效的网络地址，例如 ')
    .replace(' is not a valid IP address or network address. Example ', ' 不是有效的 IP 地址或网络地址，例如 ')
    .replace(' is not a valid IP address. Example ', ' 不是有效的 IP 地址，例如 ')
    .replace(' is not a valid IP address. Error: ', ' 不是有效的 IP 地址。错误详情：')
    .replace(/\bOr (?=\d)/g, '或 ')
    .replace(/\bInvalid mask /g, '无效的掩码 ')
    .replace(/\bInvalid port: /g, '无效的端口：')
    .replace(' invalid for a host.', ' 不是有效的主机地址。')
    .replace(/^Invalid value: /, '无效的值：')
    .replace(/^Enter a valid email address\.$/, '请输入有效的电子邮件地址。')
    .replace(/^A valid integer is required\.$/, '请输入有效的整数。')
    .replace(/^Ensure this value is greater than or equal to (.+)\.$/, '此值必须大于或等于 $1。')
    .replace(/^Ensure this value is less than or equal to (.+)\.$/, '此值必须小于或等于 $1。')
    .replace(/^Ensure this field has no more than (\d+) characters\.$/, '此字段不能超过 $1 个字符。')
    .replace(/^Ensure this field has at least (\d+) characters\.$/, '此字段至少需要 $1 个字符。');
}
