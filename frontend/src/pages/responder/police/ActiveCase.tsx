/**
 * ActiveCase - Police officer's main case view
 * Shows current security incident with location and tactical info
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
  AIRecommendationBanner,
  CaseStatusButton,
  NoCaseView,
} from "../../../components/responder";

export default function PoliceActiveCase() {
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
    navigate("/police/map");
  };

  const handleLoadDemo = () => {
    loadDemoCase("police");
  };

  // No active case - show standby view
  if (!activeCase) {
    return (
      <NoCaseView
        responderType="police"
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
        responderType="police"
        onNavigate={handleNavigate}
      />

      {/* AI Recommendations */}
      <AIRecommendationBanner recommendations={activeCase.aiRecommendations ?? []} />

      {/* Status Action Button — pinned above the tab bar */}
      <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="police"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
