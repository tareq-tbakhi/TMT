/**
 * ActiveCase - Police officer's main case view
 * Shows current security incident with location and tactical info
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
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
    <div className="p-4 space-y-4 pb-24">
      {/* Active Case Card */}
      <ActiveCaseCard
        caseData={activeCase}
        responderType="police"
        onNavigate={handleNavigate}
      />

      {/* Status Action Button */}
      <div className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="police"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
