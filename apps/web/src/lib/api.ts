/** Shared JSON transport. This is the production path used by every business form. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.name = 'HttpError'; this.status = status; this.code = code;
  }
}

export function jsonRequestInit(init: RequestInit = {}): RequestInit & { headers: Headers } {
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string') {
    throw new TypeError('此调用器仅接受 JSON 字符串；文件上传须使用独立调用器');
  }
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('Content-Type', 'application/json');
  // Order matters: caller options must NOT overwrite the final, merged Headers.
  return { ...init, credentials: 'same-origin', headers };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) {
    throw new TypeError('API 路径必须是同源相对路径');
  }
  const response = await fetch('/api/v1' + path, jsonRequestInit(init));
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const data: unknown = response.status === 204 ? null : isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const error = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    throw new HttpError(response.status, typeof error.code === 'string' ? error.code : 'HTTP_ERROR',
      typeof error.message === 'string' ? error.message : `请求失败 (${response.status})`);
  }
  return data as T;
}

export interface Page<T> { items: T[]; limit?: number; offset?: number; total?: number; hasMore?: boolean }
export const MAX_CHOICES = 10_000;

/** Fetch bounded catalog/selector data through real server pages. Never silently truncate.
 * Operational large tables (sales, reports, inventory) use explicit server pages instead.
 * This is not a cross-request snapshot: concurrent insertions may require refreshing.
 */
export async function readAllPages<T>(path: string, signal?: AbortSignal): Promise<Page<T>> {
  const url = new URL(path, 'http://localhost');
  const items: T[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    url.searchParams.set('limit', '100'); url.searchParams.set('offset', String(offset));
    const page = await api<Page<T>>(url.pathname + url.search, { signal });
    if (!Array.isArray(page.items) || (page.offset !== undefined && page.offset !== offset)) {
      throw new Error('分页响应无效，请刷新页面');
    }
    if (page.total !== undefined && (!Number.isSafeInteger(page.total) || page.total < 0)) {
      throw new Error('分页数量无效，请刷新页面');
    }
    if ((page.total ?? 0) > MAX_CHOICES || items.length + page.items.length > MAX_CHOICES) {
      throw new Error(`选择列表超过 ${MAX_CHOICES} 项上限，请使用筛选或分页接口缩小范围`);
    }
    for (const item of page.items) {
      const row = item as Record<string, unknown>;
      const identity = row.id !== undefined ? `id:${row.id}` :
        row.location_id !== undefined && row.product_id !== undefined ? `stock:${row.location_id}:${row.product_id}` : null;
      if (identity !== null) {
        if (seen.has(identity)) throw new Error('分页过程中数据已变化，请刷新重试');
        seen.add(identity);
      }
      items.push(item);
    }
    const more = page.hasMore ?? (page.items.length === (page.limit ?? 100));
    if (!more) return { items, total: items.length, offset: 0, limit: items.length, hasMore: false };
    if (!page.items.length) throw new Error('分页未前进，请刷新重试');
    offset += page.items.length;
    if (offset >= MAX_CHOICES) throw new Error(`选择列表达到 ${MAX_CHOICES} 项上限，请缩小筛选范围`);
  }
}
