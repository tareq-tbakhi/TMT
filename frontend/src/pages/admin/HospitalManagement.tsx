import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Plus,
  SquarePen,
  Trash2,
  TriangleAlert,
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
  statusTone,
  type BadgeTone,
} from "../../components/ui";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Hospital {
  id: string;
  name: string;
  department_type: string;
  status: string;
  latitude: number;
  longitude: number;
  bed_capacity: number;
  icu_beds: number;
  available_beds: number;
  specialties: string[];
  coverage_radius_km: number;
  phone: string;
  supply_levels: Record<string, number>;
  patrol_units: number;
  available_units: number;
  rescue_teams: number;
  available_teams: number;
  shelter_capacity: number;
}

interface HospitalFormData {
  name: string;
  department_type: string;
  latitude: string;
  longitude: string;
  bed_capacity: string;
  icu_beds: string;
  available_beds: string;
  specialties: string;
  coverage_radius_km: string;
  phone: string;
  supply_levels: string;
  admin_phone: string;
  admin_password: string;
  patrol_units: string;
  available_units: string;
  rescue_teams: string;
  available_teams: string;
  shelter_capacity: string;
}

const emptyForm: HospitalFormData = {
  name: "",
  department_type: "hospital",
  latitude: "",
  longitude: "",
  bed_capacity: "",
  icu_beds: "",
  available_beds: "",
  specialties: "",
  coverage_radius_km: "",
  phone: "",
  supply_levels: "",
  admin_phone: "",
  admin_password: "",
  patrol_units: "0",
  available_units: "0",
  rescue_teams: "0",
  available_teams: "0",
  shelter_capacity: "0",
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const deptTones: Record<string, BadgeTone> = {
  hospital: "info",
  police: "accent",
  civil_defense: "warning",
};

const deptLabels: Record<string, string> = {
  hospital: "Hospital",
  police: "Police",
  civil_defense: "Civil Defense",
};

const HospitalManagement: React.FC = () => {
  const { t } = useTranslation();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [formData, setFormData] = useState<HospitalFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HospitalFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 4000);
    },
    []
  );

  const fetchHospitals = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (deptFilter) params.set("department_type", deptFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_URL}/api/v1/hospitals${qs}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error(`Failed to fetch facilities: ${res.status}`);

      const data = await res.json();
      setHospitals(data.hospitals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t, deptFilter]);

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof HospitalFormData, string>> = {};

    if (!formData.name.trim()) errors.name = t("admin.validation.required");
    if (!formData.latitude.trim() || isNaN(Number(formData.latitude)))
      errors.latitude = t("admin.validation.invalidNumber");
    if (!formData.longitude.trim() || isNaN(Number(formData.longitude)))
      errors.longitude = t("admin.validation.invalidNumber");
    if (formData.department_type === "hospital") {
      if (!formData.bed_capacity.trim() || isNaN(Number(formData.bed_capacity)))
        errors.bed_capacity = t("admin.validation.invalidNumber");
      if (!formData.icu_beds.trim() || isNaN(Number(formData.icu_beds)))
        errors.icu_beds = t("admin.validation.invalidNumber");
      if (!formData.available_beds.trim() || isNaN(Number(formData.available_beds)))
        errors.available_beds = t("admin.validation.invalidNumber");
    }

    // Only require admin fields for new hospitals
    if (!editingHospital) {
      if (!formData.admin_phone.trim())
        errors.admin_phone = t("admin.validation.required");
      if (!formData.admin_password.trim())
        errors.admin_password = t("admin.validation.required");
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setEditingHospital(null);
    setFormData(emptyForm);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (hospital: Hospital) => {
    setEditingHospital(hospital);
    setFormData({
      name: hospital.name,
      department_type: hospital.department_type ?? "hospital",
      latitude: String(hospital.latitude),
      longitude: String(hospital.longitude),
      bed_capacity: String(hospital.bed_capacity),
      icu_beds: String(hospital.icu_beds),
      available_beds: String(hospital.available_beds),
      specialties: (hospital.specialties ?? []).join(", "),
      coverage_radius_km: String(hospital.coverage_radius_km ?? ""),
      phone: hospital.phone ?? "",
      supply_levels: hospital.supply_levels
        ? JSON.stringify(hospital.supply_levels)
        : "",
      admin_phone: "",
      admin_password: "",
      patrol_units: String(hospital.patrol_units ?? 0),
      available_units: String(hospital.available_units ?? 0),
      rescue_teams: String(hospital.rescue_teams ?? 0),
      available_teams: String(hospital.available_teams ?? 0),
      shelter_capacity: String(hospital.shelter_capacity ?? 0),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        department_type: formData.department_type || "hospital",
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        bed_capacity: parseInt(formData.bed_capacity || "0", 10),
        icu_beds: parseInt(formData.icu_beds || "0", 10),
        available_beds: parseInt(formData.available_beds || "0", 10),
        specialties: formData.specialties
          ? formData.specialties.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        coverage_radius_km: formData.coverage_radius_km
          ? parseFloat(formData.coverage_radius_km)
          : 10,
        phone: formData.phone.trim(),
        patrol_units: parseInt(formData.patrol_units || "0", 10),
        available_units: parseInt(formData.available_units || "0", 10),
        rescue_teams: parseInt(formData.rescue_teams || "0", 10),
        available_teams: parseInt(formData.available_teams || "0", 10),
        shelter_capacity: parseInt(formData.shelter_capacity || "0", 10),
      };

      if (formData.supply_levels.trim()) {
        try {
          payload.supply_levels = JSON.parse(formData.supply_levels);
        } catch {
          payload.supply_levels = {};
        }
      }

      if (!editingHospital) {
        // Create
        payload.admin_phone = formData.admin_phone.trim();
        payload.admin_password = formData.admin_password.trim();
      }

      const url = editingHospital
        ? `${API_URL}/api/v1/hospitals/${editingHospital.id}`
        : `${API_URL}/api/v1/hospitals`;

      const method = editingHospital ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail ||
            `Failed: ${res.status}`
        );
      }

      showNotification(
        "success",
        editingHospital
          ? t("admin.hospitals.updateSuccess")
          : t("admin.hospitals.createSuccess")
      );
      setModalOpen(false);
      fetchHospitals();
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : t("common.error")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/hospitals/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail ||
            `Failed: ${res.status}`
        );
      }

      showNotification("success", t("admin.hospitals.deleteSuccess"));
      setDeleteConfirm(null);
      fetchHospitals();
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error ? err.message : t("common.error")
      );
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field: keyof HospitalFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  if (loading) {
    return <LoadingState label={t("common.loading")} />;
  }

  if (error) {
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
        title="Facility Management"
        description="Manage hospitals, police stations, and civil defense centers"
        icon={<Building2 />}
        actions={
          <Button icon={<Plus />} onClick={openCreateModal}>
            Add Facility
          </Button>
        }
      />

      {/* Department filter */}
      <div
        role="group"
        aria-label="Type"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        {["", "hospital", "police", "civil_defense"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDeptFilter(d)}
            aria-pressed={deptFilter === d}
            className={`min-h-11 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              deptFilter === d
                ? "bg-accent text-on-accent shadow-1"
                : "border border-edge-strong bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {d === "" ? "All" : deptLabels[d] ?? d}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card flush className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.name")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Type
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.status")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Capacity
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.icu")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.available")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.phone")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                  {t("admin.hospitals.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {hospitals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6">
                    <EmptyState
                      icon={<Building2 />}
                      title={t("admin.hospitals.noHospitals")}
                      className="border-0"
                    />
                  </td>
                </tr>
              ) : (
                hospitals.map((hospital) => (
                  <tr
                    key={hospital.id}
                    className="transition-colors hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-ink">
                      {hospital.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Badge
                        tone={deptTones[hospital.department_type] ?? "neutral"}
                        size="sm"
                      >
                        {deptLabels[hospital.department_type] ?? hospital.department_type ?? "Hospital"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Badge
                        tone={statusTone(hospital.status)}
                        size="sm"
                        dot
                        className="capitalize"
                      >
                        {hospital.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {hospital.department_type === "police"
                        ? `${hospital.available_units ?? 0}/${hospital.patrol_units ?? 0} units`
                        : hospital.department_type === "civil_defense"
                        ? `${hospital.available_teams ?? 0}/${hospital.rescue_teams ?? 0} teams`
                        : `${hospital.available_beds}/${hospital.bed_capacity} beds`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {hospital.department_type === "hospital" ? hospital.icu_beds : hospital.department_type === "civil_defense" ? `${hospital.shelter_capacity} shelter` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {hospital.department_type === "hospital" ? hospital.available_beds : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-ink-muted">
                      {hospital.phone || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(hospital)}
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-on-accent-soft focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                        >
                          <SquarePen aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(hospital.id)}
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <Modal
          open
          onClose={() => setDeleteConfirm(null)}
          title={t("admin.hospitals.confirmDelete")}
          size="sm"
          dismissible={false}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 />}
                loading={deleting}
                onClick={() => handleDelete(deleteConfirm)}
              >
                {t("common.delete")}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <TriangleAlert className="h-5 w-5" />
            </span>
            <p className="text-sm text-ink-muted">
              {t("admin.hospitals.confirmDeleteMessage")}
            </p>
          </div>
        </Modal>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <Modal
          open
          onClose={() => setModalOpen(false)}
          title={
            editingHospital
              ? t("admin.hospitals.edit")
              : t("admin.hospitals.create")
          }
          size="lg"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="facility-form" loading={saving}>
                {editingHospital
                  ? t("common.save")
                  : t("admin.hospitals.create")}
              </Button>
            </>
          }
        >
          <form id="facility-form" onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Name */}
              <Input
                label={t("admin.hospitals.name")}
                required
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                error={formErrors.name}
                placeholder={t("admin.hospitals.namePlaceholder")}
              />

              {/* Department Type */}
              <Select
                label="Department Type"
                required
                value={formData.department_type}
                onChange={(e) => updateField("department_type", e.target.value)}
              >
                <option value="hospital">Hospital</option>
                <option value="police">Police Station</option>
                <option value="civil_defense">Civil Defense Center</option>
              </Select>

              {/* Latitude */}
              <Input
                label={t("admin.hospitals.latitude")}
                required
                value={formData.latitude}
                onChange={(e) => updateField("latitude", e.target.value)}
                error={formErrors.latitude}
                placeholder="31.5"
              />

              {/* Longitude */}
              <Input
                label={t("admin.hospitals.longitude")}
                required
                value={formData.longitude}
                onChange={(e) => updateField("longitude", e.target.value)}
                error={formErrors.longitude}
                placeholder="34.47"
              />

              {/* Hospital-specific: Bed Capacity, ICU Beds, Available Beds */}
              {formData.department_type === "hospital" && (
                <>
                  <Input
                    label={t("admin.hospitals.bedCapacity")}
                    required
                    type="number"
                    min="0"
                    value={formData.bed_capacity}
                    onChange={(e) => updateField("bed_capacity", e.target.value)}
                    error={formErrors.bed_capacity}
                  />
                  <Input
                    label={t("admin.hospitals.icuBeds")}
                    required
                    type="number"
                    min="0"
                    value={formData.icu_beds}
                    onChange={(e) => updateField("icu_beds", e.target.value)}
                    error={formErrors.icu_beds}
                  />
                  <Input
                    label={t("admin.hospitals.availableBeds")}
                    required
                    type="number"
                    min="0"
                    value={formData.available_beds}
                    onChange={(e) => updateField("available_beds", e.target.value)}
                    error={formErrors.available_beds}
                  />
                </>
              )}

              {/* Police-specific: Patrol Units, Available Units */}
              {formData.department_type === "police" && (
                <>
                  <Input
                    label="Total Patrol Units"
                    required
                    type="number"
                    min="0"
                    value={formData.patrol_units}
                    onChange={(e) => updateField("patrol_units", e.target.value)}
                  />
                  <Input
                    label="Available Units"
                    required
                    type="number"
                    min="0"
                    value={formData.available_units}
                    onChange={(e) => updateField("available_units", e.target.value)}
                  />
                </>
              )}

              {/* Civil Defense-specific: Rescue Teams, Available Teams, Shelter Capacity */}
              {formData.department_type === "civil_defense" && (
                <>
                  <Input
                    label="Total Rescue Teams"
                    required
                    type="number"
                    min="0"
                    value={formData.rescue_teams}
                    onChange={(e) => updateField("rescue_teams", e.target.value)}
                  />
                  <Input
                    label="Available Teams"
                    required
                    type="number"
                    min="0"
                    value={formData.available_teams}
                    onChange={(e) => updateField("available_teams", e.target.value)}
                  />
                  <Input
                    label="Shelter Capacity"
                    type="number"
                    min="0"
                    value={formData.shelter_capacity}
                    onChange={(e) => updateField("shelter_capacity", e.target.value)}
                  />
                </>
              )}

              {/* Coverage Radius */}
              <Input
                label={t("admin.hospitals.coverageRadius")}
                type="number"
                min="0"
                step="0.1"
                value={formData.coverage_radius_km}
                onChange={(e) => updateField("coverage_radius_km", e.target.value)}
              />

              {/* Phone - full width */}
              <Input
                className="sm:col-span-2"
                label={t("admin.hospitals.phone")}
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+970..."
              />

              {/* Specialties - full width */}
              <Input
                className="sm:col-span-2"
                label={t("admin.hospitals.specialties")}
                value={formData.specialties}
                onChange={(e) => updateField("specialties", e.target.value)}
                placeholder={t("admin.hospitals.specialtiesPlaceholder")}
              />

              {/* Supply levels - full width */}
              <Input
                className="sm:col-span-2"
                label={t("admin.hospitals.supplyLevels")}
                value={formData.supply_levels}
                onChange={(e) => updateField("supply_levels", e.target.value)}
                placeholder='{"blood": 80, "oxygen": 60}'
              />

              {/* Admin fields - only for create */}
              {!editingHospital && (
                <>
                  <Input
                    label={t("admin.hospitals.adminPhone")}
                    required
                    value={formData.admin_phone}
                    onChange={(e) => updateField("admin_phone", e.target.value)}
                    error={formErrors.admin_phone}
                    placeholder="+970..."
                  />
                  <Input
                    label={t("admin.hospitals.adminPassword")}
                    required
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => updateField("admin_password", e.target.value)}
                    error={formErrors.admin_password}
                  />
                </>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default HospitalManagement;
