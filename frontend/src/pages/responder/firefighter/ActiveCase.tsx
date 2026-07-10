/**
 * ActiveCase - Firefighter's main case view
 * Shows fire emergency with AI recommendations
 */

import { useNavigate } from "react-router-dom";
import { ChevronRight, Wrench } from "lucide-react";
import { useResponderStore } from "../../../store/responderStore";
import {
  ActiveCaseCard,
  AIRecommendationBanner,
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
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-28">
      {/* Active Case Card */}
      <ActiveCaseCard
        caseData={activeCase}
        responderType="firefighter"
        onNavigate={handleNavigate}
      />

      {/* AI Recommendations */}
      <AIRecommendationBanner
        recommendations={activeCase.aiRecommendations ?? []}
        variant="warning"
      />

      {/* Equipment Quick Link */}
      {activeCase.requiredEquipment && activeCase.requiredEquipment.length > 0 && (
        <button
          type="button"
          onClick={() => navigate("/firefighter/equipment")}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-edge bg-accent-soft p-4 text-start shadow-1 transition-colors hover:border-edge-strong active:opacity-90 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-on-accent-soft"
            >
              <Wrench className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold text-on-accent-soft">
                Required Equipment
              </span>
              <span className="block text-sm font-semibold text-ink-muted">
                {activeCase.requiredEquipment.length} items to prepare
              </span>
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-on-accent-soft rtl:-scale-x-100"
          />
        </button>
      )}

      {/* Status Action Button — pinned above the tab bar */}
      <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-lg">
        <CaseStatusButton
          currentStatus={activeCase.status}
          responderType="firefighter"
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
