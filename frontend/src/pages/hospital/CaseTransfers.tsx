import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Inbox,
  MoveDownLeft,
  MoveUpRight,
  Plus,
  RefreshCw,
  Send,
  TriangleAlert,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useSocketEvent } from "../../contexts/SocketContext";
import { timeAgo } from "../../utils/formatting";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
  announce,
  type BadgeTone,
} from "../../components/ui";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Types ──────────────────────────────────────────────────────

interface Transfer {
  id: string;
  sos_request_id: string;
  alert_id: string | null;
  from_facility_id: string;
  to_facility_id: string;
  from_department: string;
  to_department: string;
  reason: string | null;
  status: string;
  transferred_by: string;
  accepted_by: string | null;
  created_at: string | null;
  resolved_at: string | null;
  // Additive backend fields (patient transfer details + timeline)
  patient_ref?: string | null;
  urgency?: string | null;
  medical_notes?: string | null;
  accepted_facility_id?: string | null;
  accepted_at?: string | null;
  in_transit_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  from_facility_name?: string | null;
  to_facility_name?: string | null;
  accepted_facility_name?: string | null;
}

interface Facility {
  id: string;
  name: string;
  department_type: string;
  status: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Status / department metadata ───────────────────────────────

const STATUS_FILTERS = ["", "pending", "accepted", "in_transit", "completed", "rejected", "cancelled"];

const STATUS_META: Record<string, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Clock },
  accepted: { tone: "info", icon: Check },
  in_transit: { tone: "accent", icon: Truck },
  completed: { tone: "success", icon: CircleCheck },
  rejected: { tone: "danger", icon: CircleX },
  cancelled: { tone: "neutral", icon: Ban },
};

const URGENCY_TONES: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const deptTone: Record<string, BadgeTone> = {
  hospital: "accent",
  police: "info",
  civil_defense: "high",
};

// ─── Timeline ───────────────────────────────────────────────────

interface TimelineStep {
  key: string;
  labelKey: string;
  at: string | null;
  state: "done" | "current" | "upcoming" | "terminal-negative";
}

function buildTimeline(t: Transfer): TimelineStep[] {
  const requested: TimelineStep = {
    key: "requested",
    labelKey: "transfer.step.requested",
    at: t.created_at,
    state: "done",
  };

  if (t.status === "rejected") {
    return [
      requested,
      {
        key: "rejected",
        labelKey: "transfer.step.rejected",
        at: t.resolved_at,
        state: "terminal-negative",
      },
    ];
  }

  if (t.status === "cancelled") {
    const steps: TimelineStep[] = [requested];
    if (t.accepted_at) {
      steps.push({ key: "accepted", labelKey: "transfer.step.accepted", at: t.accepted_at, state: "done" });
    }
    if (t.in_transit_at) {
      steps.push({ key: "in_transit", labelKey: "transfer.step.inTransit", at: t.in_transit_at, state: "done" });
    }
    steps.push({
      key: "cancelled",
      labelKey: "transfer.step.cancelled",
      at: t.cancelled_at ?? t.resolved_at,
      state: "terminal-negative",
    });
    return steps;
  }

  const order = ["pending", "accepted", "in_transit", "completed"];
  const idx = Math.max(order.indexOf(t.status), 0);
  const stepFor = (
    key: string,
    labelKey: string,
    at: string | null | undefined,
    pos: number
  ): TimelineStep => ({
    key,
    labelKey,
    at: at ?? null,
    state: pos <= idx ? "done" : pos === idx + 1 ? "current" : "upcoming",
  });

  return [
    requested,
    stepFor("accepted", "transfer.step.accepted", t.accepted_at, 1),
    stepFor("in_transit", "transfer.step.inTransit", t.in_transit_at, 2),
    stepFor("completed", "transfer.step.completed", t.completed_at, 3),
  ];
}

