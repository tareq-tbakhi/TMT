import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Droplet,
  HeartHandshake,
  Inbox,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Pill,
  Plus,
  RefreshCw,
  Send,
  Stethoscope,
  Timer,
  TriangleAlert,
  UserRound,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useSocketEvent } from "../../contexts/SocketContext";
import { timeAgo } from "../../utils/formatting";
import {
  getAidRequests,
  getAidRequestDetail,
  createAidRequest,
  updateAidRequestStatus,
  getHospitals,
} from "../../services/api";
import type { AidRequest, AidResponse, Hospital } from "../../services/api";
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
  Spinner,
  Textarea,
  announce,
  type BadgeTone,
} from "../../components/ui";

// ─── Extended API types (additive backend fields) ───────────────

interface AidResponseX extends AidResponse {
  responder_name?: string | null;
  responder_phone?: string | null;
  responder_user_id?: string | null;
}

interface AidRequestX extends Omit<AidRequest, "responses"> {
  expires_at?: string | null;
  is_expired?: boolean;
  responses?: AidResponseX[];
}

// ─── Local API helpers (new endpoints not yet in services/api) ──

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiCall<T>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: options?.method ?? "GET",
    headers: getAuthHeaders(),
    ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Request failed (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

const editAidRequestApi = (id: string, data: Record<string, unknown>) =>
  apiCall<AidRequestX>(`/aid-requests/${id}`, { method: "PUT", body: data });

const extendAidRequestApi = (
  id: string,
  data: { expires_at?: string; extend_hours?: number }
) => apiCall<AidRequestX>(`/aid-requests/${id}/extend`, { method: "PUT", body: data });

const respondToAidRequestApi = (
  id: string,
  data: { message?: string; eta_hours?: number }
) => apiCall<AidResponseX>(`/aid-requests/${id}/respond`, { method: "POST", body: data });

// ─── Date helpers ───────────────────────────────────────────────

/** Backend timestamps are naive UTC — normalize before Date math. */
function parseServerDate(iso: string): Date {
  return new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

function isPast(iso: string | null | undefined): boolean {
  return !!iso && parseServerDate(iso).getTime() <= Date.now();
}

function timeUntil(iso: string): string {
  const diff = parseServerDate(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function toDatetimeLocalValue(iso: string): string {
  const d = parseServerDate(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function requestIsExpired(req: AidRequestX): boolean {
  return (
    req.status === "expired" ||
    req.is_expired === true ||
    ((req.status === "open" || req.status === "responding") && isPast(req.expires_at))
  );
}

// ─── Constants ──────────────────────────────────────────────────

const CATEGORIES = [
  { value: "", labelKey: "aid.allCategories" },
  { value: "blood", labelKey: "aid.cat.blood" },
  { value: "medication", labelKey: "aid.cat.medication" },
  { value: "equipment", labelKey: "aid.cat.equipment" },
  { value: "personnel", labelKey: "aid.cat.personnel" },
  { value: "supplies", labelKey: "aid.cat.supplies" },
  { value: "volunteer", labelKey: "aid.cat.volunteer" },
  { value: "other", labelKey: "aid.cat.other" },
];

const URGENCIES = [
  { value: "", labelKey: "aid.allUrgencies" },
  { value: "low", labelKey: "aid.urg.low" },
  { value: "medium", labelKey: "aid.urg.medium" },
  { value: "high", labelKey: "aid.urg.high" },
  { value: "critical", labelKey: "aid.urg.critical" },
];

const STATUSES = [
  { value: "", labelKey: "aid.allStatuses" },
  { value: "open", labelKey: "aid.status.open" },
  { value: "responding", labelKey: "aid.status.responding" },
  { value: "fulfilled", labelKey: "aid.status.fulfilled" },
  { value: "expired", labelKey: "aid.status.expired" },
  { value: "cancelled", labelKey: "aid.status.cancelled" },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  blood: Droplet,
  medication: Pill,
  equipment: Wrench,
  personnel: Stethoscope,
  supplies: Package,
  volunteer: Users,
  other: ClipboardList,
};

const URGENCY_TONES: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "success",
};

const STATUS_TONES: Record<string, BadgeTone> = {
  open: "info",
  responding: "accent",
  fulfilled: "success",
  expired: "warning",
  cancelled: "neutral",
};

// ─── Create / Edit Request Modal ────────────────────────────────

interface RequestFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  /** Request being edited (edit mode only). */
  initial?: AidRequestX | null;
  onClose: () => void;
  onSaved: (req: AidRequestX) => void;
  defaultContactName?: string;
  defaultContactPhone?: string;
}

const emptyForm = {
  category: "supplies",
  title: "",
  description: "",
  urgency: "medium",
  quantity: "",
  unit: "",
  contact_phone: "",
  contact_name: "",
  expires_at: "",
};

const RequestFormModal: React.FC<RequestFormModalProps> = ({
  open,
  mode,
  initial,
  onClose,
  onSaved,
  defaultContactName = "",
  defaultContactPhone = "",
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Populate the form when opening: edit → from the request, create → defaults
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm({
        category: initial.category || "supplies",
        title: initial.title || "",
        description: initial.description || "",
        urgency: initial.urgency || "medium",
        quantity: initial.quantity || "",
        unit: initial.unit || "",
        contact_phone: initial.contact_phone || "",
        contact_name: initial.contact_name || "",
        expires_at: initial.expires_at ? toDatetimeLocalValue(initial.expires_at) : "",
      });
    } else {
      setForm({
        ...emptyForm,
        contact_name: defaultContactName,
        contact_phone: defaultContactPhone,
      });
    }
    setError(null);
  }, [open, mode, initial, defaultContactName, defaultContactPhone]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "edit" && initial) {
        const updated = await editAidRequestApi(initial.id, {
          category: form.category,
          title: form.title.trim(),
          description: form.description.trim() || null,
          urgency: form.urgency,
          quantity: form.quantity.trim() || null,
          unit: form.unit.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          contact_name: form.contact_name.trim() || null,
          expires_at: form.expires_at
            ? new Date(form.expires_at).toISOString()
            : null,
        });
        onSaved(updated);
      } else {
        const payload: Parameters<typeof createAidRequest>[0] & {
          expires_at?: string;
        } = {
          category: form.category,
          title: form.title.trim(),
          urgency: form.urgency,
        };
        if (form.description.trim()) payload.description = form.description.trim();
        if (form.quantity.trim()) payload.quantity = form.quantity.trim();
        if (form.unit.trim()) payload.unit = form.unit.trim();
        if (form.contact_phone.trim()) payload.contact_phone = form.contact_phone.trim();
        if (form.contact_name.trim()) payload.contact_name = form.contact_name.trim();
        if (form.expires_at) payload.expires_at = new Date(form.expires_at).toISOString();

        const created = (await createAidRequest(payload)) as AidRequestX;
        onSaved(created);
        setForm({ ...emptyForm });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? t("aid.saveFailed")
            : t("aid.createFailed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? t("aid.editRequest") : t("aid.newRequest")}
      description={mode === "edit" ? undefined : t("aid.createDescription")}
    >
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-danger bg-danger-soft p-3 text-sm font-semibold text-on-danger-soft"
        >
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Category & Urgency */}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t("aid.category")}
            name="category"
            value={form.category}
            onChange={handleChange}
          >
            {CATEGORIES.filter((c) => c.value).map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </Select>
          <Select
            label={t("aid.urgency")}
            name="urgency"
            value={form.urgency}
            onChange={handleChange}
          >
            {URGENCIES.filter((u) => u.value).map((u) => (
              <option key={u.value} value={u.value}>
                {t(u.labelKey)}
              </option>
            ))}
          </Select>
        </div>

        {/* Title */}
        <Input
          label={t("aid.requestTitle")}
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          placeholder={t("aid.titlePlaceholder")}
        />

        {/* Description */}
        <Textarea
          label={t("aid.description")}
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          placeholder={t("aid.descriptionPlaceholder")}
        />

        {/* Quantity & Unit */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t("aid.quantity")}
            type="text"
            name="quantity"
            value={form.quantity}
            onChange={handleChange}
            placeholder={t("aid.quantityPlaceholder")}
          />
          <Input
            label={t("aid.unit")}
            type="text"
            name="unit"
            value={form.unit}
            onChange={handleChange}
            placeholder={t("aid.unitPlaceholder")}
          />
        </div>

        {/* Expiry */}
        <Input
          label={t("aid.expiryLabel")}
          type="datetime-local"
          name="expires_at"
          value={form.expires_at}
          onChange={handleChange}
          hint={mode === "edit" ? t("aid.reopenHint") : undefined}
        />

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t("aid.contactName")}
            type="text"
            name="contact_name"
            value={form.contact_name}
            onChange={handleChange}
            placeholder={t("aid.contactPlaceholder")}
          />
          <Input
            label={t("aid.contactPhone")}
            type="text"
            name="contact_phone"
            value={form.contact_phone}
            onChange={handleChange}
            placeholder="+970..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={submitting || !form.title.trim()}
            icon={mode === "edit" ? <Check /> : <Send />}
          >
            {mode === "edit" ? t("aid.saveChanges") : t("aid.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Extend Expiry Modal ────────────────────────────────────────

interface ExtendModalProps {
  request: AidRequestX | null;
  onClose: () => void;
  onExtended: (req: AidRequestX) => void;
}

const EXTEND_PRESETS = ["6", "12", "24", "48", "72"];

const ExtendModal: React.FC<ExtendModalProps> = ({
  request,
  onClose,
  onExtended,
}) => {
  const { t } = useTranslation();
  const [preset, setPreset] = useState("24");
  const [customExpiry, setCustomExpiry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      setPreset("24");
      setCustomExpiry("");
      setError(null);
    }
  }, [request]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated =
        preset === "custom"
          ? await extendAidRequestApi(request.id, {
              expires_at: new Date(customExpiry).toISOString(),
            })
          : await extendAidRequestApi(request.id, {
              extend_hours: Number(preset),
            });
      onExtended(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aid.extendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!request}
      onClose={onClose}
      title={t("aid.extendRequest")}
      description={request ? request.title : undefined}
    >
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-danger bg-danger-soft p-3 text-sm font-semibold text-on-danger-soft"
        >
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {request && requestIsExpired(request) && (
          <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm font-semibold text-on-warning-soft">
            <Timer aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t("aid.reopenHint")}
          </p>
        )}

        <Select
          label={t("aid.extendBy")}
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {EXTEND_PRESETS.map((h) => (
            <option key={h} value={h}>
              {h}h
            </option>
          ))}
          <option value="custom">{t("aid.customExpiry")}</option>
        </Select>

        {preset === "custom" && (
          <Input
            label={t("aid.expiryLabel")}
            type="datetime-local"
            value={customExpiry}
            onChange={(e) => setCustomExpiry(e.target.value)}
            required
          />
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={submitting || (preset === "custom" && !customExpiry)}
            icon={<CalendarClock />}
          >
            {t("aid.extend")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Respond Inline Form ────────────────────────────────────────

interface RespondFormProps {
  requestId: string;
  onResponded: (response: AidResponseX) => void;
  onCancel: () => void;
}

const RespondForm: React.FC<RespondFormProps> = ({
  requestId,
  onResponded,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [etaHours, setEtaHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data: { message?: string; eta_hours?: number } = {};
      if (message.trim()) data.message = message.trim();
      if (etaHours.trim()) data.eta_hours = Number(etaHours);

      const response = await respondToAidRequestApi(requestId, data);
      onResponded(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aid.respondFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-accent bg-accent-soft/40 p-4"
    >
      <p className="text-sm font-semibold text-ink">{t("aid.yourResponse")}</p>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-danger bg-danger-soft p-2 text-xs font-semibold text-on-danger-soft"
        >
          <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <Textarea
        label={t("aid.responseMessage")}
        hideLabel
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder={t("aid.responsePlaceholder")}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label={t("aid.etaHours")}
          type="number"
          min="0"
          step="0.5"
          value={etaHours}
          onChange={(e) => setEtaHours(e.target.value)}
          placeholder={t("aid.etaPlaceholder")}
          className="flex-1"
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={submitting} icon={<Send />}>
            {t("aid.sendResponse")}
          </Button>
        </div>
      </div>
    </form>
  );
};

// ─── Request Card ───────────────────────────────────────────────

interface RequestCardProps {
  request: AidRequestX;
  isOwn: boolean;
  canRespond: boolean;
  onStatusUpdate: (id: string, status: string) => void;
  onResponseAdded: (requestId: string, response: AidResponseX) => void;
  onEdit: (request: AidRequestX) => void;
  onExtend: (request: AidRequestX) => void;
}

const RequestCard: React.FC<RequestCardProps> = ({
  request,
  isOwn,
  canRespond,
  onStatusUpdate,
  onResponseAdded,
  onEdit,
  onExtend,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AidRequestX | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showRespondForm, setShowRespondForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isExpired = requestIsExpired(request);
  const displayStatus = isExpired ? "expired" : request.status;
  const urgencyTone = URGENCY_TONES[request.urgency] || URGENCY_TONES.low;
  const statusToneValue = STATUS_TONES[displayStatus] || STATUS_TONES.open;
  const CategoryIcon = CATEGORY_ICONS[request.category] || CATEGORY_ICONS.other;

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !detail) {
      setLoadingDetail(true);
      try {
        const full = (await getAidRequestDetail(request.id)) as AidRequestX;
        setDetail(full);
      } catch {
        // Fall back to the partial data we have
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleStatusChange = async (status: string) => {
    setUpdatingStatus(true);
    try {
      await updateAidRequestStatus(request.id, status);
      onStatusUpdate(request.id, status);
    } catch {
      // Silent fail; user can retry
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleResponded = (response: AidResponseX) => {
    setShowRespondForm(false);
    onResponseAdded(request.id, response);
    // Update local detail
    if (detail) {
      setDetail({
        ...detail,
        responses: [...(detail.responses || []), response],
        response_count: detail.response_count + 1,
      });
    }
  };

  // Newer data from the list (socket updates / edits) wins over stale detail
  const merged: AidRequestX = detail
    ? { ...detail, ...request, responses: detail.responses }
    : request;
  const responses = merged.responses || [];
  const isActive =
    (request.status === "open" || request.status === "responding") && !isExpired;

  return (
    <Card flush className="transition-shadow hover:shadow-2">
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={expanded}
        className="w-full rounded-lg px-5 py-4 text-start focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        <div className="flex items-start gap-4">
          {/* Category icon */}
          <span
            aria-label={request.category}
            role="img"
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft"
          >
            <CategoryIcon aria-hidden="true" className="h-5 w-5" />
          </span>

          {/* Main info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Urgency badge */}
              <Badge tone={urgencyTone} size="sm" dot>
                {t(`aid.urg.${request.urgency}`, request.urgency)}
              </Badge>

              {/* Status badge */}
              <Badge
                tone={statusToneValue}
                size="sm"
                icon={displayStatus === "expired" ? <Timer /> : undefined}
              >
                {displayStatus === "expired"
                  ? t("aid.expired")
                  : t(`aid.status.${displayStatus}`, displayStatus)}
              </Badge>

              {isOwn && (
                <Badge tone="accent" size="sm">
                  {t("aid.yourRequest")}
                </Badge>
              )}
            </div>

            <h3 className="mt-1 text-sm font-semibold text-ink">
              {request.title}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span>{request.requesting_hospital_name || t("aid.unknownHospital")}</span>
              <span>{timeAgo(request.created_at)}</span>
              {request.quantity && (
                <span>
                  {request.quantity}
                  {request.unit ? ` ${request.unit}` : ""}
                </span>
              )}
              {request.expires_at && !isExpired && (
                <span className="inline-flex items-center gap-1">
                  <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("aid.expires")} {timeUntil(request.expires_at)}
                </span>
              )}
              {request.response_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                  {t("aid.responseCount", { count: request.response_count })}
                </span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-edge px-5 pb-5 pt-4">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" label={t("aid.loadingDetails")} />
            </div>
          ) : (
            <>
              {/* Description */}
              {merged.description && (
                <div className="mb-4">
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {merged.description}
                  </p>
                </div>
              )}

              {/* Contact info */}
              {(merged.contact_name || merged.contact_phone) && (
                <div className="mb-4 rounded-lg bg-surface-2 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("aid.contactInfo")}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-ink">
                    {merged.contact_name && (
                      <span className="flex items-center gap-1.5">
                        <UserRound aria-hidden="true" className="h-4 w-4 text-ink-faint" />
                        {merged.contact_name}
                      </span>
                    )}
                    {merged.contact_phone && (
                      <span className="flex items-center gap-1.5" dir="ltr">
                        <Phone aria-hidden="true" className="h-4 w-4 text-ink-faint" />
                        {merged.contact_phone}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Responses list — who responded */}
              {responses.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("aid.responses")} ({responses.length})
                  </p>
                  <div className="space-y-2">
                    {responses.map((resp) => (
                      <div
                        key={resp.id}
                        className="rounded-lg border border-edge bg-surface-2 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {resp.responding_hospital_name ||
                                resp.responder_name ||
                                t("aid.unknownHospital")}
                            </p>
                            {resp.message && (
                              <p className="mt-1 text-sm text-ink-muted">{resp.message}</p>
                            )}
                            {resp.responder_phone && (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted" dir="ltr">
                                <Phone aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />
                                {resp.responder_phone}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-end">
                            {resp.eta_hours != null && (
                              <Badge tone="info" size="sm" icon={<Timer />}>
                                {t("aid.eta")}: {resp.eta_hours}h
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-ink-faint">
                          {timeAgo(resp.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Own request actions */}
                {isOwn && isActive && (
                  <>
                    <Button
                      variant="success"
                      icon={<Check />}
                      loading={updatingStatus}
                      onClick={() => handleStatusChange("fulfilled")}
                    >
                      {t("aid.markFulfilled")}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<X />}
                      loading={updatingStatus}
                      onClick={() => handleStatusChange("cancelled")}
                    >
                      {t("aid.cancelRequest")}
                    </Button>
                  </>
                )}

                {isOwn && (isActive || isExpired) && (
                  <>
                    <Button
                      variant="secondary"
                      icon={<Pencil />}
                      onClick={() => onEdit(request)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<CalendarClock />}
                      onClick={() => onExtend(request)}
                    >
                      {t("aid.extend")}
                    </Button>
                  </>
                )}

                {/* Respond button for other facilities' active requests */}
                {!isOwn && canRespond && isActive && !showRespondForm && (
                  <Button
                    icon={<HeartHandshake />}
                    onClick={() => setShowRespondForm(true)}
                  >
                    {t("aid.respond")}
                  </Button>
                )}
              </div>

              {/* Inline respond form */}
              {showRespondForm && (
                <RespondForm
                  requestId={request.id}
                  onResponded={handleResponded}
                  onCancel={() => setShowRespondForm(false)}
                />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};

// ─── Main Page Component ────────────────────────────────────────

const AidRequests: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId;
  // Hospitals create blood/supply requests; other departments view & respond
  const canCreate = user?.role === "hospital_admin" || user?.role === "super_admin";
  const canRespond = !!hospitalId;

  const [requests, setRequests] = useState<AidRequestX[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myHospital, setMyHospital] = useState<Hospital | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AidRequestX | null>(null);
  const [extendTarget, setExtendTarget] = useState<AidRequestX | null>(null);

  // ── Fetch current hospital info for defaults ──────────────
  useEffect(() => {
    if (!hospitalId) return;
    getHospitals()
      .then((hospitals) => {
        const mine = hospitals.find((h) => h.id === hospitalId);
        if (mine) setMyHospital(mine);
      })
      .catch(() => {});
  }, [hospitalId]);

  // ── Fetch aid requests ──────────────────────────────────────

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: Parameters<typeof getAidRequests>[0] = { limit: 50 };
      if (categoryFilter) params.category = categoryFilter;
      if (urgencyFilter) params.urgency = urgencyFilter;
      if (statusFilter) params.status_filter = statusFilter;

      const data = await getAidRequests(params);
      setRequests(data.aid_requests as AidRequestX[]);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("aid.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, urgencyFilter, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ── Real-time aid request updates via shared socket ─────────

  useSocketEvent<AidRequestX>("new_aid_request", (newRequest) => {
    announce(t("aid.newAnnounce"), "polite");
    setRequests((prev) => {
      if (prev.some((r) => r.id === newRequest.id)) return prev;
      return [newRequest, ...prev];
    });
    setTotal((prev) => prev + 1);
  });

  useSocketEvent<AidRequestX>("aid_request_updated", (updated) => {
    setRequests((prev) => {
      if (!prev.some((r) => r.id === updated.id)) return prev;
      announce(t("aid.updatedAnnounce"), "polite");
      return prev.map((r) =>
        r.id === updated.id ? { ...r, ...updated, responses: r.responses } : r
      );
    });
  });

  // ── Handlers ────────────────────────────────────────────────

  const handleCreated = (newRequest: AidRequestX) => {
    setShowNewModal(false);
    setRequests((prev) => [newRequest, ...prev]);
    setTotal((prev) => prev + 1);
  };

  const handleEdited = (updated: AidRequestX) => {
    setEditTarget(null);
    setRequests((prev) =>
      prev.map((r) =>
        r.id === updated.id ? { ...r, ...updated, responses: r.responses } : r
      )
    );
  };

  const handleExtended = (updated: AidRequestX) => {
    setExtendTarget(null);
    setRequests((prev) =>
      prev.map((r) =>
        r.id === updated.id ? { ...r, ...updated, responses: r.responses } : r
      )
    );
  };

  const handleStatusUpdate = (id: string, status: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              is_expired: status === "expired",
              fulfilled_at: status === "fulfilled" ? new Date().toISOString() : r.fulfilled_at,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const handleResponseAdded = (requestId: string, _response: AidResponseX) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              response_count: r.response_count + 1,
              status: r.status === "open" ? "responding" : r.status,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const clearFilters = () => {
    setCategoryFilter("");
    setUrgencyFilter("");
    setStatusFilter("");
  };

  const hasFilters = categoryFilter || urgencyFilter || statusFilter;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<HeartHandshake />}
        title={t("aid.title")}
        description={t("aid.subtitle")}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw />} onClick={fetchRequests}>
              {t("common.refresh")}
            </Button>
            {canCreate && (
              <Button icon={<Plus />} onClick={() => setShowNewModal(true)}>
                {t("aid.newRequest")}
              </Button>
            )}
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          label={t("aid.filterCategory")}
          hideLabel
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="sm:w-48"
        >
          {CATEGORIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </Select>

        <Select
          label={t("aid.filterUrgency")}
          hideLabel
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="sm:w-48"
        >
          {URGENCIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </Select>

        <Select
          label={t("aid.filterStatus")}
          hideLabel
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-48"
        >
          {STATUSES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={clearFilters}>
            {t("common.clearFilters")}
          </Button>
        )}
      </div>

      {/* Result count */}
      <p className="text-sm text-ink-muted" role="status">
        {t("aid.showing")} {requests.length} {t("aid.of")} {total} {t("aid.requests")}
      </p>

      {/* Loading */}
      {loading && <LoadingState label={t("aid.loadingRequests")} />}

      {/* Error */}
      {error && !loading && (
        <Card className="border-danger bg-danger-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-danger-soft">
              <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchRequests}>
              {t("common.retry")}
            </Button>
          </div>
        </Card>
      )}

      {/* Request list */}
      {!loading && !error && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title={t("aid.noRequests")}
              description={t("aid.emptyDescription")}
              action={
                canCreate ? (
                  <Button icon={<Plus />} onClick={() => setShowNewModal(true)}>
                    {t("aid.createFirst")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isOwn={req.requesting_hospital_id === hospitalId}
                canRespond={canRespond}
                onStatusUpdate={handleStatusUpdate}
                onResponseAdded={handleResponseAdded}
                onEdit={setEditTarget}
                onExtend={setExtendTarget}
              />
            ))
          )}
        </div>
      )}

      {/* New Request Modal */}
      <RequestFormModal
        open={showNewModal}
        mode="create"
        onClose={() => setShowNewModal(false)}
        onSaved={handleCreated}
        defaultContactName={myHospital?.name ?? ""}
        defaultContactPhone={myHospital?.phone ?? ""}
      />

      {/* Edit Request Modal */}
      <RequestFormModal
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={handleEdited}
      />

      {/* Extend Expiry Modal */}
      <ExtendModal
        request={extendTarget}
        onClose={() => setExtendTarget(null)}
        onExtended={handleExtended}
      />
    </div>
  );
};

export default AidRequests;
