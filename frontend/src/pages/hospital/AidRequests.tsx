import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import { useAuthStore } from "../../store/authStore";
import { timeAgo } from "../../utils/formatting";
import {
  getAidRequests,
  getAidRequestDetail,
  createAidRequest,
  respondToAidRequest,
  updateAidRequestStatus,
} from "../../services/api";
import type { AidRequest, AidResponse } from "../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Constants ──────────────────────────────────────────────────

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "blood", label: "Blood" },
  { value: "medication", label: "Medication" },
  { value: "equipment", label: "Equipment" },
  { value: "personnel", label: "Personnel" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
];

const URGENCIES = [
  { value: "", label: "All Urgencies" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "responding", label: "Responding" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

const CATEGORY_ICONS: Record<string, string> = {
  blood: "\u{1FA78}",
  medication: "\u{1F48A}",
  equipment: "\u{1F527}",
  personnel: "\u{1F468}\u{200D}\u{2695}\u{FE0F}",
  supplies: "\u{1F4E6}",
  other: "\u{1F4CB}",
};

const URGENCY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  high: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
  low: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: "bg-blue-100", text: "text-blue-700" },
  responding: { bg: "bg-purple-100", text: "text-purple-700" },
  fulfilled: { bg: "bg-green-100", text: "text-green-700" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ─── New Request Modal ──────────────────────────────────────────

interface NewRequestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (req: AidRequest) => void;
}

const NewRequestModal: React.FC<NewRequestModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "supplies",
    title: "",
    description: "",
    urgency: "medium",
    quantity: "",
    unit: "",
    contact_phone: "",
    contact_name: "",
  });

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
      const payload: Parameters<typeof createAidRequest>[0] = {
        category: form.category,
        title: form.title.trim(),
        urgency: form.urgency,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.quantity.trim()) payload.quantity = form.quantity.trim();
      if (form.unit.trim()) payload.unit = form.unit.trim();
      if (form.contact_phone.trim()) payload.contact_phone = form.contact_phone.trim();
      if (form.contact_name.trim()) payload.contact_name = form.contact_name.trim();

      const created = await createAidRequest(payload);
      onCreated(created);
      setForm({
        category: "supplies",
        title: "",
        description: "",
        urgency: "medium",
        quantity: "",
        unit: "",
        contact_phone: "",
        contact_name: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {t("aid.newRequest")}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category & Urgency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.category")}
              </label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {CATEGORIES.filter((c) => c.value).map((c) => (
                  <option key={c.value} value={c.value}>
                    {CATEGORY_ICONS[c.value]} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.urgency")}
              </label>
              <select
                name="urgency"
                value={form.urgency}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {URGENCIES.filter((u) => u.value).map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("aid.requestTitle")}
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              placeholder="e.g. Need O- blood units urgently"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("aid.description")}
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Provide additional details..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.quantity")}
              </label>
              <input
                type="text"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                placeholder="e.g. 10"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.unit")}
              </label>
              <input
                type="text"
                name="unit"
                value={form.unit}
                onChange={handleChange}
                placeholder="e.g. units, boxes, doses"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.contactName")}
              </label>
              <input
                type="text"
                name="contact_name"
                value={form.contact_name}
                onChange={handleChange}
                placeholder="Contact person"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("aid.contactPhone")}
              </label>
              <input
                type="text"
                name="contact_phone"
                value={form.contact_phone}
                onChange={handleChange}
                placeholder="+970..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !form.title.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {t("aid.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Respond Inline Form ────────────────────────────────────────

interface RespondFormProps {
  requestId: string;
  onResponded: (response: AidResponse) => void;
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

      const response = await respondToAidRequest(requestId, data);
      onResponded(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3"
    >
      <p className="text-sm font-medium text-gray-700">{t("aid.yourResponse")}</p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder={t("aid.responsePlaceholder")}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t("aid.etaHours")}
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={etaHours}
            onChange={(e) => setEtaHours(e.target.value)}
            placeholder="e.g. 2"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {t("aid.sendResponse")}
          </button>
        </div>
      </div>
    </form>
  );
};

// ─── Request Card ───────────────────────────────────────────────

interface RequestCardProps {
  request: AidRequest;
  isOwn: boolean;
  onStatusUpdate: (id: string, status: string) => void;
  onResponseAdded: (requestId: string, response: AidResponse) => void;
}

const RequestCard: React.FC<RequestCardProps> = ({
  request,
  isOwn,
  onStatusUpdate,
  onResponseAdded,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<AidRequest | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showRespondForm, setShowRespondForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const urgencyStyle = URGENCY_COLORS[request.urgency] || URGENCY_COLORS.low;
  const statusStyle = STATUS_COLORS[request.status] || STATUS_COLORS.open;
  const categoryIcon = CATEGORY_ICONS[request.category] || CATEGORY_ICONS.other;

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !detail) {
      setLoadingDetail(true);
      try {
        const full = await getAidRequestDetail(request.id);
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

  const handleResponded = (response: AidResponse) => {
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

  const responses = detail?.responses || request.responses || [];
  const isActive = request.status === "open" || request.status === "responding";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={handleExpand}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-start gap-4">
          {/* Category icon */}
          <span className="mt-0.5 text-2xl leading-none" role="img" aria-label={request.category}>
            {categoryIcon}
          </span>

          {/* Main info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Urgency badge */}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyStyle.bg} ${urgencyStyle.text}`}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${urgencyStyle.dot}`} />
                {request.urgency.charAt(0).toUpperCase() + request.urgency.slice(1)}
              </span>

              {/* Status badge */}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
              >
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>

              {isOwn && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  {t("aid.yourRequest")}
                </span>
              )}
            </div>

            <h3 className="mt-1 text-sm font-semibold text-gray-900">
              {request.title}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>{request.requesting_hospital_name || t("aid.unknownHospital")}</span>
              <span>{timeAgo(request.created_at)}</span>
              {request.quantity && (
                <span>
                  {request.quantity}
                  {request.unit ? ` ${request.unit}` : ""}
                </span>
              )}
              {request.response_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  {request.response_count} {request.response_count === 1 ? "response" : "responses"}
                </span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <svg
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            </div>
          ) : (
            <>
              {/* Description */}
              {(detail?.description || request.description) && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {detail?.description || request.description}
                  </p>
                </div>
              )}

              {/* Contact info */}
              {(request.contact_name || request.contact_phone) && (
                <div className="mb-4 rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t("aid.contactInfo")}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                    {request.contact_name && (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {request.contact_name}
                      </span>
                    )}
                    {request.contact_phone && (
                      <span className="flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {request.contact_phone}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Responses list */}
              {responses.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {t("aid.responses")} ({responses.length})
                  </p>
                  <div className="space-y-2">
                    {responses.map((resp) => (
                      <div
                        key={resp.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {resp.responding_hospital_name || t("aid.unknownHospital")}
                            </p>
                            {resp.message && (
                              <p className="mt-1 text-sm text-gray-600">{resp.message}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            {resp.eta_hours != null && (
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                ETA: {resp.eta_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
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
                    <button
                      onClick={() => handleStatusChange("fulfilled")}
                      disabled={updatingStatus}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t("aid.markFulfilled")}
                    </button>
                    <button
                      onClick={() => handleStatusChange("cancelled")}
                      disabled={updatingStatus}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {t("aid.cancelRequest")}
                    </button>
                  </>
                )}

                {/* Respond button for other hospitals' active requests */}
                {!isOwn && isActive && !showRespondForm && (
                  <button
                    onClick={() => setShowRespondForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    {t("aid.respond")}
                  </button>
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
    </div>
  );
};

// ─── Main Page Component ────────────────────────────────────────

const AidRequests: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId;

  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal
  const [showNewModal, setShowNewModal] = useState(false);

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
      setRequests(data.aid_requests);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load aid requests");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, urgencyFilter, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ── WebSocket for real-time updates ─────────────────────────

  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join_alerts");
    });

    socket.on("new_aid_request", (newRequest: AidRequest) => {
      setRequests((prev) => {
        // Avoid duplicates
        if (prev.some((r) => r.id === newRequest.id)) return prev;
        return [newRequest, ...prev];
      });
      setTotal((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ── Handlers ────────────────────────────────────────────────

  const handleCreated = (newRequest: AidRequest) => {
    setShowNewModal(false);
    setRequests((prev) => [newRequest, ...prev]);
    setTotal((prev) => prev + 1);
  };

  const handleStatusUpdate = (id: string, status: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              fulfilled_at: status === "fulfilled" ? new Date().toISOString() : r.fulfilled_at,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const handleResponseAdded = (requestId: string, _response: AidResponse) => {
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
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("aid.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("aid.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRequests}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t("common.refresh")}
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("aid.newRequest")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {CATEGORIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value ? `${CATEGORY_ICONS[opt.value]} ${opt.label}` : opt.label}
            </option>
          ))}
        </select>

        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {URGENCIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {STATUSES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {t("common.clearFilters")}
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="text-sm text-gray-500">
        {t("aid.showing")} {requests.length} {t("aid.of")} {total} {t("aid.requests")}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Request list */}
      {!loading && !error && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12 text-center shadow-sm">
              <svg
                className="mx-auto h-12 w-12 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <p className="mt-3 text-sm text-gray-500">
                {t("aid.noRequests")}
              </p>
              <button
                onClick={() => setShowNewModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t("aid.createFirst")}
              </button>
            </div>
          ) : (
            requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isOwn={req.requesting_hospital_id === hospitalId}
                onStatusUpdate={handleStatusUpdate}
                onResponseAdded={handleResponseAdded}
              />
            ))
          )}
        </div>
      )}

      {/* New Request Modal */}
      <NewRequestModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};

export default AidRequests;
