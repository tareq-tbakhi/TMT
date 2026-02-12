/**
 * User profile page.
 */

import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t("nav.profile")}
        </h1>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">
              User ID
            </label>
            <p className="text-gray-900 text-sm font-mono">{user?.id}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">
              {t("auth.role")}
            </label>
            <p className="text-gray-900">{user?.role}</p>
          </div>

          {user?.hospitalId && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Hospital ID
              </label>
              <p className="text-gray-900 text-sm font-mono">
                {user.hospitalId}
              </p>
            </div>
          )}

          {user?.patientId && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                Patient ID
              </label>
              <p className="text-gray-900 text-sm font-mono">
                {user.patientId}
              </p>
            </div>
          )}

          <hr />

          <button
            onClick={logout}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
