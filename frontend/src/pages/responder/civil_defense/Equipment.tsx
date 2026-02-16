/**
 * Equipment - Civil Defense equipment checklist
 * AI-recommended gear with checkboxes for preparation
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import { EquipmentChecklist } from "../../../components/responder";

export default function CivilDefenseEquipment() {
  const navigate = useNavigate();
  const { activeCase } = useResponderStore();

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Active Case</h3>
        <p className="text-gray-500">Equipment list appears when assigned</p>
      </div>
    );
  }

  const equipment = activeCase.requiredEquipment || [];

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Case Context */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-orange-600">🆘</span>
          <span className="text-sm font-medium text-orange-700">{activeCase.caseNumber}</span>
        </div>
        <p className="font-semibold text-orange-800">{activeCase.briefDescription}</p>
      </div>

      {/* Equipment Checklist */}
      {equipment.length > 0 ? (
        <EquipmentChecklist
          equipment={equipment}
          title="Required Equipment"
        />
      ) : (
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-gray-500">No specific equipment required</p>
        </div>
      )}

      {/* Navigate Button */}
      <button
        onClick={() => navigate("/civil_defense/map")}
        className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:opacity-90 transition-opacity shadow-lg"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        View on Map
      </button>
    </div>
  );
}