const TransferTimeline: React.FC<{ transfer: Transfer }> = ({ transfer }) => {
  const { t } = useTranslation();
  const steps = buildTimeline(transfer);

  return (
    <ol
      aria-label={t("transfer.timeline")}
      className="flex flex-wrap items-start gap-x-1 gap-y-2 rounded-lg bg-surface-2 p-3"
    >
      {steps.map((step, i) => {
        const done = step.state === "done";
        const negative = step.state === "terminal-negative";
        const current = step.state === "current";
        const Icon = negative ? CircleX : done ? CircleCheck : current ? Clock : Circle;
        return (
          <li key={step.key} className="flex items-start" aria-current={current ? "step" : undefined}>
            <span className="flex flex-col items-center gap-0.5 px-1 text-center">
              <Icon
                aria-hidden="true"
                className={`h-5 w-5 ${
                  negative
                    ? "text-danger"
                    : done
                      ? "text-success"
                      : current
                        ? "text-accent"
                        : "text-ink-faint"
                }`}
              />
              <span
                className={`text-xs font-semibold ${
                  done || negative || current ? "text-ink" : "text-ink-faint"
                }`}
              >
                {t(step.labelKey)}
              </span>
              <span className="text-xs text-ink-muted">
                {step.at ? timeAgo(step.at) : done || negative ? "" : t("transfer.stepPending")}
              </span>
            </span>
            {i < steps.length - 1 && (
              <ArrowRight
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 text-ink-faint rtl:rotate-180"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};

// ─── Transfer card ──────────────────────────────────────────────

interface TransferCardProps {
  transfer: Transfer;
  facilityId: string;
  isSuper: boolean;
  actionLoading: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const TransferCard: React.FC<TransferCardProps> = ({
  transfer,
  facilityId,
  isSuper,
  actionLoading,
  onAccept,
  onReject,
  onStatusChange,
}) => {
  const { t } = useTranslation();
  const incoming = transfer.to_facility_id === facilityId;
  const outgoing = transfer.from_facility_id === facilityId;
  const isPending = transfer.status === "pending";
  const loading = actionLoading === transfer.id;
  const meta = STATUS_META[transfer.status] ?? { tone: "neutral" as BadgeTone, icon: Circle };
  const StatusIcon = meta.icon;

  const canAccept = isPending && (incoming || isSuper);
  const canStartTransit = transfer.status === "accepted" && (incoming || isSuper);
  const canComplete = transfer.status === "in_transit" && (incoming || outgoing || isSuper);
  const canCancel = (isPending || transfer.status === "accepted") && (outgoing || isSuper);

  const deptLabel = (d: string) => t(`transfer.dept.${d}`, d);

  return (
    <Card className={incoming && isPending ? "border-s-4 border-s-warning" : ""}>
      <div className="flex flex-col gap-3">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={incoming ? "success" : "accent"}
            size="sm"
            icon={incoming ? <MoveDownLeft /> : <MoveUpRight />}
          >
            {incoming ? t("transfer.incoming") : t("transfer.outgoing")}
          </Badge>
          <Badge tone={meta.tone} size="sm" icon={<StatusIcon />}>
            {t(`transfer.status.${transfer.status}`, transfer.status)}
          </Badge>
          {transfer.urgency && (
            <Badge tone={URGENCY_TONES[transfer.urgency] ?? "neutral"} size="sm" dot>
              {t(`aid.urg.${transfer.urgency}`, transfer.urgency)}
            </Badge>
          )}
        </div>

        {/* Patient reference */}
        {transfer.patient_ref && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <UserRound aria-hidden="true" className="h-4 w-4 text-ink-faint" />
            {t("transfer.patient")}: {transfer.patient_ref}
          </p>
        )}

        {/* Routing */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={deptTone[transfer.from_department] ?? "neutral"} size="sm">
            {transfer.from_facility_name || deptLabel(transfer.from_department)}
          </Badge>
          <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-faint rtl:rotate-180" />
          <Badge tone={deptTone[transfer.to_department] ?? "neutral"} size="sm">
            {transfer.to_facility_name || deptLabel(transfer.to_department)}
          </Badge>
        </div>

        {/* Details */}
        <div className="space-y-0.5 text-xs text-ink-muted">
          <p>
            {t("transfer.sosRef")}:{" "}
            <span className="font-mono" dir="ltr">
              {transfer.sos_request_id.slice(0, 8)}...
            </span>
          </p>
          {transfer.reason && (
            <p>
              {t("transfer.reason")}: {transfer.reason}
            </p>
          )}
          {transfer.medical_notes && (
            <p className="whitespace-pre-wrap">
              {t("transfer.notes")}: {transfer.medical_notes}
            </p>
          )}
          {transfer.created_at && <p>{timeAgo(transfer.created_at)}</p>}
        </div>

        {/* Status timeline */}
        <TransferTimeline transfer={transfer} />

        {/* Actions */}
        {(canAccept || canStartTransit || canComplete || canCancel) && (
          <div className="flex flex-wrap gap-2">
            {canAccept && (
              <>
                <Button
                  variant="success"
                  icon={<Check />}
                  loading={loading}
                  onClick={() => onAccept(transfer.id)}
                >
                  {t("transfer.accept")}
                </Button>
                <Button
                  variant="secondary"
                  icon={<X />}
                  className="text-danger"
                  loading={loading}
                  onClick={() => onReject(transfer.id)}
                >
                  {t("transfer.reject")}
                </Button>
              </>
            )}
            {canStartTransit && (
              <Button
                icon={<Truck />}
                loading={loading}
                onClick={() => onStatusChange(transfer.id, "in_transit")}
              >
                {t("transfer.startTransit")}
              </Button>
            )}
            {canComplete && (
              <Button
                variant="success"
                icon={<CircleCheck />}
                loading={loading}
                onClick={() => onStatusChange(transfer.id, "completed")}
              >
                {t("transfer.markCompleted")}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="secondary"
                icon={<Ban />}
                loading={loading}
                onClick={() => onStatusChange(transfer.id, "cancelled")}
              >
                {t("transfer.cancel")}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// ─── Main page ──────────────────────────────────────────────────

const CaseTransfers: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const facilityId = user?.hospitalId ?? "";
  const isSuper = user?.role === "super_admin";

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Create transfer modal
  const [createOpen, setCreateOpen] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sosId, setSosId] = useState("");
  const [alertId, setAlertId] = useState("");
  const [patientRef, setPatientRef] = useState("");
  const [urgency, setUrgency] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [targetFacilityId, setTargetFacilityId] = useState("");
  const [targetDept, setTargetDept] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      setNotification({ type, message });
      setTimeout(() => setNotification(null), 4000);
    },
    []
  );

  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status_filter", statusFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_URL}/api/v1/transfers${qs}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail || t("transfer.loadFailed")
        );
      }
      const data = await res.json();
      setTransfers(data.transfers ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("transfer.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  const fetchFacilities = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/hospitals`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFacilities(
          (data.hospitals ?? []).filter((f: Facility) => f.id !== facilityId)
        );
      }
    } catch {
      // non-blocking
    }
  }, [facilityId]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // ── Real-time updates via shared socket ────────────────────

  const mergeTransfer = useCallback((incoming: Transfer) => {
    setTransfers((prev) => {
      if (prev.some((x) => x.id === incoming.id)) {
        return prev.map((x) => (x.id === incoming.id ? { ...x, ...incoming } : x));
      }
      return [incoming, ...prev];
    });
  }, []);

  useSocketEvent<Transfer>("new_transfer", (data) => {
    announce(t("transfer.createdMsg"), "polite");
    mergeTransfer(data);
    setTotal((prev) => prev + 1);
  });

  useSocketEvent<Transfer>("transfer_incoming", (data) => {
    announce(t("transfer.createdMsg"), "polite");
    mergeTransfer(data);
  });

  useSocketEvent<Transfer>("transfer_updated", (data) => {
    mergeTransfer(data);
  });

  // ── Actions ─────────────────────────────────────────────────

  const doAction = useCallback(
    async (
      id: string,
      path: string,
      method: string,
      body: unknown,
      successMsg: string
    ) => {
      setActionLoading(id);
      try {
        const res = await fetch(`${API_URL}/api/v1/transfers/${id}${path}`, {
          method,
          headers: getAuthHeaders(),
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (res.ok) {
          const updated = (await res.json()) as Transfer;
          mergeTransfer(updated);
          showNotification("success", successMsg);
          announce(successMsg, "polite");
        } else {
          const err = await res.json().catch(() => ({}));
          showNotification(
            "error",
            (err as { detail?: string }).detail || t("transfer.actionFailed")
          );
        }
      } catch {
        showNotification("error", t("transfer.networkError"));
      } finally {
        setActionLoading(null);
      }
    },
    [mergeTransfer, showNotification, t]
  );

  const handleAccept = (id: string) =>
    doAction(id, "/accept", "PUT", undefined, t("transfer.acceptedMsg"));

  const handleReject = (id: string) =>
    doAction(id, "/reject", "PUT", { reason: null }, t("transfer.rejectedMsg"));

  const handleStatusChange = (id: string, status: string) =>
    doAction(id, "/status", "PUT", { status }, t("transfer.updatedMsg"));

  // ── Create ──────────────────────────────────────────────────

  const openCreateModal = () => {
    setSosId("");
    setAlertId("");
    setPatientRef("");
    setUrgency("");
    setMedicalNotes("");
    setTargetFacilityId("");
    setTargetDept("");
    setReason("");
    setCreateOpen(true);
    fetchFacilities();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sosId.trim() || !targetFacilityId || !targetDept) return;
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        sos_request_id: sosId.trim(),
        to_facility_id: targetFacilityId,
        to_department: targetDept,
        reason: reason.trim() || undefined,
      };
      if (alertId.trim()) body.alert_id = alertId.trim();
      if (patientRef.trim()) body.patient_ref = patientRef.trim();
      if (urgency) body.urgency = urgency;
      if (medicalNotes.trim()) body.medical_notes = medicalNotes.trim();

      const res = await fetch(`${API_URL}/api/v1/transfers`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = (await res.json()) as Transfer;
        mergeTransfer(created);
        setTotal((prev) => prev + 1);
        showNotification("success", t("transfer.createdMsg"));
        setCreateOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(
          "error",
          (err as { detail?: string }).detail || t("transfer.actionFailed")
        );
      }
    } catch {
      showNotification("error", t("transfer.networkError"));
    } finally {
      setCreating(false);
    }
  };

  // ── Board sections ──────────────────────────────────────────

  const { incomingOpen, ownAndTracked } = useMemo(() => {
    const incoming: Transfer[] = [];
    const rest: Transfer[] = [];
    for (const tr of transfers) {
      if (tr.status === "pending" && tr.to_facility_id === facilityId && !isSuper) {
        incoming.push(tr);
      } else {
        rest.push(tr);
      }
    }
    return { incomingOpen: incoming, ownAndTracked: rest };
  }, [transfers, facilityId, isSuper]);

  const renderCard = (tr: Transfer) => (
    <TransferCard
      key={tr.id}
      transfer={tr}
      facilityId={facilityId}
      isSuper={isSuper}
      actionLoading={actionLoading}
      onAccept={handleAccept}
      onReject={handleReject}
      onStatusChange={handleStatusChange}
    />
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Notification toast */}
      {notification && (
        <div
          role="status"
          className={`fixed end-4 top-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-2 ${
            notification.type === "success"
              ? "border-success bg-success-soft text-on-success-soft"
              : "border-danger bg-danger-soft text-on-danger-soft"
          }`}
        >
          {notification.type === "success" ? (
            <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      <PageHeader
        icon={<ArrowLeftRight />}
        title={t("transfer.title")}
        description={t("transfer.subtitle")}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw />} onClick={fetchTransfers}>
              {t("common.refresh")}
            </Button>
            <Button icon={<Plus />} onClick={openCreateModal}>
              {t("transfer.newTransfer")}
            </Button>
          </>
        }
      />

      {/* Status filter chips */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("transfer.filterLabel")}
      >
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              statusFilter === s
                ? "border-transparent bg-accent text-on-accent"
                : "border-edge-strong bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {s === "" ? t("transfer.statusAll") : t(`transfer.status.${s}`, s)}
          </button>
        ))}
      </div>

      {/* Result count */}
      <p className="text-sm text-ink-muted" role="status">
        {t("transfer.totalLabel", { count: total })}
      </p>

      {/* Loading */}
      {loading && <LoadingState label={t("transfer.loading")} />}

      {/* Error + retry */}
      {error && !loading && (
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-danger-soft">
              <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchTransfers}>
              {t("common.retry")}
            </Button>
          </div>
        </Card>
      )}

      {/* Board */}
      {!loading && !error && (
        <>
          {transfers.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={t("transfer.empty")}
              description={t("transfer.emptyDesc")}
              action={
                <Button variant="secondary" icon={<Plus />} onClick={openCreateModal}>
                  {t("transfer.newTransfer")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {/* Section 1 — open requests from other facilities */}
              {incomingOpen.length > 0 && (
                <section aria-labelledby="transfers-incoming-heading" className="space-y-3">
                  <div>
                    <h2
                      id="transfers-incoming-heading"
                      className="text-base font-bold text-ink"
                    >
                      {t("transfer.boardIncoming")} ({incomingOpen.length})
                    </h2>
                    <p className="text-sm text-ink-muted">{t("transfer.boardIncomingDesc")}</p>
                  </div>
                  {incomingOpen.map(renderCard)}
                </section>
              )}

              {/* Section 2 — own & tracked transfers */}
              {ownAndTracked.length > 0 && (
                <section aria-labelledby="transfers-own-heading" className="space-y-3">
                  <div>
                    <h2 id="transfers-own-heading" className="text-base font-bold text-ink">
                      {t("transfer.boardMine")} ({ownAndTracked.length})
                    </h2>
                    <p className="text-sm text-ink-muted">{t("transfer.boardMineDesc")}</p>
                  </div>
                  {ownAndTracked.map(renderCard)}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Transfer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("transfer.createTitle")}
        description={t("transfer.createDescription")}
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            label={t("transfer.sosId")}
            required
            type="text"
            value={sosId}
            onChange={(e) => setSosId(e.target.value)}
            placeholder={t("transfer.sosIdPlaceholder")}
          />
          <Input
            label={t("transfer.alertId")}
            type="text"
            value={alertId}
            onChange={(e) => setAlertId(e.target.value)}
            placeholder={t("transfer.alertIdPlaceholder")}
          />
          <Input
            label={t("transfer.patientRef")}
            type="text"
            value={patientRef}
            onChange={(e) => setPatientRef(e.target.value)}
            placeholder={t("transfer.patientRefPlaceholder")}
          />
          <Select
            label={t("aid.urgency")}
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
          >
            <option value="">{t("transfer.selectUrgency")}</option>
            {["low", "medium", "high", "critical"].map((u) => (
              <option key={u} value={u}>
                {t(`aid.urg.${u}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t("transfer.targetDept")}
            required
            value={targetDept}
            onChange={(e) => {
              setTargetDept(e.target.value);
              setTargetFacilityId("");
            }}
          >
            <option value="">{t("transfer.selectDept")}</option>
            <option value="hospital">{t("transfer.dept.hospital")}</option>
            <option value="police">{t("transfer.dept.police")}</option>
            <option value="civil_defense">{t("transfer.dept.civil_defense")}</option>
          </Select>
          <Select
            label={t("transfer.targetFacility")}
            required
            value={targetFacilityId}
            onChange={(e) => setTargetFacilityId(e.target.value)}
          >
            <option value="">{t("transfer.selectFacility")}</option>
            {facilities
              .filter((f) => !targetDept || f.department_type === targetDept)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({t(`transfer.dept.${f.department_type}`, f.department_type)})
                </option>
              ))}
          </Select>
          <Textarea
            label={t("transfer.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t("transfer.reasonPlaceholder")}
          />
          <Textarea
            label={t("transfer.notes")}
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            rows={3}
            placeholder={t("transfer.notesPlaceholder")}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              icon={<Send />}
              loading={creating}
              disabled={creating || !sosId.trim() || !targetFacilityId || !targetDept}
            >
              {t("transfer.create")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CaseTransfers;
