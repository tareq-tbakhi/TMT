/**
 * Equipment - Civil Defense equipment checklist
 * AI-recommended gear with checkboxes for preparation
 */

import { useNavigate } from "react-router-dom";
import { LifeBuoy, MapPin, PackageCheck } from "lucide-react";
import { useResponderStore } from "../../../store/responderStore";
import { EquipmentChecklist } from "../../../components/responder";
import { Button, EmptyState } from "../../../components/ui";

export default function CivilDefenseEquipment() {
  const navigate = useNavigate();
  const { activeCase } = useResponderStore();

  if (!activeCase) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <EmptyState
          icon={<PackageCheck />}
          title="No Active Case"
          description="Equipment list appears when assigned"
        />
      </div>
    );
  }

  const equipment = activeCase.requiredEquipment || [];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-8">
      {/* Case Context */}
      <div className="rounded-lg bg-accent-soft p-4 shadow-1">
        <div className="flex items-center gap-2">
          <LifeBuoy aria-hidden="true" className="h-4 w-4 shrink-0 text-on-accent-soft" />
          <span className="text-sm font-bold text-on-accent-soft">{activeCase.caseNumber}</span>
        </div>
        <p className="mt-1 text-base font-bold text-ink">{activeCase.briefDescription}</p>
      </div>

      {/* Equipment Checklist */}
      {equipment.length > 0 ? (
        <EquipmentChecklist
          equipment={equipment}
          title="Required Equipment"
        />
      ) : (
        <EmptyState icon={<PackageCheck />} title="No specific equipment required" />
      )}

      {/* Navigate Button */}
      <Button
        size="xl"
        fullWidth
        icon={<MapPin />}
        onClick={() => navigate("/civil_defense/map")}
      >
        View on Map
      </Button>
    </div>
  );
}
