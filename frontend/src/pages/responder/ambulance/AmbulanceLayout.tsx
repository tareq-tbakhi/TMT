/**
 * AmbulanceLayout - Layout wrapper for ambulance driver views
 */

import ResponderLayout from "../../../components/responder/ResponderLayout";
import { useAccent } from "../../../contexts/PreferencesContext";

const AMBULANCE_TABS = [
  { path: "", label: "Case", icon: "case" as const },
  { path: "/map", label: "Map", icon: "map" as const },
  { path: "/history", label: "History", icon: "history" as const },
];

export default function AmbulanceLayout() {
  // Ambulance uses the patient (medical) accent palette
  useAccent("patient");
  return <ResponderLayout responderType="ambulance" tabs={AMBULANCE_TABS} />;
}
