/**
 * ActiveCase - Ambulance driver's main case view
 * Shows current assignment with patient info and destination hospital
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
  AIRecommendationBanner,
  CaseStatusButton,
  NoCaseView,
} from "../../../components/responder";

export default function AmbulanceActiveCase() {
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
    navigate("/ambulance/map");
  };

  const handleLoadDemo = () => {
    loadDemoCase("ambulance");
  };

  // No active case - show standby view
  if (!activeCase) {
    return (
      <NoCaseView
        responderType="ambulance"
        isConnected={isConnected}
        onLoadDemo={handleLoadDemo}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-28">
      {/* Active Case Card */}
      <ActiveCaseCard
        caseData={activeCase}
        responderType="ambulance"
        onNavigate={handleNavigate}
      />

      {/* AI Recommendations */}
      <AIRecommendationBanner recommendations={activeCase.aiRecommendations ?? []} />

      {/* Status Action Button — pinned above the tab bar */}
      <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="ambulance"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
