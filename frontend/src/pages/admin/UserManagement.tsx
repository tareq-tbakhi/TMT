import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface User {
  id: string;
  phone: string;
  email: string;
  role: string;
  is_active: boolean;
  hospital_id: string | null;
  patient_id: string | null;
  created_at: string;
}

interface UserFormData {
  phone: string;
  password: string;
  email: string;
  role: string;
  hospital_id: string;
}

interface EditUserFormData {
  role: string;
  is_active: boolean;
  hospital_id: string;
  email: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const roleColors: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  hospital_admin: "bg-blue-100 text-blue-800",
  patient: "bg-green-100 text-green-800",
};

const UserManagement: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormData>({
    phone: "",
    password: "",
    email: "",
    role: "patient",
    hospital_id: "",
  });
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditUserFormData>({
    role: "",
    is_active: true,
    hospital_id: "",
    email: "",
  });
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditUserFormData, string>>>({});

  // Deactivate confirmation
  const [deactivateConfirm, setDeactivateConfirm] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 4000);
    },
    []
  );

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: "100",
        offset: "0",
      });
      if (roleFilter) params.set("role", roleFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(
        `${API_URL}/api/v1/admin/users?${params.toString()}`,
        { headers: getAuthHeaders() }
      );

      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);

      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, searchQuery, t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const validateCreateForm = (): boolean => {
    const errors: Partial<Record<keyof UserFormData, string>> = {};
    if (!createForm.phone.trim()) errors.phone = t("admin.validation.required");
    if (!createForm.password.trim()) errors.password = t("admin.validation.required");
    if (!createForm.role) errors.role = t("admin.validation.required");
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        phone: createForm.phone.trim(),
        password: createForm.password,
        role: createForm.role,
      };
      if (createForm.email.trim()) payload.email = createForm.email.trim();
      if (createForm.hospital_id.trim())
        payload.hospital_id = createForm.hospital_id.trim();

      const res = await fetch(`${API_URL}/api/v1/admin/users`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail || `Failed: ${res.status}`
        );
      }

      showNotification("success", t("admin.users.createSuccess"));
      setCreateModalOpen(false);
      setCreateForm({
        phone: "",
        password: "",
        email: "",
        role: "patient",
        hospital_id: "",
      });
      fetchUsers();
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : t("common.error")
      );
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      is_active: user.is_active,
      hospital_id: user.hospital_id ?? "",
      email: user.email ?? "",
    });
    setEditErrors({});
    setEditModalOpen(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.email.trim()) payload.email = editForm.email.trim();
      if (editForm.hospital_id.trim())
        payload.hospital_id = editForm.hospital_id.trim();

      const res = await fetch(
        `${API_URL}/api/v1/admin/users/${editingUser.id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail || `Failed: ${res.status}`
        );
      }

      showNotification("success", t("admin.users.updateSuccess"));
      setEditModalOpen(false);
      fetchUsers();
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : t("common.error")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateUser = async () => {
    if (!deactivateConfirm) return;

    setDeactivating(true);
    try {
      const res = await fetch(
        `${API_URL}/api/v1/admin/users/${deactivateConfirm.id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ is_active: false }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail || `Failed: ${res.status}`
        );
      }

      showNotification("success", t("admin.users.deactivateSuccess"));
      setDeactivateConfirm(null);
      fetchUsers();
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : t("common.error")
      );
    } finally {
      setDeactivating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 end-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-all ${
            notification.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("admin.users.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("admin.users.subtitle", { total })}
          </p>
        </div>
        <button
          onClick={() => {
            setCreateForm({
              phone: "",
              password: "",
              email: "",
              role: "patient",
              hospital_id: "",
            });
            setCreateErrors({});
            setCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("admin.users.create")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <svg
            className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 ps-10 pe-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder={t("admin.users.searchPlaceholder")}
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">{t("admin.users.allRoles")}</option>
          <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
          <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
          <option value="patient">{t("admin.users.rolePatient")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.phone")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.email")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.role")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.status")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.created")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.users.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    {t("admin.users.noUsers")}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {user.phone}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {user.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          roleColors[user.role] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            user.is_active ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                        <span
                          className={
                            user.is_active
                              ? "text-green-700"
                              : "text-red-700"
                          }
                        >
                          {user.is_active
                            ? t("admin.users.active")
                            : t("admin.users.inactive")}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title={t("common.edit")}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {user.is_active && (
                          <button
                            onClick={() => setDeactivateConfirm(user)}
                            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                            title={t("admin.users.deactivate")}
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deactivate confirmation dialog */}
      {deactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t("admin.users.confirmDeactivate")}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {t("admin.users.confirmDeactivateMessage", {
                phone: deactivateConfirm.phone,
              })}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeactivateConfirm(null)}
                disabled={deactivating}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDeactivateUser}
                disabled={deactivating}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deactivating
                  ? t("common.loading")
                  : t("admin.users.deactivate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.users.create")}
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6">
              <div className="space-y-4">
                {/* Phone */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.phone")} *
                  </label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      createErrors.phone ? "border-red-300" : "border-gray-300"
                    }`}
                    placeholder="+970..."
                  />
                  {createErrors.phone && (
                    <p className="mt-1 text-xs text-red-600">{createErrors.phone}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.password")} *
                  </label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, password: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      createErrors.password
                        ? "border-red-300"
                        : "border-gray-300"
                    }`}
                  />
                  {createErrors.password && (
                    <p className="mt-1 text-xs text-red-600">{createErrors.password}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.email")}
                  </label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="user@example.com"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.role")} *
                  </label>
                  <select
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, role: e.target.value }))
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      createErrors.role ? "border-red-300" : "border-gray-300"
                    }`}
                  >
                    <option value="patient">{t("admin.users.rolePatient")}</option>
                    <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
                    <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
                  </select>
                  {createErrors.role && (
                    <p className="mt-1 text-xs text-red-600">{createErrors.role}</p>
                  )}
                </div>

                {/* Hospital ID */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.hospitalId")}
                  </label>
                  <input
                    type="text"
                    value={createForm.hospital_id}
                    onChange={(e) =>
                      setCreateForm((p) => ({
                        ...p,
                        hospital_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={t("admin.users.hospitalIdPlaceholder")}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? t("common.loading") : t("admin.users.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.users.edit")}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-6">
              {/* User info header */}
              <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-500">{t("admin.users.phone")}</p>
                <p className="font-medium text-gray-900">{editingUser.phone}</p>
              </div>

              <div className="space-y-4">
                {/* Email */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.email")}
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.role")}
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, role: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="patient">{t("admin.users.rolePatient")}</option>
                    <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
                    <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
                  </select>
                </div>

                {/* Active status */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.status")}
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="is_active"
                        checked={editForm.is_active}
                        onChange={() =>
                          setEditForm((p) => ({ ...p, is_active: true }))
                        }
                        className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">
                        {t("admin.users.active")}
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="is_active"
                        checked={!editForm.is_active}
                        onChange={() =>
                          setEditForm((p) => ({ ...p, is_active: false }))
                        }
                        className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">
                        {t("admin.users.inactive")}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Hospital ID */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.users.hospitalId")}
                  </label>
                  <input
                    type="text"
                    value={editForm.hospital_id}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        hospital_id: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={t("admin.users.hospitalIdPlaceholder")}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
