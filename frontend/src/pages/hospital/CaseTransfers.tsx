import React, { useEffect, useState, useCallback } from "react";
import { useAuthStore, ROLE_TO_DEPARTMENT, DEPARTMENT_LABELS, DEPARTMENT_COLORS, type DepartmentType } from "../../store/authStore";
import { timeAgo } from "../../utils/formatting";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

const deptBadge: Record<string, string> = {
  hospital: "bg-blue-50 text-blue-700",
  police: "bg-indigo-50 text-indigo-700",
  civil_defense: "bg-orange-50 text-orange-700",
};

const statusBadge: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const CaseTransfers: React.FC = () => {
  const { user } = useAuthStore();
  const dept: DepartmentType = user?.facilityType ?? ROLE_TO_DEPARTMENT[user?.role ?? ""] ?? "hospital";
  const deptLabel = DEPARTMENT_LABELS[dept] ?? "Hospital";
  const facilityId = user?.hospitalId ?? "";

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Create transfer modal
  const [createOpen, setCreateOpen] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sosId, setSosId] = useState("");
  const [alertId, setAlertId] = useState("");
  const [targetFacilityId, setTargetFacilityId] = useState("");
  const [targetDept, setTargetDept] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  const showNotification = useCallback((type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const fetchTransfers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status_filter", statusFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_URL}/api/v1/transfers${qs}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTransfers(data.transfers ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchFacilities = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/hospitals`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFacilities((data.hospitals ?? []).filter((f: Facility) => f.id !== facilityId));
      }
    } catch {
      // silent
    }
  }, [facilityId]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const handleAccept = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/transfers/${id}/accept`, {
        method: "PUT",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification("success", "Transfer accepted");
        fetchTransfers();
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification("error", (err as { detail?: string }).detail || "Failed");
      }
    } catch {
      showNotification("error", "Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/transfers/${id}/reject`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (res.ok) {
        showNotification("success", "Transfer rejected");
        fetchTransfers();
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification("error", (err as { detail?: string }).detail || "Failed");
      }
    } catch {
      showNotification("error", "Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const openCreateModal = () => {
    setSosId("");
    setAlertId("");
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

      const res = await fetch(`${API_URL}/api/v1/transfers`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showNotification("success", "Transfer created");
        setCreateOpen(false);
        fetchTransfers();
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification("error", (err as { detail?: string }).detail || "Failed to create transfer");
      }
    } catch {
      showNotification("error", "Network error");
    } finally {
      setCreating(false);
    }
  };

  const isIncoming = (t: Transfer) => t.to_facility_id === facilityId;

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 end-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-all ${
            notification.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Case Transfers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Transfer cases between departments — {total} transfer{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Transfer
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {["", "pending", "accepted", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-purple-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Transfer list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
        </div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400">
          No transfers found
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map((transfer) => {
            const incoming = isIncoming(transfer);
            const isPending = transfer.status === "pending";
            return (
              <div
                key={transfer.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  incoming && isPending
                    ? "border-yellow-300"
                    : "border-gray-200"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-2">
                    {/* Direction badge */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          incoming
                            ? "bg-green-50 text-green-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {incoming ? "Incoming" : "Outgoing"}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusBadge[transfer.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {transfer.status}
                      </span>
                    </div>

                    {/* Routing */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${deptBadge[transfer.from_department] ?? "bg-gray-100 text-gray-700"}`}>
                        {DEPARTMENT_LABELS[transfer.from_department as DepartmentType] ?? transfer.from_department}
                      </span>
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${deptBadge[transfer.to_department] ?? "bg-gray-100 text-gray-700"}`}>
                        {DEPARTMENT_LABELS[transfer.to_department as DepartmentType] ?? transfer.to_department}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>SOS: <span className="font-mono">{transfer.sos_request_id.slice(0, 8)}...</span></p>
                      {transfer.reason && <p>Reason: {transfer.reason}</p>}
                      {transfer.created_at && <p>{timeAgo(transfer.created_at)}</p>}
                    </div>
                  </div>

                  {/* Actions */}
                  {incoming && isPending && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(transfer.id)}
                        disabled={actionLoading === transfer.id}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(transfer.id)}
                        disabled={actionLoading === transfer.id}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Transfer Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Create Transfer</h3>
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">SOS Request ID *</label>
                <input
                  type="text"
                  value={sosId}
                  onChange={(e) => setSosId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="UUID of the SOS request"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Alert ID (optional)</label>
                <input
                  type="text"
                  value={alertId}
                  onChange={(e) => setAlertId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="UUID of the alert"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Target Department *</label>
                <select
                  value={targetDept}
                  onChange={(e) => {
                    setTargetDept(e.target.value);
                    setTargetFacilityId("");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Select department...</option>
                  <option value="hospital">Hospital</option>
                  <option value="police">Police</option>
                  <option value="civil_defense">Civil Defense</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Target Facility *</label>
                <select
                  value={targetFacilityId}
                  onChange={(e) => setTargetFacilityId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Select facility...</option>
                  {facilities
                    .filter((f) => !targetDept || f.department_type === targetDept)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({DEPARTMENT_LABELS[f.department_type as DepartmentType] ?? f.department_type})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  placeholder="Why is this case being transferred?"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !sosId.trim() || !targetFacilityId || !targetDept}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaseTransfers;
