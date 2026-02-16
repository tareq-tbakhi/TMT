/**
 * ActiveCaseCard - Shows the current assigned case
 * Large, clear display optimized for emergency use
 */

import type { AssignedCase } from "../../types/responderTypes";
import { PRIORITY_COLORS, STATUS_LABELS, CASE_TYPE_ICONS } from "../../types/responderTypes";
import { RESPONDER_COLORS, type ResponderType } from "../../store/authStore";

interface ActiveCaseCardProps {
  caseData: AssignedCase;
  responderType: ResponderType;
  onNavigate?: () => void;
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMins = Math.floor((now - then) / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default function ActiveCaseCard({ caseData, responderType, onNavigate }: ActiveCaseCardProps) {
  const priorityColors = PRIORITY_COLORS[caseData.priority];
  const responderColors = RESPONDER_COLORS[responderType];
  const icon = CASE_TYPE_ICONS[caseData.type];

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Priority Banner */}
      <div className={`${priorityColors.bg} px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${priorityColors.dot} animate-pulse`} />
          <span className={`font-bold text-sm uppercase ${priorityColors.text}`}>
            {caseData.priority} Priority
          </span>
        </div>
        <span className="text-sm text-gray-600">{caseData.caseNumber}</span>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        {/* Case Type & Description */}
        <div className="flex items-start gap-3">
          <span className="text-3xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-lg leading-tight">
              {caseData.briefDescription}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500 capitalize">{caseData.type}</span>
              {caseData.victimCount && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-sm text-gray-600">
                    {caseData.victimCount} {caseData.victimCount === 1 ? "person" : "people"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${responderColors.bg}`}>
          <span className={`w-2 h-2 rounded-full ${responderColors.accent}`} />
          <span className={`text-sm font-medium ${responderColors.text}`}>
            {STATUS_LABELS[caseData.status]}
          </span>
        </div>

        {/* Victim/Patient Information - Customized per responder type */}
        {caseData.victimInfo && (
          <div className="bg-blue-50 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
                  {responderType === "ambulance" ? "Patient Information" : "Person Information"}
                </p>

                {/* Name - shown for all */}
                <div className="mt-2 space-y-1">
                  {caseData.victimInfo.name && (
                    <p className="font-semibold text-gray-900">{caseData.victimInfo.name}</p>
                  )}

                  {/* Basic info - age/gender for ambulance & firefighter only */}
                  {(responderType === "ambulance" || responderType === "firefighter") && (
                    <div className="flex flex-wrap gap-2 text-sm">
                      {caseData.victimInfo.age && (
                        <span className="text-gray-600">{caseData.victimInfo.age} yrs</span>
                      )}
                      {caseData.victimInfo.gender && (
                        <span className="text-gray-600 capitalize">{caseData.victimInfo.gender}</span>
                      )}
                      {/* Blood type - ambulance only */}
                      {responderType === "ambulance" && caseData.victimInfo.bloodType && (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                          {caseData.victimInfo.bloodType}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Medical conditions - ambulance only */}
                {responderType === "ambulance" && caseData.victimInfo.medicalConditions && caseData.victimInfo.medicalConditions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 font-medium">Medical Conditions:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {caseData.victimInfo.medicalConditions.map((condition, i) => (
                        <span key={i} className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded">
                          {condition}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allergies - ambulance only */}
                {responderType === "ambulance" && caseData.victimInfo.allergies && caseData.victimInfo.allergies.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 font-medium">Allergies:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {caseData.victimInfo.allergies.map((allergy, i) => (
                        <span key={i} className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">
                          {allergy}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Special conditions for firefighter (mobility, oxygen dependent, etc.) */}
                {responderType === "firefighter" && caseData.victimInfo.medicalConditions && caseData.victimInfo.medicalConditions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 font-medium">Special Conditions:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {caseData.victimInfo.medicalConditions.map((condition, i) => (
                        <span key={i} className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded">
                          {condition}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact buttons - shown for all */}
                <div className="flex gap-2 mt-3">
                  {caseData.victimInfo.phone && (
                    <a
                      href={`tel:${caseData.victimInfo.phone}`}
                      className="flex items-center gap-1.5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                      {responderType === "ambulance" ? "Call Patient" : "Call"}
                    </a>
                  )}
                  {caseData.victimInfo.emergencyContact && (
                    <a
                      href={`tel:${caseData.victimInfo.emergencyContact.phone}`}
                      className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                      {caseData.victimInfo.emergencyContact.relation}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location */}
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Pickup Location</p>
              <p className="font-semibold text-gray-900 mt-0.5">{caseData.pickupLocation.address}</p>
              {caseData.pickupLocation.landmark && (
                <p className="text-sm text-gray-600 mt-0.5">{caseData.pickupLocation.landmark}</p>
              )}
            </div>
          </div>
        </div>

        {/* Destination - only for ambulance (hospital) and police (station) */}
        {caseData.destination && (responderType === "ambulance" || responderType === "police") && (
          <div className="bg-green-50 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Destination</p>
                <p className="font-semibold text-gray-900 mt-0.5">{caseData.destination.name}</p>
                <p className="text-sm text-gray-600 mt-0.5">{caseData.destination.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* Time Info */}
        <div className="flex items-center justify-between text-sm text-gray-500 pt-2 border-t border-gray-100">
          <span>Assigned {timeAgo(caseData.assignedAt)}</span>
          {caseData.dispatchPhone && (
            <a
              href={`tel:${caseData.dispatchPhone}`}
              className={`flex items-center gap-1.5 ${responderColors.text} font-medium`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              Dispatch
            </a>
          )}
        </div>
      </div>

      {/* Navigate Button */}
      {onNavigate && (
        <button
          onClick={onNavigate}
          className={`w-full bg-gradient-to-r ${responderColors.gradient} text-white font-bold py-4 flex items-center justify-center gap-2 active:opacity-90 transition-opacity`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          Navigate to Location
        </button>
      )}
    </div>
  );
}
