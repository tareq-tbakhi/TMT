/**
 * AmbulanceLayout - Layout wrapper for ambulance driver views
 */

import ResponderLayout from "../../../components/responder/ResponderLayout";

const AMBULANCE_TABS = [
  { path: "", label: "Case", icon: "case" as const },
  { path: "/map", label: "Map", icon: "map" as const },
  { path: "/history", label: "History", icon: "history" as const },
];

export default function AmbulanceLayout() {
  return <ResponderLayout responderType="ambulance" tabs={AMBULANCE_TABS} />;
}
