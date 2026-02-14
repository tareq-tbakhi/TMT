/**
 * PoliceLayout - Layout wrapper for police officer views
 */

import ResponderLayout from "../../../components/responder/ResponderLayout";

const POLICE_TABS = [
  { path: "", label: "Case", icon: "case" as const },
  { path: "/map", label: "Map", icon: "map" as const },
  { path: "/history", label: "History", icon: "history" as const },
];

export default function PoliceLayout() {
  return <ResponderLayout responderType="police" tabs={POLICE_TABS} />;
}
