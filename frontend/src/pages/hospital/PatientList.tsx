import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Accessibility,
  BedDouble,
  CircleHelp,
  Footprints,
  LayoutGrid,
  MapPin,
  Search,
  SearchX,
  Table2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  type BadgeTone,
} from "../../components/ui";
import StatusBadge from "../../components/common/StatusBadge";
import { timeAgo } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface PatientRow {
  id: string;
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  mobility: string;
  living_situation: string;
  blood_type: string | null;
  gender: string | null;
  date_of_birth: string | null;
  chronic_conditions: string[];
  allergies: string[];
  emergency_contacts?: Record<string, unknown>[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type ViewMode = "table" | "card";

const mobilityConfig: Record<
  string,
  { label: string; tone: BadgeTone; icon: LucideIcon; border: string }
> = {
  can_walk: { label: "Can Walk", tone: "success", icon: Footprints, border: "border-s-success" },
  wheelchair: { label: "Wheelchair", tone: "high", icon: Accessibility, border: "border-s-sev-high" },
  bedridden: { label: "Bedridden", tone: "critical", icon: BedDouble, border: "border-s-sev-critical" },
  other: { label: "Other", tone: "medium", icon: CircleHelp, border: "border-s-sev-medium" },
};

const PatientList: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mobilityFilter, setMobilityFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const fetchPatients = useCallback(async () => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mobilityFilter) params.set("mobility", mobilityFilter);

    try {
      setLoading(true);
      const res = await fetch(
        `${API_URL}/api/v1/patients?${params.toString()}`,
        { headers }
      );
      if (res.status === 401) {
        localStorage.removeItem("tmt-token");
        localStorage.removeItem("tmt-user");
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as PatientRow[];
        setPatients(data);
      } else {
        setError("Failed to load patients");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients");
    } finally {
      setLoading(false);
    }
  }, [search, mobilityFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPatients();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchPatients]);

  const isVulnerable = (mobility: string) =>
    mobility === "bedridden" || mobility === "wheelchair" || mobility === "other";

  const getMobilityInfo = (mobility: string) =>
    mobilityConfig[mobility] ?? {
      label: mobility,
      tone: "neutral" as BadgeTone,
      icon: CircleHelp,
      border: "border-s-edge",
    };

  const handleRowClick = (id: string) => {
    navigate(`/dashboard/patients/${id}`);
  };

  const locationText = (p: PatientRow) => {
    if (p.location_name) return p.location_name;
    if (p.latitude == null || p.longitude == null) return "Unknown";
    return `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`;
  };

  const viewToggleClasses = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
      active ? "bg-surface text-ink shadow-1" : "text-ink-muted hover:text-ink"
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users />}
        title={t("patients.title")}
        description={`${patients.length} patients registered`}
        actions={
          <div className="flex rounded-lg bg-surface-2 p-1" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
              className={viewToggleClasses(viewMode === "table")}
            >
              <Table2 aria-hidden="true" className="h-4 w-4" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("card")}
              aria-pressed={viewMode === "card"}
              className={viewToggleClasses(viewMode === "card")}
            >
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
              Cards
            </button>
          </div>
        }
      />

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            label="Search patients"
            hideLabel
            type="text"
            placeholder={t("patients.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 [&_input]:ps-10"
          />
        </div>
        <Select
          label="Mobility filter"
          hideLabel
          value={mobilityFilter}
          onChange={(e) => setMobilityFilter(e.target.value)}
          className="sm:w-48"
        >
          <option value="">All Mobility</option>
          <option value="can_walk">Can Walk</option>
          <option value="wheelchair">Wheelchair</option>
          <option value="bedridden">Bedridden</option>
          <option value="other">Other</option>
        </Select>
      </div>

      {/* Loading */}
      {loading && <LoadingState label="Loading patients" />}

      {/* Error */}
      {error && !loading && (
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-danger-soft">
              <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchPatients}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Table View */}
      {!loading && !error && viewMode === "table" && (
        <Card flush className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge bg-surface-2">
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("patients.name")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("patients.location")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("patients.mobility")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    Blood Type
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    Vulnerability
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4">
                      <EmptyState
                        icon={<SearchX />}
                        title="No patients found"
                        description="Try adjusting your search or mobility filter."
                        className="border-0 bg-transparent"
                      />
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => {
                    const mobility = getMobilityInfo(patient.mobility);
                    const vulnerable = isVulnerable(patient.mobility);
                    const MobilityIcon = mobility.icon;
                    return (
                      <tr
                        key={patient.id}
                        onClick={() => handleRowClick(patient.id)}
                        className={`cursor-pointer transition-colors hover:bg-surface-2 ${
                          vulnerable ? `border-s-4 ${mobility.border}` : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(patient.id);
                            }}
                            className="rounded-sm text-start focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                          >
                            <p className="font-semibold text-ink">
                              {patient.name}
                            </p>
                            <p className="text-xs text-ink-muted" dir="ltr">
                              {patient.phone}
                            </p>
                          </button>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-sm text-ink-muted" title={locationText(patient)}>
                          {locationText(patient)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={mobility.tone} size="sm" icon={<MobilityIcon />}>
                            {mobility.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {patient.blood_type || "--"}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink-muted">
                          {timeAgo(patient.updated_at)}
                        </td>
                        <td className="px-4 py-3">
                          {vulnerable ? (
                            <StatusBadge
                              severity={
                                patient.mobility === "bedridden"
                                  ? "critical"
                                  : "high"
                              }
                              size="sm"
                            />
                          ) : (
                            <span className="text-xs text-ink-faint">--</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Card View */}
      {!loading && !error && viewMode === "card" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title="No patients found"
              description="Try adjusting your search or mobility filter."
              className="col-span-full"
            />
          ) : (
            patients.map((patient) => {
              const mobility = getMobilityInfo(patient.mobility);
              const vulnerable = isVulnerable(patient.mobility);
              const MobilityIcon = mobility.icon;
              return (
                <Card
                  key={patient.id}
                  interactive
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(patient.id)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(patient.id);
                    }
                  }}
                  className={vulnerable ? `border-s-4 ${mobility.border}` : ""}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink">
                        {patient.name}
                      </h3>
                      <p className="text-xs text-ink-muted" dir="ltr">{patient.phone}</p>
                    </div>
                    {vulnerable && (
                      <StatusBadge
                        severity={
                          patient.mobility === "bedridden" ? "critical" : "high"
                        }
                        size="sm"
                      />
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center gap-2 text-ink-muted">
                      <span className="w-16 text-xs font-semibold text-ink-faint">
                        Location
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                        <span className="max-w-[140px] truncate" title={locationText(patient)}>
                          {locationText(patient)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-ink-muted">
                      <span className="w-16 text-xs font-semibold text-ink-faint">
                        Mobility
                      </span>
                      <Badge tone={mobility.tone} size="sm" icon={<MobilityIcon />}>
                        {mobility.label}
                      </Badge>
                    </div>
                    {patient.blood_type && (
                      <div className="flex items-start gap-2 text-ink-muted">
                        <span className="w-16 text-xs font-semibold text-ink-faint">
                          Blood
                        </span>
                        <span className="text-xs font-semibold text-ink">
                          {patient.blood_type}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Medical tags (quick glance) */}
                  {((patient.chronic_conditions?.length ?? 0) > 0 ||
                    (patient.allergies?.length ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(patient.chronic_conditions ?? []).slice(0, 2).map((c, i) => (
                        <Badge key={`c-${i}`} tone="danger" size="sm">
                          {c}
                        </Badge>
                      ))}
                      {(patient.allergies ?? []).slice(0, 2).map((a, i) => (
                        <Badge key={`a-${i}`} tone="warning" size="sm">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 border-t border-edge pt-2 text-xs text-ink-faint">
                    Updated {timeAgo(patient.updated_at)}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default PatientList;
