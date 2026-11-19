export const managementText = {
  confirmTitle: '确认操作',
  confirmDelete: (name: string) => `确定删除「${name}」吗？`,
  confirmSendConfiguration: (email: string) => `确定将当前节点配置发送到 ${email} 吗？`,
  emailSent: '邮件已发送。',
  emailConfigured: 'SMTP 邮件服务已配置。',
  emailUnavailable: 'SMTP 邮件服务尚未配置。',
  targetAddress: {
    tooltip: '填写 VPN 允许访问的 IP 地址、带掩码的网段，或带端口的 IP 地址。多个端口用逗号分隔。',
    example: '示例：192.168.1.10、192.168.1.0/24、192.168.1.10:80,443',
  },
};
