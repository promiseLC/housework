export const USERNAME_PATTERN = /^[A-Za-z0-9_\u4e00-\u9fff]{2,32}$/

export function validateUsername(username: string) {
  const value = username.trim()
  if (!USERNAME_PATTERN.test(value)) return '账号须为 2–32 位字母、数字、下划线或中文，不能有空格'
  return null
}

export function validatePassword(password: string) {
  if (password.length < 8 || password.length > 72) return '密码须为 8–72 位'
  return null
}

export function validateDisplayName(name: string) {
  const value = name.trim()
  if (value.length < 1 || value.length > 20) return '显示名须为 1–20 个字'
  return null
}
