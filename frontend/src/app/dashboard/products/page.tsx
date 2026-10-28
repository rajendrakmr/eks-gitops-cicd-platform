'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import {
  useCreateProductMutation,
  useDeleteProductMutation,
  useGetProductsQuery,
  useUpdateProductMutation,
  type Product,
} from '@/store/api';
import { errMessage, formatMoney } from '@/lib/format';

const EMPTY = { name: '', description: '', price: '', category: '', image: '', stock: '' };

function ProductAdmin() {
  const { data, isLoading } = useGetProductsQuery({ limit: 100, sort: 'newest' });
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();
  const [deleteProduct] = useDeleteProductMutation();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({ name: p.name, description: p.description, price: String(p.price), category: p.category, image: p.image, stock: String(p.stock) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      category: form.category.trim(),
      image: form.image.trim(),
      stock: Number.parseInt(form.stock, 10),
    };
    if (Number.isNaN(body.price) || Number.isNaN(body.stock)) {
      setError('Price and stock must be numbers');
      return;
    }
    try {
      if (editingId) await updateProduct({ id: editingId, ...body }).unwrap();
      else await createProduct(body).unwrap();
      setNotice(editingId ? 'Product updated' : 'Product created');
      reset();
    } catch (err) {
      setError(errMessage(err));
    }
  };

  const onDelete = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(p.id).unwrap();
      if (editingId === p.id) reset();
    } catch (err) {
      setError(errMessage(err));
    }
  };

  return (
    <div className="container page">
      <Link href="/dashboard" className="muted small">
        ← Dashboard
      </Link>
      <h1 style={{ fontSize: '2.2rem', marginTop: '0.5rem' }}>Manage products</h1>

      <form className="card card-pad" onSubmit={onSubmit} style={{ margin: '1.25rem 0' }}>
        <h3>{editingId ? 'Edit product' : 'Add a product'}</h3>
        {error && <div className="alert alert-err">{error}</div>}
        {notice && <div className="alert alert-ok">{notice}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input id="p-name" required value={form.name} onChange={set('name')} />
          </div>
          <div className="field">
            <label htmlFor="p-category">Category</label>
            <input id="p-category" required value={form.category} onChange={set('category')} placeholder="Electronics" />
          </div>
          <div className="field">
            <label htmlFor="p-price">Price</label>
            <input id="p-price" type="number" min="0" step="0.01" required value={form.price} onChange={set('price')} />
          </div>
          <div className="field">
            <label htmlFor="p-stock">Stock</label>
            <input id="p-stock" type="number" min="0" step="1" required value={form.stock} onChange={set('stock')} />
          </div>
          <div className="field full">
            <label htmlFor="p-image">Image URL</label>
            <input id="p-image" type="url" value={form.image} onChange={set('image')} placeholder="https://…" />
          </div>
          <div className="field full">
            <label htmlFor="p-desc">Description</label>
            <textarea id="p-desc" rows={3} value={form.description} onChange={set('description')} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn" disabled={creating || updating}>
            {editingId ? 'Save changes' : 'Create product'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="muted">Loading…</td>
                </tr>
              ) : (
                data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.category}</td>
                    <td>{formatMoney(p.price)}</td>
                    <td className={p.stock < 10 ? 'text-err' : ''}>{p.stock}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>
                        Edit
                      </button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(p)}>
                        Delete
                      </button>
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

export default function AdminProductsPage() {
  return (
    <AuthGuard role="admin">
      <ProductAdmin />
    </AuthGuard>
  );
}
