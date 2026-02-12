/**
 * Patients list page for hospital dashboard.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Note: We'll use a simple fetch for patients list since the API
// may return paginated results. For now we use a placeholder approach.

interface PatientSummary {
  id: string;
  name: string;
  phone: string;
  mobility: string;
  is_active: boolean;
  created_at: string;
}

export default function PatientsPage() {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchPatients() {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const token = localStorage.getItem("tmt-token");
        const res = await fetch(`${API_BASE}/api/v1/patients`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          setPatients(data);
        }
      } catch (err) {
        console.error("Failed to fetch patients:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPatients();
  }, []);

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search)
  );

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t("patients.title")}
      </h1>

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("patients.search")}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Patients table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("patients.name")}
              </th>
              <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("patients.phone")}
              </th>
              <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("patients.mobility")}
              </th>
              <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t("patients.status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link
                    to={`/dashboard/patients/${patient.id}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {patient.name}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {patient.phone}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {patient.mobility}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                      patient.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {patient.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-gray-500"
                >
                  No patients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
