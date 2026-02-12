/**
 * Hospital status management page.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getHospitals,
  updateHospitalStatus,
  type Hospital,
} from "../../services/api";
import { getHospitalStatusInfo } from "../../utils/formatting";

export default function StatusPage() {
  const { t, i18n } = useTranslation();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHospitals() {
      try {
        const data = await getHospitals();
        setHospitals(data);
      } catch (err) {
        console.error("Failed to fetch hospitals:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHospitals();
  }, []);

  const handleStatusChange = async (hospitalId: string, newStatus: string) => {
    try {
      const updated = await updateHospitalStatus(hospitalId, {
        status: newStatus,
      });
      setHospitals((prev) =>
        prev.map((h) => (h.id === hospitalId ? updated : h))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const locale = i18n.language;

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
        {t("hospital.status")}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {hospitals.map((hospital) => {
          const statusInfo = getHospitalStatusInfo(hospital.status, locale);

          return (
            <div
              key={hospital.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {hospital.name}
                  </h3>
                  <span className={`text-sm font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <select
                  value={hospital.status}
                  onChange={(e) =>
                    handleStatusChange(hospital.id, e.target.value)
                  }
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="operational">Operational</option>
                  <option value="limited">Limited</option>
                  <option value="full">Full</option>
                  <option value="destroyed">Destroyed</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-gray-900">
                    {hospital.available_beds}
                  </p>
                  <p className="text-xs text-gray-500">{t("hospital.beds")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-gray-900">
                    {hospital.icu_beds}
                  </p>
                  <p className="text-xs text-gray-500">{t("hospital.icu")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-gray-900">
                    {hospital.bed_capacity}
                  </p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>

              {/* Supply levels */}
              {hospital.supply_levels &&
                Object.keys(hospital.supply_levels).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                      {t("hospital.supplies")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(hospital.supply_levels).map(
                        ([supply, level]) => (
                          <span
                            key={supply}
                            className={`text-xs px-2 py-1 rounded-full ${
                              level === "high"
                                ? "bg-green-100 text-green-700"
                                : level === "medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {supply}: {level}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
