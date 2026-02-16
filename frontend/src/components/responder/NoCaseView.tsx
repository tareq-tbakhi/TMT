/**
 * NoCaseView - Shown when no active case is assigned
 * Displays standby status with connection indicator
 */

import { RESPONDER_COLORS, RESPONDER_LABELS, type ResponderType } from "../../store/authStore";

interface NoCaseViewProps {
  responderType: ResponderType;
  isConnected: boolean;
  onLoadDemo?: () => void;
}

export default function NoCaseView({ responderType, isConnected, onLoadDemo }: NoCaseViewProps) {
  const colors = RESPONDER_COLORS[responderType];
  const label = RESPONDER_LABELS[responderType];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      {/* Status Icon */}
      <div className={`w-24 h-24 bg-gradient-to-br ${colors.gradient} rounded-3xl flex items-center justify-center mb-6 shadow-lg`}>
        {isConnected ? (
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        ) : (
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        )}
      </div>

      {/* Status Text */}
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {isConnected ? "Standing By" : "Connection Lost"}
      </h2>
      <p className="text-gray-500 mb-6 max-w-xs">
        {isConnected
          ? `Waiting for ${label.toLowerCase()} dispatch. You'll be notified when a case is assigned.`
          : "Trying to reconnect to dispatch. Please check your connection."}
      </p>

      {/* Connection Status */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isConnected ? "bg-green-100" : "bg-red-100"}`}>
        <span className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
        <span className={`font-medium ${isConnected ? "text-green-700" : "text-red-700"}`}>
          {isConnected ? "Connected to Dispatch" : "Reconnecting..."}
        </span>
      </div>

      {/* Demo Button (for development) */}
      {onLoadDemo && (
        <button
          onClick={onLoadDemo}
          className={`mt-8 bg-gradient-to-r ${colors.gradient} text-white font-bold py-3 px-6 rounded-xl shadow-lg active:scale-95 transition-transform`}
        >
          Load Demo Case
        </button>
      )}
    </div>
  );
}
