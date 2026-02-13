import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface PatientRow {
  id: string;
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  mobility: string;
  living_situation: string;
  blood_type: string | null;
  gender: string | null;
  date_of_birth: string | null;
  chronic_conditions: string[];
  allergies: string[];
  emergency_contacts?: Record<string, unknown>[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type ViewMode = "table" | "card";

const mobilityConfig: Record<string, { label: string; border: string; bg: string }> = {
  can_walk: { label: "Can Walk", border: "border-green-300", bg: "bg-green-50" },
  wheelchair: { label: "Wheelchair", border: "border-orange-400", bg: "bg-orange-50" },
  bedridden: { label: "Bedridden", border: "border-red-500", bg: "bg-red-50" },
  other: { label: "Other", border: "border-yellow-400", bg: "bg-yellow-50" },
};

const PatientList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mobilityFilter, setMobilityFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const fetchPatients = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mobilityFilter) params.set("mobility", mobilityFilter);

    try {
      setLoading(true);
      const res = await fetch(
        `${API_URL}/api/v1/patients?${params.toString()}`,
        { headers }
      );
      if (res.status === 401) {
        localStorage.removeItem("tmt-token");
        localStorage.removeItem("tmt-user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as PatientRow[];
        setPatients(data);
      } else {
        setError("Failed to load patients");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients");
    } finally {
      setLoading(false);
    }
  }, [search, mobilityFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPatients();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchPatients]);

  const isVulnerable = (mobility: string) =>
    mobility === "bedridden" || mobility === "wheelchair" || mobility === "other";

  const getMobilityInfo = (mobility: string) =>
    mobilityConfig[mobility] ?? { label: mobility, border: "border-gray-200", bg: "" };

  const handleRowClick = (id: string) => {
    navigate(`/dashboard/patients/${id}`);
  };

  const locationText = (p: PatientRow) => {
    if (p.location_name) return p.location_name;
    if (p.latitude == null || p.longitude == null) return "Unknown";
    return `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("patients.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {patients.length} patients registered
          </p>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setViewMode("table")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "card"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Cards
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg
            className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder={t("patients.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pe-4 ps-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={mobilityFilter}
          onChange={(e) => setMobilityFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Mobility</option>
          <option value="can_walk">Can Walk</option>
          <option value="wheelchair">Wheelchair</option>
          <option value="bedridden">Bedridden</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table View */}
      {!loading && !error && viewMode === "table" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  {t("patients.name")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  {t("patients.location")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  {t("patients.mobility")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  Blood Type
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  Last Updated
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-gray-500">
                  Vulnerability
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No patients found
                  </td>
                </tr>
              ) : (
                patients.map((patient) => {
                  const mobility = getMobilityInfo(patient.mobility);
                  const vulnerable = isVulnerable(patient.mobility);
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => handleRowClick(patient.id)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                        vulnerable ? `border-s-4 ${mobility.border}` : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {patient.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {patient.phone}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={locationText(patient)}>
                        {locationText(patient)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${mobility.bg} ${
                            patient.mobility === "bedridden"
                              ? "text-red-700"
                              : patient.mobility === "wheelchair"
                              ? "text-orange-700"
                              : "text-green-700"
                          }`}
                        >
                          {mobility.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {patient.blood_type || "--"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {timeAgo(patient.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        {vulnerable ? (
                          <StatusBadge
                            severity={
                              patient.mobility === "bedridden"
                                ? "critical"
                                : "high"
                            }
                            size="sm"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Card View */}
      {!loading && !error && viewMode === "card" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400">
              No patients found
            </div>
          ) : (
            patients.map((patient) => {
              const mobility = getMobilityInfo(patient.mobility);
              const vulnerable = isVulnerable(patient.mobility);
              return (
                <div
                  key={patient.id}
                  onClick={() => handleRowClick(patient.id)}
                  className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                    vulnerable
                      ? `border-2 ${mobility.border}`
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {patient.name}
                      </h3>
                      <p className="text-xs text-gray-500">{patient.phone}</p>
                    </div>
                    {vulnerable && (
                      <StatusBadge
                        severity={
                          patient.mobility === "bedridden" ? "critical" : "high"
                        }
                        size="sm"
                      />
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-xs font-medium text-gray-400 w-16">
                        Location
                      </span>
                      <span className="truncate max-w-[140px]" title={locationText(patient)}>
                        {locationText(patient)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="text-xs font-medium text-gray-400 w-16">
                        Mobility
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${mobility.bg}`}
                      >
                        {mobility.label}
                      </span>
                    </div>
                    {patient.blood_type && (
                      <div className="flex items-start gap-2 text-gray-600">
                        <span className="text-xs font-medium text-gray-400 w-16">
                          Blood
                        </span>
                        <span className="text-xs">
                          {patient.blood_type}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Medical tags (quick glance) */}
                  {((patient.chronic_conditions?.length ?? 0) > 0 ||
                    (patient.allergies?.length ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(patient.chronic_conditions ?? []).slice(0, 2).map((c, i) => (
                        <span key={`c-${i}`} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                          {c}
                        </span>
                      ))}
                      {(patient.allergies ?? []).slice(0, 2).map((a, i) => (
                        <span key={`a-${i}`} className="rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-600">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                    Updated {timeAgo(patient.updated_at)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default PatientList;
