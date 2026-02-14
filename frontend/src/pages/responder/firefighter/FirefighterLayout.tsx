/**
 * FirefighterLayout - Layout wrapper for firefighter views
 * Includes Equipment tab for AI-recommended gear
 */

import ResponderLayout from "../../../components/responder/ResponderLayout";

const FIREFIGHTER_TABS = [
  { path: "", label: "Case", icon: "case" as const },
  { path: "/equipment", label: "Equipment", icon: "equipment" as const },
  { path: "/map", label: "Map", icon: "map" as const },
];

export default function FirefighterLayout() {
  return <ResponderLayout responderType="firefighter" tabs={FIREFIGHTER_TABS} />;
}
