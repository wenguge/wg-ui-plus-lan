export const settingsText = {
  tooltips: {
    networkAddress: '更改 VPN 网段会重新分配所有节点的 IP 地址，需要向各节点下发新配置。',
    localNetworks: '公网访问目标 0.0.0.0/0 包含所有 IPv4 地址。用逗号分隔要保护的本地网段，并为获准访问的分组单独配置目标。',
    strictAllowedIps: '把获准访问的目标地址写入节点配置。分组与目标的关联变化后，需要为受影响的节点下发新配置。',
  },
  smtpSecurityHelp: 'SMTP 加密由 EMAIL_USE_TLS 和 EMAIL_USE_SSL 控制。只有值为 true 的变量才生效，两者只能启用一个。两者均关闭时不加密，启用 EMAIL_USE_TLS 时使用 STARTTLS，启用 EMAIL_USE_SSL 时使用隐式 TLS。',
  smtpEnvironmentLocked: (variables: string) =>
    `加密方式由环境变量 ${variables} 控制。将相关变量设为 false 或取消设置后，可在此修改。`,
  rotateMcpToken: '生成新令牌后，现有 MCP 客户端需要更新令牌才能继续使用。要继续吗？',
  manualMcpCopy: '浏览器阻止了自动复制。令牌已选中，请按 Ctrl+C 或 Cmd+C 复制。',
};

const smtpMessages = new Map([
  ['SMTP email is configured.', 'SMTP 邮件服务已配置。'],
  ['SMTP server is reachable.', 'SMTP 服务器可达。'],
  ['SMTP email is not configured.', 'SMTP 邮件服务尚未配置。'],
  ['SMTP email is not configured. Set EMAIL_HOST, EMAIL_PORT, and EMAIL_DEFAULT_FROM_EMAIL.', 'SMTP 邮件服务尚未配置，请设置 EMAIL_HOST、EMAIL_PORT 和 EMAIL_DEFAULT_FROM_EMAIL。'],
  ['SMTP email is not configured. Set EMAIL_HOST and EMAIL_PORT.', 'SMTP 邮件服务尚未配置，请设置 EMAIL_HOST 和 EMAIL_PORT。'],
  ['EMAIL_PORT must be an integer.', 'EMAIL_PORT 必须为整数。'],
  ['EMAIL_PORT must be between 1 and 65535.', 'EMAIL_PORT 必须在 1 至 65535 之间。'],
  ['EMAIL_HOST_USER and EMAIL_HOST_PASSWORD must be supplied together.', '请同时填写 EMAIL_HOST_USER 和 EMAIL_HOST_PASSWORD。'],
  ['EMAIL_USE_SSL and EMAIL_USE_TLS cannot both be enabled.', 'EMAIL_USE_SSL 和 EMAIL_USE_TLS 只能启用一个。'],
  ['EMAIL_DEFAULT_FROM_EMAIL must be a valid email address.', 'EMAIL_DEFAULT_FROM_EMAIL 必须是有效的邮箱地址。'],
  ['A string value is required.', '请输入文本。'],
  ['A non-empty host name is required.', '请输入主机名。'],
  ['An integer is required.', '请输入整数。'],
  ['A valid email address is required.', '请输入有效的邮箱地址。'],
  ['A boolean value is required.', '请选择开启或关闭。'],
  ['Email authentication failed. Check the SMTP username/app password, then check the server logs for more details.', 'SMTP 认证失败。请检查用户名和应用专用密码，详情见服务端日志。'],
  ['The email server could not be reached. Check the SMTP host/port and network, then check the server logs for more details.', '无法连接邮件服务器。请检查 SMTP 主机、端口和网络，详情见服务端日志。'],
  ['Email security negotiation failed. Check the SMTP TLS/SSL settings and certificate, then check the server logs for more details.', '邮件加密协商失败。请检查 SMTP 加密设置和证书，详情见服务端日志。'],
  ['Email delivery failed. Check the SMTP settings, then check the server logs for more details.', '邮件发送失败。请检查 SMTP 设置，详情见服务端日志。'],
  ['The test email could not be delivered. Check the server logs for more details.', '测试邮件发送失败，详情见服务端日志。'],
  ['The SMTP host name could not be resolved. Check EMAIL_HOST.', '无法解析 SMTP 主机名，请检查 EMAIL_HOST。'],
  ['The SMTP server did not respond. Check the host and port, and that the port is reachable from the container (for Docker, check the port mapping).', 'SMTP 服务器未响应。请检查主机、端口和容器到该端口的连通性。'],
  ['The connection to the SMTP server was refused. Check the host, port, and firewall or Docker port mapping.', 'SMTP 服务器拒绝连接。请检查主机、端口和防火墙或 Docker 端口映射。'],
  ['The SMTP server could not be checked. Check the server logs for more details.', '无法检查 SMTP 服务器，详情见服务端日志。'],
  ['The peer does not have an email address configured.', '节点尚未配置邮箱地址。'],
  ['The peer email address is invalid.', '节点的邮箱地址无效。'],
  ['The peer configuration could not be generated.', '无法生成节点配置。'],
  ['The peer QR image could not be generated.', '无法生成节点二维码。'],
  ['The email could not be delivered. Check the server logs for more details.', '邮件发送失败，详情见服务端日志。'],
  ['Peer was not found.', '找不到该节点。'],
]);

export function smtpMessage(message: unknown): string {
  if (typeof message === 'string') {
    const translated = smtpMessages.get(message);
    if (translated) {
      return translated;
    }
    const reachable = /^SMTP server is reachable at (\S+)\.$/.exec(message);
    if (reachable) {
      return `可连接到 SMTP 服务器 ${reachable[1]}。`;
    }
    const missing = /^Missing SMTP settings: ([A-Z_, ]+)$/.exec(message);
    if (missing) {
      return `缺少 SMTP 设置：${missing[1]}。`;
    }
    const locked = /^([A-Z_]+) is set in the environment and cannot be changed here\.$/.exec(message);
    if (locked) {
      return `环境变量 ${locked[1]} 已设置，请在部署环境中修改。`;
    }
    const booleanValue = /^([A-Z_]+) must be true\/1\/yes\/on or false\/0\/no\/off\.$/.exec(message);
    if (booleanValue) {
      return `${booleanValue[1]} 必须设置为 true、1、yes、on 或 false、0、no、off。`;
    }
  }
  return '邮件服务操作失败，详情见服务端日志。';
}
