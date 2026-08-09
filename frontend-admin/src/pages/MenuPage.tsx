import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCategory,
  createProduct,
  listCategories,
  listProducts,
  toggleProductAvailability,
} from '../api/endpoints';

export default function MenuPage() {
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

  const [productForm, setProductForm] = useState({ name: '', description: '', price: '' });
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

  function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (newCategory.trim()) categoryMutation.mutate();
  }

  function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (productForm.name.trim() && selectedCategory) productMutation.mutate();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Menyu</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Kategoriyalar</h2>
          <ul className="mb-4 space-y-1">
            <li>
              <button
                onClick={() => setSelectedCategory('')}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedCategory === '' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'
                }`}
              >
                Hammasi
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedCategory(c.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedCategory === c.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Yangi kategoriya"
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
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Yangi mahsulot qo'shish</h2>
            <form onSubmit={handleAddProduct} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nomi"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="Narxi"
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!selectedCategory}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Qo'shish
              </button>
              {!selectedCategory && (
                <p className="text-xs text-amber-600 sm:col-span-4">
                  Mahsulot qo'shish uchun avval chapdan kategoriya tanlang
                </p>
              )}
            </form>
          </div>

          <div className="space-y-2">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.price.toLocaleString()} so'm</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={p.is_available}
                    onChange={(e) =>
                      toggleMutation.mutate({ id: p.id, value: e.target.checked })
                    }
                  />
                  {p.is_available ? 'Mavjud' : "Tugagan"}
                </label>
              </div>
            ))}
            {products.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                Mahsulot topilmadi
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
