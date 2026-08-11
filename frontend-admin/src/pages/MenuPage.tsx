import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  toggleProductAvailability,
  updateCategory,
  updateProduct,
  uploadImage,
} from '../api/endpoints';
import { resolveImageUrl } from '../api/client';
import type { Product } from '../api/types';
import { useTranslation } from '../i18n/LanguageContext';
import ModalShell from '../components/ModalShell';
import ImageCropper from '../components/ImageCropper';

export default function MenuPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: () => listProducts(selectedCategory || undefined),
  });

  const [newCategory, setNewCategory] = useState('');
  const categoryMutation = useMutation({
    mutationFn: () => createCategory(newCategory),
    onSuccess: () => {
      setNewCategory('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: (_, id) => {
      if (selectedCategory === id) setSelectedCategory('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
  });
  const productMutation = useMutation({
    mutationFn: () =>
      createProduct({
        category_id: selectedCategory,
        name: productForm.name,
        description: productForm.description,
        price: Number(productForm.price),
      }),
    onSuccess: () => {
      setProductForm({ name: '', description: '', price: '' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      toggleProductAvailability(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const [editing, setEditing] = useState<Product | null>(null);

  function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (newCategory.trim()) categoryMutation.mutate();
  }

  function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (productForm.name.trim() && selectedCategory) productMutation.mutate();
  }

  function handleRenameCategory(id: string, currentName: string) {
    const name = prompt(t('menu.renameCategory'), currentName);
    if (name && name.trim() && name !== currentName) {
      renameCategoryMutation.mutate({ id, name: name.trim() });
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{t('menu.title')}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('menu.categories')}</h2>
          <ul className="mb-4 space-y-1">
            <li>
              <button
                onClick={() => setSelectedCategory('')}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedCategory === '' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'
                }`}
              >
                {t('menu.allCategories')}
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  onClick={() => setSelectedCategory(c.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${
                    selectedCategory === c.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {c.name}
                </button>
                <button
                  onClick={() => handleRenameCategory(c.id, c.name)}
                  title={t('app.edit')}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('menu.deleteCategoryConfirm'))) deleteCategoryMutation.mutate(c.id);
                  }}
                  title={t('app.delete')}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('menu.newCategory')}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              +
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('menu.newProduct')}</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('menu.productName')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                placeholder={t('menu.productPrice')}
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                value={productForm.description}
                onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('menu.productDescription')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3"
              />
              <button
                type="submit"
                disabled={!selectedCategory}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {t('app.add')}
              </button>
              {!selectedCategory && (
                <p className="text-xs text-amber-600 sm:col-span-4">
                  {t('menu.selectCategoryFirst')}
                </p>
              )}
            </form>
          </div>

          <div className="space-y-2">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProductThumb product={p} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      {p.price.toLocaleString()} {t('app.currency')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={p.is_available}
                      onChange={(e) => toggleMutation.mutate({ id: p.id, value: e.target.checked })}
                    />
                    {p.is_available ? t('menu.available') : t('menu.unavailable')}
                  </label>
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {t('app.edit')}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t('menu.deleteProductConfirm'))) deleteProductMutation.mutate(p.id);
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    {t('app.delete')}
                  </button>
                </div>
              </div>
            ))}
            {products.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                {t('menu.noProducts')}
              </p>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <ProductEditModal
          product={editing}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const src = resolveImageUrl(product.image_url);

  if (!src || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
        🍽️
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={product.name}
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-lg object-cover"
    />
  );
}

function ProductEditModal({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category_id: product.category_id,
    name: product.name,
    description: product.description,
    price: String(product.price),
    image_url: product.image_url,
  });
  const [error, setError] = useState<string | null>(null);

  // Tanlangan fayl kesish oynasiga blob: URL sifatida beriladi; oyna
  // yopilganda URL bo'shatiladi (aks holda xotirada qolib ketadi).
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProduct(product.id, {
        category_id: form.category_id,
        name: form.name,
        description: form.description,
        price: Number(form.price) || 0,
        image_url: form.image_url,
      }),
    onSuccess: onSaved,
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // bir xil faylni qayta tanlash ham ishlashi uchun
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  async function handleCropped(blob: Blob) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadImage(blob);
      setForm((f) => ({ ...f, image_url: url }));
      setCropSrc(null);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('menu.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  if (cropSrc) {
    return (
      <ImageCropper
        imageSrc={cropSrc}
        onCancel={() => setCropSrc(null)}
        onCropped={handleCropped}
      />
    );
  }

  const preview = resolveImageUrl(form.image_url);

  return (
    <ModalShell
      title={t('menu.editProduct')}
      subtitle={product.name}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t('app.cancel')}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || uploading || !form.name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saveMutation.isPending ? t('app.saving') : t('app.save')}
          </button>
        </div>
      }
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {preview ? (
              <img src={preview} alt={form.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">🍽️</div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">{t('menu.image')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFilePicked}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="block rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {uploading
                ? t('menu.uploading')
                : form.image_url
                  ? t('menu.changeImage')
                  : t('menu.chooseImage')}
            </button>
            {form.image_url && (
              <button
                onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                className="block text-xs text-slate-400 hover:text-red-600"
              >
                {t('menu.removeImage')}
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t('menu.productName')}
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t('menu.productPrice')}
            </label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t('menu.categories')}
            </label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t('menu.productDescription')}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
}
