/**
 * ActiveCase - Firefighter's main case view
 * Shows fire emergency with AI recommendations
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
  CaseStatusButton,
  NoCaseView,
} from "../../../components/responder";

export default function FirefighterActiveCase() {
  const navigate = useNavigate();
  const { activeCase, isConnected, updateCaseStatus, completeCase, loadDemoCase } = useResponderStore();

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "completed") {
      completeCase();
    } else {
      updateCaseStatus(newStatus as any);
    }
  };

  const handleNavigate = () => {
    navigate("/firefighter/map");
  };

  const handleLoadDemo = () => {
    loadDemoCase("firefighter");
  };

  // No active case - show standby view
  if (!activeCase) {
    return (
      <NoCaseView
        responderType="firefighter"
        isConnected={isConnected}
        onLoadDemo={handleLoadDemo}
      />
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Active Case Card */}
      <ActiveCaseCard
        caseData={activeCase}
        responderType="firefighter"
        onNavigate={handleNavigate}
      />

      {/* Equipment Quick Link */}
      {activeCase.requiredEquipment && activeCase.requiredEquipment.length > 0 && (
        <button
          onClick={() => navigate("/firefighter/equipment")}
          className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between active:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-bold text-red-800">Required Equipment</p>
              <p className="text-sm text-red-600">{activeCase.requiredEquipment.length} items to prepare</p>
            </div>
          </div>
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Status Action Button */}
      <div className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="firefighter"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
