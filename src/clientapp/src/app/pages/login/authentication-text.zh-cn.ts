export const authenticationText = {
  signingIn: '正在登录，请稍候…',
  passwordsDoNotMatch: '两次输入的新密码不一致。',
};

const messages = new Map([
  ['Already logged in.', '已登录。'],
  ['Not logged in.', '请先登录。'],
  ['Logged in now.', '登录成功。'],
  ['Login failed. Check username/password.', '登录失败，请检查用户名和密码。'],
  ['User logged out.', '已退出登录。'],
  ["New passwords don't match.", authenticationText.passwordsDoNotMatch],
  ['Password changed.', '密码已修改。'],
  ['Current password invalid.', '当前密码不正确。'],
]);

export function authenticationMessage(message: string): string {
  if (!message || message === authenticationText.signingIn) {
    return message;
  }
  return messages.get(message) ?? '认证操作未完成，请重试。';
}
