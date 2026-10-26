import type { Session } from './types';
const key = 'foxcore.session.v1';
let current: Session | null = null;
export function session(): Session | null {
  if (current) return current;
  const stored = wx.getStorageSync(key) as Session | undefined;
  if (stored?.user?.id && ['OWNER','SALESPERSON'].includes(stored.user.role) && /^[A-Za-z0-9_-]{43}$/.test(stored.accessToken) && typeof stored.csrf === 'string') current = stored;
  return current;
}
export function saveSession(value: Session): void { wx.setStorageSync(key, value); current = value; }
export function clearSession(): void { current = null; wx.removeStorageSync(key); }
export function requireSession(owner = false): Session | null {
  const value = session();
  if (!value) { wx.reLaunch({ url: '/pages/login/index' }); return null; }
  if (value.user.mustChangePassword) { wx.reLaunch({ url: '/pages/login/index?password=1' }); return null; }
  if (owner && value.user.role !== 'OWNER') { wx.showToast({ title: '此操作需要管理员权限', icon: 'none' }); wx.switchTab({ url: '/pages/home/index' }); return null; }
  return value;
}
