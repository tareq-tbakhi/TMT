/**
 * Equipment - Firefighter equipment checklist
 * AI-recommended gear with checkboxes for preparation
 */

import { useNavigate } from "react-router-dom";
import { useResponderStore } from "../../../store/responderStore";
import { EquipmentChecklist } from "../../../components/responder";

export default function FirefighterEquipment() {
  const navigate = useNavigate();
  const { activeCase } = useResponderStore();

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
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
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-600">🔥</span>
          <span className="text-sm font-medium text-red-700">{activeCase.caseNumber}</span>
        </div>
        <p className="font-semibold text-red-800">{activeCase.briefDescription}</p>
      </div>

      {/* Equipment Checklist */}
      {equipment.length > 0 ? (
        <EquipmentChecklist
          equipment={equipment}
          title="Firefighting Equipment"
        />
      ) : (
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-gray-500">No specific equipment required</p>
        </div>
      )}

      {/* Navigate Button */}
      <button
        onClick={() => navigate("/firefighter/map")}
        className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:opacity-90 transition-opacity shadow-lg"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        View on Map
      </button>
    </div>
  );
}
