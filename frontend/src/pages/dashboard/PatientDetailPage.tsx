/**
 * Patient detail page showing full patient information.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPatient, type Patient } from "../../services/api";

export default function PatientDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPatient() {
      if (!id) return;
      try {
        const data = await getPatient(id);
        setPatient(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load patient");
      } finally {
        setLoading(false);
      }
    }
    fetchPatient();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error || "Patient not found"}</p>
        <Link to="/dashboard/patients" className="text-blue-600 hover:underline mt-4 inline-block">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link
        to="/dashboard/patients"
        className="text-blue-600 hover:underline text-sm mb-4 inline-block"
      >
        &larr; {t("common.back")}
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              patient.is_active
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {patient.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                {t("patients.phone")}
              </label>
              <p className="text-gray-900">{patient.phone}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                {t("patients.mobility")}
              </label>
              <p className="text-gray-900">{patient.mobility}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Living Situation
              </label>
              <p className="text-gray-900">{patient.living_situation}</p>
            </div>
            {patient.blood_type && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">
                  Blood Type
                </label>
                <p className="text-gray-900">{patient.blood_type}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {patient.latitude && patient.longitude && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">
                  {t("patients.location")}
                </label>
                <p className="text-gray-900">
                  {patient.latitude.toFixed(4)}, {patient.longitude.toFixed(4)}
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Emergency Contacts
              </label>
              {patient.emergency_contacts?.length > 0 ? (
                <ul className="space-y-1">
                  {patient.emergency_contacts.map((c, i) => (
                    <li key={i} className="text-gray-900 text-sm">
                      {c.name} - {c.phone}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm">None registered</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Registered
              </label>
              <p className="text-gray-900 text-sm">
                {new Date(patient.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
