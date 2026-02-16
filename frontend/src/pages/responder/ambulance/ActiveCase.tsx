/**
 * ActiveCase - Ambulance driver's main case view
 * Shows current assignment with patient info and destination hospital
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
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
    <div className="p-4 space-y-4 pb-24">
      {/* Active Case Card */}
      <ActiveCaseCard
        caseData={activeCase}
        responderType="ambulance"
        onNavigate={handleNavigate}
      />

      {/* Status Action Button */}
      <div className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="ambulance"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
