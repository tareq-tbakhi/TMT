/**
 * CivilDefenseLayout - Layout wrapper for civil defense responder views
 * Includes Equipment tab for AI-recommended gear
 */

import ResponderLayout from "../../../components/responder/ResponderLayout";

const CIVIL_DEFENSE_TABS = [
  { path: "", label: "Case", icon: "case" as const },
  { path: "/equipment", label: "Equipment", icon: "equipment" as const },
  { path: "/map", label: "Map", icon: "map" as const },
];

export default function CivilDefenseLayout() {
  return <ResponderLayout responderType="civil_defense" tabs={CIVIL_DEFENSE_TABS} />;
}
