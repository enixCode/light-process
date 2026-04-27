export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lp-token') || '' : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const base = process.env.NEXT_PUBLIC_API_BASE || '';
  const res = await fetch(base + path, { ...opts, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data as { error?: string }).error) || res.statusText);
  return data as T;
}
