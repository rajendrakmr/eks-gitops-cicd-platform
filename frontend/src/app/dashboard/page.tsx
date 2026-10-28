'use client';

import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import {
  ORDER_STATUSES,
  useGetOrdersQuery,
  useGetStatsQuery,
  useUpdateOrderStatusMutation,
} from '@/store/api';
import { useAppSelector } from '@/store/hooks';
import { errMessage, formatDate, formatMoney } from '@/lib/format';

function DashboardContent() {
  const user = useAppSelector((s) => s.auth.user)!;
  const isAdmin = user.role === 'admin';
  const { data: stats, isLoading: statsLoading, error: statsError } = useGetStatsQuery();
  const { data: orders, isLoading: ordersLoading } = useGetOrdersQuery({ all: isAdmin });
  const [updateStatus, { error: updateError }] = useUpdateOrderStatusMutation();

  const maxRevenue = Math.max(1, ...(stats?.daily.map((d) => d.revenue) ?? [1]));

  return (
    <div className="container page">
      <div className="row-between page-head">
        <div>
          <h1 style={{ fontSize: '2.2rem' }}>{isAdmin ? 'Admin dashboard' : 'My dashboard'}</h1>
          <p className="muted">
            Signed in as {user.email} <span className="status">{user.role}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {isAdmin && (
            <Link href="/dashboard/products" className="btn">
              Manage products
            </Link>
          )}
          <Link href="/products" className="btn btn-ghost">
            Continue shopping
          </Link>
        </div>
      </div>

      {statsError ? <div className="alert alert-err">{errMessage(statsError)}</div> : null}

      <div className="grid grid-stats">
        <div className="card stat">
          <div className="label">{isAdmin ? 'Total orders' : 'My orders'}</div>
          <div className="value">{statsLoading ? '…' : stats?.orders ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="label">{isAdmin ? 'Revenue' : 'Total spent'}</div>
          <div className="value">{statsLoading ? '…' : formatMoney(stats?.revenue ?? 0)}</div>
        </div>
        <div className="card stat">
          <div className="label">In progress</div>
          <div className="value">{statsLoading ? '…' : (stats?.byStatus.pending ?? 0) + (stats?.byStatus.paid ?? 0) + (stats?.byStatus.shipped ?? 0)}</div>
        </div>
        <div className="card stat">
          <div className="label">Delivered</div>
          <div className="value">{statsLoading ? '…' : stats?.byStatus.delivered ?? 0}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: '1.25rem' }}>
        <h3>Last 7 days</h3>
        <p className="muted small">{isAdmin ? 'Revenue across all customers' : 'Your spending'} per day</p>
        <div className="bars">
          {stats?.daily.map((d) => (
            <div className="bar-col" key={d.date} title={`${d.date}: ${d.orders} orders, ${formatMoney(d.revenue)}`}>
              <span className="small">{d.revenue > 0 ? formatMoney(d.revenue) : ''}</span>
              <div className="bar" style={{ height: `${Math.max(2, (d.revenue / maxRevenue) * 100)}%` }} />
              <span className="bar-label">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3>{isAdmin ? 'All orders' : 'Recent orders'}</h3>
          {updateError ? <div className="alert alert-err">{errMessage(updateError)}</div> : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                <tr>
                  <td colSpan={5} className="muted">Loading…</td>
                </tr>
              ) : !orders || orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No orders yet. <Link href="/products" style={{ color: 'var(--accent)' }}>Start shopping</Link>
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id.slice(0, 8)}</td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td>{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td>{formatMoney(o.total)}</td>
                    <td>
                      {isAdmin ? (
                        <select value={o.status} onChange={(e) => updateStatus({ id: o.id, status: e.target.value })} aria-label="Order status">
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`status status-${o.status}`}>{o.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
