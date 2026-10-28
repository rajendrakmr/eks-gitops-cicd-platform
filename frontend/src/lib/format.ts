const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'USD';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY });

export const formatMoney = (n: number) => money.format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// Turns any RTK Query / FastAPI / Express error into a readable sentence.
export function errMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong';
  const e = err as {
    status?: unknown;
    error?: string;
    message?: string;
    data?: { error?: string; detail?: unknown; details?: Record<string, string> };
  };
  if (e.data?.details) return Object.values(e.data.details).join('. ');
  if (e.data?.error) return e.data.error;
  if (typeof e.data?.detail === 'string') return e.data.detail;
  if (Array.isArray(e.data?.detail)) {
    return e.data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('. ') || 'Invalid request';
  }
  if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Is the API running?';
  return e.error || e.message || 'Something went wrong';
}
