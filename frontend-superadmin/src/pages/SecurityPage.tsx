import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listBusinesses, listPlatformUsers, updateMe, updateStaffCredentials } from '../api/endpoints';
import { ROLE_LABELS } from '../api/types';
import { useAuth } from '../auth/AuthContext';

/**
 * Sozlamalar → Xavfsizlik.
 *
 * Ikkita mustaqil forma: super-adminning o'z hisobi (joriy parol talab
 * qilinadi) va tanlangan kafening bitta xodimi (superadmin reset qiladi,
 * xodimning joriy parolini bilishi shart emas — real hayotda ham shunday:
 * administrator boshqa birovning parolini "bilmaydi", faqat yangisini
 * belgilaydi).
 */
export default function SecurityPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Xavfsizlik</h1>
        <p className="text-sm text-slate-500">Login va parollarni boshqarish</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SuperadminAccountCard />
        <StaffAccountCard />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-16 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          className="absolute inset-y-0 right-2 text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          {visible ? 'Yashirish' : "Ko'rsatish"}
        </button>
      </div>
    </label>
  );
}

function Message({ text, isError }: { text: string; isError: boolean }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {text}
    </p>
  );
}

function SuperadminAccountCard() {
  const { auth, setAuth } = useAuth();
  const [newLogin, setNewLogin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateMe({
        current_password: currentPassword,
        new_login: newLogin.trim() || undefined,
        new_password: newPassword || undefined,
        new_password_confirm: newPasswordConfirm || undefined,
      }),
    onSuccess: (data) => {
      if (auth) setAuth({ ...auth, login: data.login });
      setMessage({ text: data.message, isError: false });
      setNewLogin('');
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    },
    onError: (err: any) => {
      setMessage({ text: err?.response?.data?.error ?? 'Xatolik yuz berdi', isError: true });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!currentPassword) {
      setMessage({ text: 'Joriy parolni kiriting', isError: true });
      return;
    }
    if (!newLogin.trim() && !newPassword) {
      setMessage({ text: "Yangi login yoki parol kiriting", isError: true });
      return;
    }
    if (newPassword && newPassword !== newPasswordConfirm) {
      setMessage({ text: 'Yangi parol va tasdiqlash mos emas', isError: true });
      return;
    }
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Superadmin akkaunti</h2>
        <p className="text-xs text-slate-400">O'zingizning login va parolingizni yangilang</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Joriy login</span>
        <input
          value={auth?.login ?? ''}
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Yangi login <span className="text-slate-400">(ixtiyoriy)</span>
        </span>
        <input
          value={newLogin}
          onChange={(e) => setNewLogin(e.target.value)}
          placeholder={auth?.login}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>

      <PasswordField
        label="Joriy parol"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <PasswordField
        label="Yangi parol (ixtiyoriy)"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
      />
      <PasswordField
        label="Yangi parolni tasdiqlash"
        value={newPasswordConfirm}
        onChange={setNewPasswordConfirm}
        autoComplete="new-password"
      />

      {message && <Message text={message.text} isError={message.isError} />}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
      </button>
    </form>
  );
}

function StaffAccountCard() {
  const [businessId, setBusinessId] = useState('');
  const [userId, setUserId] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const { data: businesses = [] } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const { data: staffData } = useQuery({
    queryKey: ['platform-users', businessId],
    queryFn: () => listPlatformUsers({ business_id: businessId, limit: 200 }),
    enabled: !!businessId,
  });
  const staff = staffData?.users ?? [];
  const selectedUser = staff.find((u) => u.id === userId) ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      updateStaffCredentials(businessId, userId, {
        new_login: newLogin.trim() || undefined,
        new_password: newPassword || undefined,
        new_password_confirm: newPasswordConfirm || undefined,
      }),
    onSuccess: (data) => {
      setMessage({ text: data.message, isError: false });
      setNewLogin('');
      setNewPassword('');
      setNewPasswordConfirm('');
    },
    onError: (err: any) => {
      setMessage({ text: err?.response?.data?.error ?? 'Xatolik yuz berdi', isError: true });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!businessId || !userId) {
      setMessage({ text: 'Kafe va akkauntni tanlang', isError: true });
      return;
    }
    if (!newLogin.trim() && !newPassword) {
      setMessage({ text: 'Yangi login yoki parol kiriting', isError: true });
      return;
    }
    if (newPassword && newPassword !== newPasswordConfirm) {
      setMessage({ text: 'Yangi parol va tasdiqlash mos emas', isError: true });
      return;
    }
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Kafe akkaunti</h2>
        <p className="text-xs text-slate-400">Xodim login/parolini o'rnidan reset qiling</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Kafe</span>
        <select
          value={businessId}
          onChange={(e) => {
            setBusinessId(e.target.value);
            setUserId('');
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Tanlang...</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.business_code})
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Akkaunt</span>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={!businessId}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">Tanlang...</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} — {u.login} ({ROLE_LABELS[u.role] ?? u.role})
            </option>
          ))}
        </select>
      </label>

      {selectedUser && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Yangi login <span className="text-slate-400">(ixtiyoriy)</span>
          </span>
          <input
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            placeholder={selectedUser.login}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      )}

      <PasswordField
        label="Yangi parol (ixtiyoriy)"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
      />
      <PasswordField
        label="Yangi parolni tasdiqlash"
        value={newPasswordConfirm}
        onChange={setNewPasswordConfirm}
        autoComplete="new-password"
      />

      {message && <Message text={message.text} isError={message.isError} />}

      <button
        type="submit"
        disabled={mutation.isPending || !userId}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
      </button>
    </form>
  );
}
