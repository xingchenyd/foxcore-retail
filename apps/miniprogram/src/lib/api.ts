import { apiBaseUrl } from '../config';
import { clearSession, session } from './session';
import type { PageResult } from './types';

export class RequestError extends Error {
  constructor(message: string, readonly code: string, readonly uncertain = false, readonly status = 0) { super(message); }
}
export function request<T>(path: string, method: 'GET'|'POST' = 'GET', data?: object, idempotencyKey?: string): Promise<T> {
  if (!apiBaseUrl) return Promise.reject(new RequestError('服务尚未配置，请联系管理员', 'NOT_CONFIGURED'));
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) return Promise.reject(new Error('请求路径无效'));
  const auth = session();
  const header: Record<string,string> = { 'content-type': 'application/json' };
  if (auth && path !== '/auth/mini/login') {
    header.Authorization = 'Bearer ' + auth.accessToken;
    if (method !== 'GET') header['x-csrf-token'] = auth.csrf;
  }
  if (idempotencyKey) header['idempotency-key'] = idempotencyKey;
  return new Promise((resolve, reject) => wx.request({
    url: apiBaseUrl + '/api/v1' + path, method, data, header, timeout: 15000,
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) { resolve(response.data as T); return; }
      const body = response.data as { message?: string; code?: string; requestId?: string };
      const code = body?.code || 'HTTP_ERROR';
      if (response.statusCode === 401 && path !== '/auth/mini/login') { clearSession(); wx.reLaunch({ url: '/pages/login/index' }); }
      const uncertain = method !== 'GET' && response.statusCode >= 500;
      reject(new RequestError((body?.message || '请求失败，请重试') + (body?.requestId ? '（编号 ' + body.requestId + '）' : '') + (uncertain ? '。结果待核对，请勿重复创建单据' : ''), code, uncertain, response.statusCode));
    },
    fail() { reject(new RequestError(method === 'GET' ? '网络连接失败，请检查网络后重试' : '连接中断，操作结果待核对。请使用原操作重试，不要重复创建单据', 'NETWORK_ERROR', method !== 'GET')); }
  }));
}

interface Pending { key: string; payload: string; owner: string; path: string; method: 'POST' }
const inFlight = new Set<string>();
export interface PendingSummary { storageKey: string; title: string; path: string }
export function pendingCommands(): PendingSummary[] {
  const owner = session()?.user.id; if (!owner) return [];
  return wx.getStorageInfoSync().keys.filter(key => key.startsWith('foxcore.command.' + owner + '.')).map(storageKey => {
    const p = wx.getStorageSync(storageKey) as Pending;
    const title = p.path.startsWith('/stock/') ? '库存登记' : p.path.startsWith('/shifts/') ? '班次操作' : p.path.startsWith('/returns') ? '退货办理' : p.path.startsWith('/commissions') ? '佣金结算' : '销售办理';
    return { storageKey, title, path: p.path };
  });
}
export function retryPending<T>(storageKey: string): Promise<T> {
  const p = wx.getStorageSync(storageKey) as Pending | undefined;
  if (!p || p.owner !== session()?.user.id || p.method !== 'POST') return Promise.reject(new Error('待核对操作不存在或属于其他账户'));
  return command<T>(p.path, JSON.parse(p.payload) as object, p.method);
}
function randomKey(): Promise<string> {
  return new Promise((resolve, reject) => wx.getRandomValues({ length: 16,
    success(result) {
      const bytes = new Uint8Array(result.randomValues); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      resolve(hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20));
    }, fail() { reject(new Error('无法生成操作编号，请升级微信后重试')); }
  }));
}
/** Persist BEFORE sending. A lost response/restart retains the same command key and body. */
export async function command<T>(path: string, data: object = {}, method: 'POST' = 'POST'): Promise<T> {
  const owner = session()?.user.id; if (!owner) throw new Error('请先登录');
  const storageKey = 'foxcore.command.' + owner + '.' + method + '.' + path;
  if (inFlight.has(storageKey)) throw new RequestError('此操作正在提交，请稍候', 'COMMAND_BUSY');
  inFlight.add(storageKey);
  try {
  const payload = JSON.stringify(data);
  let pending = wx.getStorageSync(storageKey) as Pending | undefined;
  if (pending && (pending.payload !== payload || pending.owner !== owner || pending.path !== path || pending.method !== method)) {
    throw new RequestError('此操作有待核对请求。请恢复上次输入后重试，或联系管理员核对', 'PENDING_COMMAND', true);
  }
  if (!pending) { pending = { key: await randomKey(), payload, owner, path, method }; wx.setStorageSync(storageKey, pending); }
  if (session()?.user.id !== owner) throw new RequestError('账号已切换，请使用原账户核对上次操作', 'ACCOUNT_CHANGED', true);
  try { const result = await request<T>(path, method, data, pending.key); wx.removeStorageSync(storageKey); return result; }
  catch (error) { if (error instanceof RequestError && !error.uncertain && error.status !== 401 && error.status !== 403) wx.removeStorageSync(storageKey); throw error; }
  } finally { inFlight.delete(storageKey); }
}
export async function choices<T>(path: string): Promise<T[]> {
  const result: T[] = []; let offset = 0;
  for (;;) {
    const page = await request<PageResult<T>>(path + (path.includes('?') ? '&' : '?') + 'limit=100&offset=' + offset);
    if (page.offset !== offset || !Array.isArray(page.items) || (page.hasMore && page.items.length === 0)) throw new Error('列表已变化，请刷新重试');
    result.push(...page.items); if (result.length > 10000 || (page.total || 0) > 10000) throw new Error('选择项过多，请在管理网页缩小范围');
    if (!page.hasMore) return result;
    offset += page.items.length;
  }
}
export function confirm(title: string, content: string): Promise<boolean> {
  return new Promise(resolve => wx.showModal({ title, content, confirmColor: '#214E42', success: result => resolve(result.confirm), fail: () => resolve(false) }));
}
