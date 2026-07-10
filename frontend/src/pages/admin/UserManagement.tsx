import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  Search,
  SquarePen,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  type BadgeTone,
} from "../../components/ui";

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

const roleTones: Record<string, BadgeTone> = {
  super_admin: "accent",
  hospital_admin: "info",
  police_admin: "neutral",
  civil_defense_admin: "warning",
  patient: "success",
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
    return <LoadingState label={t("common.loading")} />;
  }

  if (error && users.length === 0) {
    return (
      <Card className="border-danger bg-danger-soft text-center">
        <TriangleAlert
          aria-hidden="true"
          className="mx-auto mb-3 h-8 w-8 text-danger"
        />
        <p className="text-base font-semibold text-on-danger-soft">{error}</p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          {t("admin.retry")}
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Notification */}
      {notification && (
        <div
          role="status"
          className={`fixed top-4 end-4 z-50 flex items-center gap-2.5 rounded-md border px-4 py-3 shadow-2 ${
            notification.type === "success"
              ? "border-success bg-success-soft text-on-success-soft"
              : "border-danger bg-danger-soft text-on-danger-soft"
          }`}
        >
          {notification.type === "success" ? (
            <CircleCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />
          ) : (
            <CircleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-danger" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title={t("admin.users.title")}
        description={t("admin.users.subtitle", { total })}
        icon={<Users />}
        actions={
          <Button
            icon={<UserPlus />}
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
          >
            {t("admin.users.create")}
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t("admin.users.searchPlaceholder")}
            placeholder={t("admin.users.searchPlaceholder")}
            className="min-h-11 w-full rounded-md border border-edge-strong bg-surface ps-10 pe-3.5 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1"
          />
        </div>

        {/* Role filter */}
        <Select
          label={t("admin.users.role")}
          hideLabel
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="sm:w-64"
        >
          <option value="">{t("admin.users.allRoles")}</option>
          <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
          <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
          <option value="police_admin">Police Admin</option>
          <option value="civil_defense_admin">Civil Defense Admin</option>
          <option value="patient">{t("admin.users.rolePatient")}</option>
        </Select>
      </div>

      {/* Table */}
      <Card flush className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.phone")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.email")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.role")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.status")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.created")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.users.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6">
                    <EmptyState
                      icon={<Users />}
                      title={t("admin.users.noUsers")}
                      className="border-0"
                    />
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-ink">
                      {user.phone}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {user.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Badge tone={roleTones[user.role] ?? "neutral"} size="sm">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Badge
                        tone={user.is_active ? "success" : "danger"}
                        size="sm"
                        dot
                      >
                        {user.is_active
                          ? t("admin.users.active")
                          : t("admin.users.inactive")}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-on-accent-soft focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                        >
                          <SquarePen aria-hidden="true" className="h-4 w-4" />
                        </button>
                        {user.is_active && (
                          <button
                            type="button"
                            onClick={() => setDeactivateConfirm(user)}
                            aria-label={t("admin.users.deactivate")}
                            title={t("admin.users.deactivate")}
                            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                          >
                            <Ban aria-hidden="true" className="h-4 w-4" />
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
      </Card>

      {/* Deactivate confirmation dialog */}
      {deactivateConfirm && (
        <Modal
          open
          onClose={() => setDeactivateConfirm(null)}
          title={t("admin.users.confirmDeactivate")}
          size="sm"
          dismissible={false}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setDeactivateConfirm(null)}
                disabled={deactivating}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                icon={<Ban />}
                loading={deactivating}
                onClick={handleDeactivateUser}
              >
                {t("admin.users.deactivate")}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <Ban className="h-5 w-5" />
            </span>
            <p className="text-sm text-ink-muted">
              {t("admin.users.confirmDeactivateMessage", {
                phone: deactivateConfirm.phone,
              })}
            </p>
          </div>
        </Modal>
      )}

      {/* Create user modal */}
      {createModalOpen && (
        <Modal
          open
          onClose={() => setCreateModalOpen(false)}
          title={t("admin.users.create")}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setCreateModalOpen(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="create-user-form" loading={saving}>
                {t("admin.users.create")}
              </Button>
            </>
          }
        >
          <form
            id="create-user-form"
            onSubmit={handleCreateUser}
            noValidate
            className="flex flex-col gap-4"
          >
            {/* Phone */}
            <Input
              label={t("admin.users.phone")}
              required
              value={createForm.phone}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, phone: e.target.value }))
              }
              error={createErrors.phone}
              placeholder="+970..."
            />

            {/* Password */}
            <Input
              label={t("admin.users.password")}
              required
              type="password"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, password: e.target.value }))
              }
              error={createErrors.password}
            />

            {/* Email */}
            <Input
              label={t("admin.users.email")}
              type="email"
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="user@example.com"
            />

            {/* Role */}
            <Select
              label={t("admin.users.role")}
              required
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((p) => ({ ...p, role: e.target.value }))
              }
              error={createErrors.role}
            >
              <option value="patient">{t("admin.users.rolePatient")}</option>
              <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
              <option value="police_admin">Police Admin</option>
              <option value="civil_defense_admin">Civil Defense Admin</option>
              <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
            </Select>

            {/* Hospital ID */}
            <Input
              label={t("admin.users.hospitalId")}
              value={createForm.hospital_id}
              onChange={(e) =>
                setCreateForm((p) => ({
                  ...p,
                  hospital_id: e.target.value,
                }))
              }
              placeholder={t("admin.users.hospitalIdPlaceholder")}
            />
          </form>
        </Modal>
      )}

      {/* Edit user modal */}
      {editModalOpen && editingUser && (
        <Modal
          open
          onClose={() => setEditModalOpen(false)}
          title={t("admin.users.edit")}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="edit-user-form" loading={saving}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <form
            id="edit-user-form"
            onSubmit={handleEditUser}
            noValidate
            className="flex flex-col gap-4"
          >
            {/* User info header */}
            <div className="rounded-md border border-edge bg-surface-2 px-4 py-3">
              <p className="text-sm text-ink-muted">{t("admin.users.phone")}</p>
              <p className="font-semibold text-ink">{editingUser.phone}</p>
            </div>

            {/* Email */}
            <Input
              label={t("admin.users.email")}
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, email: e.target.value }))
              }
              error={editErrors.email}
            />

            {/* Role */}
            <Select
              label={t("admin.users.role")}
              value={editForm.role}
              onChange={(e) =>
                setEditForm((p) => ({ ...p, role: e.target.value }))
              }
            >
              <option value="patient">{t("admin.users.rolePatient")}</option>
              <option value="hospital_admin">{t("admin.users.roleHospitalAdmin")}</option>
              <option value="police_admin">Police Admin</option>
              <option value="civil_defense_admin">Civil Defense Admin</option>
              <option value="super_admin">{t("admin.users.roleSuperAdmin")}</option>
            </Select>

            {/* Active status */}
            <fieldset>
              <legend className="text-sm font-semibold text-ink">
                {t("admin.users.status")}
              </legend>
              <div className="mt-1.5 flex items-center gap-5">
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="is_active"
                    checked={editForm.is_active}
                    onChange={() =>
                      setEditForm((p) => ({ ...p, is_active: true }))
                    }
                    className="h-5 w-5 border-edge-strong accent-accent focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                  />
                  <span className="text-base text-ink">
                    {t("admin.users.active")}
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="is_active"
                    checked={!editForm.is_active}
                    onChange={() =>
                      setEditForm((p) => ({ ...p, is_active: false }))
                    }
                    className="h-5 w-5 border-edge-strong accent-accent focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                  />
                  <span className="text-base text-ink">
                    {t("admin.users.inactive")}
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Hospital ID */}
            <Input
              label={t("admin.users.hospitalId")}
              value={editForm.hospital_id}
              onChange={(e) =>
                setEditForm((p) => ({
                  ...p,
                  hospital_id: e.target.value,
                }))
              }
              placeholder={t("admin.users.hospitalIdPlaceholder")}
            />
          </form>
        </Modal>
      )}
    </div>
  );
};

export default UserManagement;
