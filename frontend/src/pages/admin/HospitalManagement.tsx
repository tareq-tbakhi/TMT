import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

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

const statusColors: Record<string, string> = {
  operational: "bg-green-100 text-green-800",
  limited: "bg-yellow-100 text-yellow-800",
  full: "bg-red-100 text-red-800",
  destroyed: "bg-gray-100 text-gray-800",
};

const deptColors: Record<string, string> = {
  hospital: "bg-blue-50 text-blue-700",
  police: "bg-indigo-50 text-indigo-700",
  civil_defense: "bg-orange-50 text-orange-700",
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
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
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
            Facility Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage hospitals, police stations, and civil defense centers
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Facility
        </button>
      </div>

      {/* Department filter */}
      <div className="flex items-center gap-2">
        {["", "hospital", "police", "civil_defense"].map((d) => (
          <button
            key={d}
            onClick={() => setDeptFilter(d)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              deptFilter === d
                ? "bg-purple-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {d === "" ? "All" : deptLabels[d] ?? d}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.name")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.status")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  Capacity
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.icu")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.available")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.phone")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("admin.hospitals.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {hospitals.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    {t("admin.hospitals.noHospitals")}
                  </td>
                </tr>
              ) : (
                hospitals.map((hospital) => (
                  <tr
                    key={hospital.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {hospital.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${deptColors[hospital.department_type] ?? "bg-gray-100 text-gray-700"}`}>
                        {deptLabels[hospital.department_type] ?? hospital.department_type ?? "Hospital"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          statusColors[hospital.status] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {hospital.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {hospital.department_type === "police"
                        ? `${hospital.available_units ?? 0}/${hospital.patrol_units ?? 0} units`
                        : hospital.department_type === "civil_defense"
                        ? `${hospital.available_teams ?? 0}/${hospital.rescue_teams ?? 0} teams`
                        : `${hospital.available_beds}/${hospital.bed_capacity} beds`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {hospital.department_type === "hospital" ? hospital.icu_beds : hospital.department_type === "civil_defense" ? `${hospital.shelter_capacity} shelter` : "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {hospital.department_type === "hospital" ? hospital.available_beds : "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {hospital.phone || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(hospital)}
                          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title={t("common.edit")}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(hospital.id)}
                          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                          title={t("common.delete")}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t("admin.hospitals.confirmDelete")}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {t("admin.hospitals.confirmDeleteMessage")}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("common.loading") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingHospital
                  ? t("admin.hospitals.edit")
                  : t("admin.hospitals.create")}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.name")} *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      formErrors.name ? "border-red-300" : "border-gray-300"
                    }`}
                    placeholder={t("admin.hospitals.namePlaceholder")}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                  )}
                </div>

                {/* Department Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Department Type *
                  </label>
                  <select
                    value={formData.department_type}
                    onChange={(e) => updateField("department_type", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="hospital">Hospital</option>
                    <option value="police">Police Station</option>
                    <option value="civil_defense">Civil Defense Center</option>
                  </select>
                </div>

                {/* Latitude */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.latitude")} *
                  </label>
                  <input
                    type="text"
                    value={formData.latitude}
                    onChange={(e) => updateField("latitude", e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      formErrors.latitude ? "border-red-300" : "border-gray-300"
                    }`}
                    placeholder="31.5"
                  />
                  {formErrors.latitude && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.latitude}</p>
                  )}
                </div>

                {/* Longitude */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.longitude")} *
                  </label>
                  <input
                    type="text"
                    value={formData.longitude}
                    onChange={(e) => updateField("longitude", e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      formErrors.longitude ? "border-red-300" : "border-gray-300"
                    }`}
                    placeholder="34.47"
                  />
                  {formErrors.longitude && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.longitude}</p>
                  )}
                </div>

                {/* Hospital-specific: Bed Capacity, ICU Beds, Available Beds */}
                {formData.department_type === "hospital" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t("admin.hospitals.bedCapacity")} *
                      </label>
                      <input
                        type="number"
                        value={formData.bed_capacity}
                        onChange={(e) => updateField("bed_capacity", e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          formErrors.bed_capacity ? "border-red-300" : "border-gray-300"
                        }`}
                        min="0"
                      />
                      {formErrors.bed_capacity && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.bed_capacity}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t("admin.hospitals.icuBeds")} *
                      </label>
                      <input
                        type="number"
                        value={formData.icu_beds}
                        onChange={(e) => updateField("icu_beds", e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          formErrors.icu_beds ? "border-red-300" : "border-gray-300"
                        }`}
                        min="0"
                      />
                      {formErrors.icu_beds && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.icu_beds}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t("admin.hospitals.availableBeds")} *
                      </label>
                      <input
                        type="number"
                        value={formData.available_beds}
                        onChange={(e) => updateField("available_beds", e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          formErrors.available_beds ? "border-red-300" : "border-gray-300"
                        }`}
                        min="0"
                      />
                      {formErrors.available_beds && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.available_beds}</p>
                      )}
                    </div>
                  </>
                )}

                {/* Police-specific: Patrol Units, Available Units */}
                {formData.department_type === "police" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Total Patrol Units *
                      </label>
                      <input
                        type="number"
                        value={formData.patrol_units}
                        onChange={(e) => updateField("patrol_units", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Available Units *
                      </label>
                      <input
                        type="number"
                        value={formData.available_units}
                        onChange={(e) => updateField("available_units", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="0"
                      />
                    </div>
                  </>
                )}

                {/* Civil Defense-specific: Rescue Teams, Available Teams, Shelter Capacity */}
                {formData.department_type === "civil_defense" && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Total Rescue Teams *
                      </label>
                      <input
                        type="number"
                        value={formData.rescue_teams}
                        onChange={(e) => updateField("rescue_teams", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Available Teams *
                      </label>
                      <input
                        type="number"
                        value={formData.available_teams}
                        onChange={(e) => updateField("available_teams", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Shelter Capacity
                      </label>
                      <input
                        type="number"
                        value={formData.shelter_capacity}
                        onChange={(e) => updateField("shelter_capacity", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        min="0"
                      />
                    </div>
                  </>
                )}

                {/* Coverage Radius */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.coverageRadius")}
                  </label>
                  <input
                    type="number"
                    value={formData.coverage_radius_km}
                    onChange={(e) => updateField("coverage_radius_km", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    min="0"
                    step="0.1"
                  />
                </div>

                {/* Phone - full width */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.phone")}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="+970..."
                  />
                </div>

                {/* Specialties - full width */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.specialties")}
                  </label>
                  <input
                    type="text"
                    value={formData.specialties}
                    onChange={(e) => updateField("specialties", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder={t("admin.hospitals.specialtiesPlaceholder")}
                  />
                </div>

                {/* Supply levels - full width */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("admin.hospitals.supplyLevels")}
                  </label>
                  <input
                    type="text"
                    value={formData.supply_levels}
                    onChange={(e) => updateField("supply_levels", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder='{"blood": 80, "oxygen": 60}'
                  />
                </div>

                {/* Admin fields - only for create */}
                {!editingHospital && (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t("admin.hospitals.adminPhone")} *
                      </label>
                      <input
                        type="text"
                        value={formData.admin_phone}
                        onChange={(e) => updateField("admin_phone", e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          formErrors.admin_phone ? "border-red-300" : "border-gray-300"
                        }`}
                        placeholder="+970..."
                      />
                      {formErrors.admin_phone && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.admin_phone}</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t("admin.hospitals.adminPassword")} *
                      </label>
                      <input
                        type="password"
                        value={formData.admin_password}
                        onChange={(e) => updateField("admin_password", e.target.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          formErrors.admin_password ? "border-red-300" : "border-gray-300"
                        }`}
                      />
                      {formErrors.admin_password && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.admin_password}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Modal footer */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
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
                  {saving
                    ? t("common.loading")
                    : editingHospital
                      ? t("common.save")
                      : t("admin.hospitals.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HospitalManagement;
