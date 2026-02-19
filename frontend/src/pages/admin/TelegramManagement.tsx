import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import {
  getTelegramStatus,
  getTelegramChannels,
  addTelegramChannel,
  removeTelegramChannel,
  togglePauseChannel,
  getChannelMessages,
  getTelegramEvents,
  connectTelegram,
  discoverMyChannels,
  importChannels,
  sendTelegramAuthCode,
  verifyTelegramAuthCode,
  disconnectTelegram,
  getStoredMessages,
  type TelegramChannel,
  type TelegramMessage,
  type TelegramStatus,
  type TelegramEvent,
  type TelegramDiscoveredChannel,
  type TelegramLiveMessage,
} from "../../services/telegramService";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ================================================================
   Platform sub-tab definitions — add future platforms here
   ================================================================ */
const PLATFORMS = [
  {
    id: "telegram" as const,
    label: "admin.socialMedia.platformTelegram",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    enabled: true,
  },
  {
    id: "whatsapp" as const,
    label: "admin.socialMedia.platformWhatsApp",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    enabled: false,
  },
  {
    id: "twitter" as const,
    label: "admin.socialMedia.platformTwitter",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
    enabled: false,
  },
];

type PlatformId = (typeof PLATFORMS)[number]["id"];

/* ================================================================
   Main Component
   ================================================================ */
const SocialMediaPage: React.FC = () => {
  const { t } = useTranslation();
  const [activePlatform, setActivePlatform] = useState<PlatformId>("telegram");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("admin.socialMedia.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t("admin.socialMedia.subtitle")}
        </p>
      </div>

      {/* Platform sub-tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => p.enabled && setActivePlatform(p.id)}
            disabled={!p.enabled}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activePlatform === p.id
                ? "border-purple-600 text-purple-700"
                : p.enabled
                  ? "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  : "border-transparent text-gray-300 cursor-not-allowed"
            }`}
          >
            {p.icon}
            <span>{t(p.label)}</span>
            {!p.enabled && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                {t("admin.socialMedia.comingSoon")}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Platform content */}
      {activePlatform === "telegram" && <TelegramContent />}
    </div>
  );
};

/* ================================================================
   Telegram Content (channels, live feed, intel)
   ================================================================ */
const TelegramContent: React.FC = () => {
  const { t } = useTranslation();

  // Tabs
  const [activeTab, setActiveTab] = useState<"channels" | "live" | "intel">("channels");

  // State
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [events, setEvents] = useState<TelegramEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Live feed
  const [liveMessages, setLiveMessages] = useState<TelegramLiveMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const liveFeedRef = useRef<HTMLDivElement>(null);

  // AI processing tracker — maps message_id → processing status
  const [processingMessages, setProcessingMessages] = useState<
    {
      message_id: number;
      chat_id: string;
      channel: string;
      channel_name: string;
      text: string;
      date: string;
      status: "processing" | "completed";
      is_crisis?: boolean;
      event_type?: string;
      severity?: string;
      confidence?: number;
      details?: string;
      latitude?: number | null;
      longitude?: number | null;
    }[]
  >([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState<TelegramChannel | null>(null);
  const [showMessagesModal, setShowMessagesModal] = useState<TelegramChannel | null>(null);
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Auth flow
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<"idle" | "sending" | "code" | "2fa" | "verifying">("idle");
  const [authCode, setAuthCode] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPhoneHint, setAuthPhoneHint] = useState("");
  const [authError, setAuthError] = useState("");

  // Disconnect
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);

  // Discovery
  const [discoveredChannels, setDiscoveredChannels] = useState<TelegramDiscoveredChannel[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");

  // Add form
  const [addForm, setAddForm] = useState({
    username: "",
    category: "unknown",
    language: "ar",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load stored messages so the feed survives reloads / re-logins / tab switches
  const loadStoredMessages = useCallback(() => {
    getStoredMessages(24, 200)
      .then((msgs) => {
        setLiveMessages((prev) => {
          // Merge: keep any real-time msgs not yet in the DB response
          const dbIds = new Set(msgs.map((m) => m.id));
          const extra = prev.filter((m) => !dbIds.has(m.id));
          return [...extra, ...msgs].slice(0, 200);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStoredMessages();
  }, [loadStoredMessages]);

  // Reload stored messages when switching to the live tab
  useEffect(() => {
    if (activeTab === "live") {
      loadStoredMessages();
    }
  }, [activeTab, loadStoredMessages]);

  // Socket.IO for real-time messages
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_telegram");
    });

    socket.on("telegram_message", (msg: TelegramLiveMessage) => {
      setLiveMessages((prev) => [msg, ...prev].slice(0, 200));
    });

    socket.on("telegram_analysis", (analysis: Record<string, unknown>) => {
      // Refresh events list so stats update automatically
      setTimeout(() => fetchEvents(), 1000);

      // Update corresponding processing card → completed
      const msgId = analysis.message_id as number | undefined;
      if (msgId != null) {
        setProcessingMessages((prev) =>
          prev.map((p) =>
            p.message_id === msgId
              ? {
                  ...p,
                  status: "completed" as const,
                  is_crisis: analysis.is_crisis as boolean | undefined,
                  event_type: analysis.event_type as string | undefined,
                  severity: analysis.severity as string | undefined,
                  confidence: analysis.confidence as number | undefined,
                  details: analysis.details as string | undefined,
                  latitude: analysis.latitude as number | null | undefined,
                  longitude: analysis.longitude as number | null | undefined,
                }
              : p
          )
        );
      }
    });

    // AI processing started for a message
    socket.on(
      "telegram_processing",
      (data: {
        message_id: number;
        chat_id: string;
        channel: string;
        channel_name: string;
        text: string;
        date: string;
        status: string;
      }) => {
        setProcessingMessages((prev) => {
          // Avoid duplicates
          if (prev.some((p) => p.message_id === data.message_id)) return prev;
          return [
            {
              message_id: data.message_id,
              chat_id: data.chat_id,
              channel: data.channel,
              channel_name: data.channel_name,
              text: data.text,
              date: data.date,
              status: "processing" as const,
            },
            ...prev,
          ].slice(0, 50);
        });
      }
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, channelsRes] = await Promise.all([
        getTelegramStatus(),
        getTelegramChannels(),
      ]);
      setStatus(statusRes);
      setChannels(channelsRes.channels);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch AI events when switching to intel tab
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await getTelegramEvents(24, 50);
      setEvents(data);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "intel") {
      fetchEvents();
    }
  }, [activeTab, fetchEvents]);

  // ---------- Auth flow handlers ----------
  const handleStartAuth = async () => {
    setShowAuthModal(true);
    setAuthStep("sending");
    setAuthError("");
    setAuthCode("");
    setAuthPassword("");
    try {
      const result = await sendTelegramAuthCode();
      setAuthPhoneHint(result.phone_hint);
      if (result.status === "already_authorized") {
        setShowAuthModal(false);
        setNotification({ type: "success", message: t("admin.telegram.connected") });
        // Also call connect to initialize channels
        try { await connectTelegram(); } catch { /* ok */ }
        fetchData();
      } else {
        setAuthStep("code");
      }
    } catch (err) {
      setAuthError((err as Error).message);
      setAuthStep("idle");
    }
  };

  const handleVerifyCode = async () => {
    setAuthStep("verifying");
    setAuthError("");
    try {
      const result = await verifyTelegramAuthCode(authCode, authPassword || undefined);
      if (result.status === "2fa_required") {
        setAuthStep("2fa");
        return;
      }
      setShowAuthModal(false);
      setNotification({ type: "success", message: t("admin.telegram.connected") });
      // Initialize channels after successful auth
      try { await connectTelegram(); } catch { /* ok */ }
      fetchData();
    } catch (err) {
      setAuthError((err as Error).message);
      setAuthStep("code");
    }
  };

  const handleConnect = async () => {
    if (status && !status.session_exists) {
      // No session file — start UI auth flow
      handleStartAuth();
      return;
    }
    // Session exists — just connect
    try {
      await connectTelegram();
      setNotification({ type: "success", message: t("admin.telegram.connected") });
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    }
  };

  // ---------- Disconnect handler ----------
  const handleDisconnect = async () => {
    setDisconnectLoading(true);
    try {
      const result = await disconnectTelegram();
      setShowDisconnectModal(false);
      setChannels([]);
      setEvents([]);
      setLiveMessages([]);
      setNotification({
        type: "success",
        message: t("admin.telegram.disconnectSuccess", {
          channels: result.purged.channels,
          events: result.purged.events,
          alerts: result.purged.alerts,
        }),
      });
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    } finally {
      setDisconnectLoading(false);
    }
  };

  // ---------- Other handlers ----------
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.username.trim()) return;
    try {
      setAddLoading(true);
      await addTelegramChannel(
        addForm.username.trim(),
        addForm.category,
        addForm.language
      );
      setNotification({
        type: "success",
        message: t("admin.telegram.addSuccess"),
      });
      setShowAddModal(false);
      setAddForm({ username: "", category: "unknown", language: "ar" });
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!showRemoveModal) return;
    try {
      await removeTelegramChannel(showRemoveModal.id);
      setNotification({
        type: "success",
        message: t("admin.telegram.removeSuccess"),
      });
      setShowRemoveModal(null);
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    }
  };

  const handleTogglePause = async (channel: TelegramChannel) => {
    try {
      await togglePauseChannel(channel.id);
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    }
  };

  const handleViewMessages = async (channel: TelegramChannel) => {
    setShowMessagesModal(channel);
    setMessagesLoading(true);
    try {
      const msgs = await getChannelMessages(channel.id, 20);
      setMessages(msgs);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Channel discovery
  const handleDiscover = async () => {
    setShowDiscoverModal(true);
    setDiscoverLoading(true);
    try {
      const chs = await discoverMyChannels();
      setDiscoveredChannels(chs);
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleImportSelected = async () => {
    const toImport = discoveredChannels.filter((ch) =>
      selectedDiscovered.has(ch.chat_id)
    );
    if (toImport.length === 0) return;
    setImportLoading(true);
    try {
      const result = await importChannels(toImport);
      setNotification({
        type: "success",
        message: `Imported ${result.imported} channels`,
      });
      setShowDiscoverModal(false);
      setSelectedDiscovered(new Set());
      fetchData();
    } catch (err) {
      setNotification({ type: "error", message: (err as Error).message });
    } finally {
      setImportLoading(false);
    }
  };

  const toggleDiscoverSelect = (chatId: string) => {
    setSelectedDiscovered((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  };

  const filteredDiscovered = discoveredChannels.filter(
    (ch) =>
      discoverSearch === "" ||
      ch.name.toLowerCase().includes(discoverSearch.toLowerCase()) ||
      (ch.username || "").toLowerCase().includes(discoverSearch.toLowerCase())
  );

  // Trust score color
  const getTrustColor = (score: number) => {
    if (score >= 0.6) return "text-green-700 bg-green-100";
    if (score >= 0.3) return "text-amber-700 bg-amber-100";
    return "text-red-700 bg-red-100";
  };

  const getTrustBarColor = (score: number) => {
    if (score >= 0.6) return "bg-green-500";
    if (score >= 0.3) return "bg-amber-500";
    return "bg-red-500";
  };

  // Status badge
  const getStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      paused: "bg-yellow-100 text-yellow-700",
      blacklisted: "bg-red-100 text-red-700",
      removed: "bg-gray-100 text-gray-500",
    };
    const labelMap: Record<string, string> = {
      active: t("admin.telegram.statusActive"),
      paused: t("admin.telegram.statusPaused"),
      blacklisted: t("admin.telegram.statusBlacklisted"),
      removed: t("admin.telegram.statusRemoved"),
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[s] || map.removed}`}
      >
        {labelMap[s] || s}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          {t("admin.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed end-4 top-20 z-50 rounded-lg px-4 py-3 shadow-lg ${
            notification.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Connection status banner + action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Status banner */}
        {status && (
          <div
            className={`flex-1 rounded-lg border p-4 ${
              status.connected
                ? "border-green-200 bg-green-50"
                : status.configured
                  ? "border-yellow-200 bg-yellow-50"
                  : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
                    status.connected
                      ? "bg-green-500"
                      : status.configured
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                />
                <div>
                  <p
                    className={`text-sm font-medium ${
                      status.connected
                        ? "text-green-800"
                        : status.configured
                          ? "text-yellow-800"
                          : "text-red-800"
                    }`}
                  >
                    {t("admin.telegram.connectionStatus")}:{" "}
                    {status.connected
                      ? t("admin.telegram.connected")
                      : status.configured
                        ? t("admin.telegram.disconnected")
                        : t("admin.telegram.notConfigured")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {status.connected
                      ? t("admin.telegram.channelsMonitored", {
                          count: status.monitored_channels,
                        })
                      : !status.configured
                        ? t("admin.telegram.setupInstructions")
                        : !status.session_exists
                          ? t("admin.telegram.authNeeded")
                          : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(status.connected || channels.length > 0) && (
                  <button
                    onClick={() => setShowDisconnectModal(true)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    {t("admin.telegram.disconnect")}
                  </button>
                )}
                {status.configured && !status.connected && (
                  <button
                    onClick={handleConnect}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
                  >
                    {t("admin.telegram.connect")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 gap-2">
          <button
            onClick={handleDiscover}
            className="rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
          >
            {t("admin.telegram.discoverChannels")}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            {t("admin.telegram.addChannel")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["channels", "live", "intel"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-purple-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "channels" && t("admin.telegram.tabChannels")}
            {tab === "live" && t("admin.telegram.tabLive")}
            {tab === "intel" && t("admin.telegram.tabIntel")}
            {tab === "live" && liveMessages.length > 0 && (
              <span className="ms-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-purple-600 px-1.5 text-xs text-white">
                {liveMessages.length}
              </span>
            )}
            {tab === "intel" &&
              processingMessages.filter((p) => p.status === "processing").length > 0 && (
                <span className="ms-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs text-white animate-pulse">
                  {processingMessages.filter((p) => p.status === "processing").length}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* ========== CHANNELS TAB ========== */}
      {activeTab === "channels" && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase text-gray-500">
                  {t("admin.telegram.username")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase text-gray-500">
                  {t("admin.telegram.trustScore")}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase text-gray-500 md:table-cell">
                  {t("admin.telegram.totalReports")}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase text-gray-500 lg:table-cell">
                  {t("admin.telegram.verifiedReports")} / {t("admin.telegram.falseReports")}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase text-gray-500">
                  {t("admin.telegram.status")}
                </th>
                <th className="px-4 py-3 text-end text-xs font-medium uppercase text-gray-500">
                  {t("admin.telegram.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    {t("admin.telegram.noChannels")}
                  </td>
                </tr>
              ) : (
                channels.map((ch) => (
                  <tr key={ch.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {ch.channel_name || `@${ch.channel_id}`}
                        </p>
                        {ch.channel_url && (
                          <a
                            href={ch.channel_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:underline"
                          >
                            {ch.channel_url}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-gray-200">
                          <div
                            className={`h-2 rounded-full ${getTrustBarColor(ch.trust_score)}`}
                            style={{
                              width: `${Math.round(ch.trust_score * 100)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${getTrustColor(ch.trust_score)}`}
                        >
                          {(ch.trust_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-gray-600 md:table-cell">
                      {ch.total_reports}
                    </td>
                    <td className="hidden px-4 py-3 text-sm lg:table-cell">
                      <span className="text-green-600">{ch.verified_reports}</span>
                      {" / "}
                      <span className="text-red-600">{ch.false_reports}</span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(ch.monitoring_status)}</td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewMessages(ch)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-purple-600"
                          title={t("admin.telegram.viewMessages")}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </button>
                        {ch.monitoring_status !== "removed" && (
                          <button
                            onClick={() => handleTogglePause(ch)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-yellow-600"
                            title={
                              ch.monitoring_status === "active"
                                ? t("admin.telegram.statusPaused")
                                : t("admin.telegram.statusActive")
                            }
                          >
                            {ch.monitoring_status === "active" ? (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setShowRemoveModal(ch)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title={t("admin.telegram.removeChannel")}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== LIVE FEED TAB ========== */}
      {activeTab === "live" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
              </span>
              <span className="text-sm font-medium text-gray-700">
                {t("admin.telegram.liveMessages")} ({liveMessages.length})
              </span>
            </div>
            <button
              onClick={() => setLiveMessages([])}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              {t("admin.telegram.clearFeed")}
            </button>
          </div>

          <div
            ref={liveFeedRef}
            className="max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4"
          >
            {liveMessages.length === 0 ? (
              <div className="py-16 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="mt-3 text-sm text-gray-500">{t("admin.telegram.waitingForMessages")}</p>
                <p className="mt-1 text-xs text-gray-400">{t("admin.telegram.waitingHint")}</p>
              </div>
            ) : (
              liveMessages.map((msg, idx) => (
                <div
                  key={`${msg.id}-${idx}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3 transition-all hover:border-purple-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                      {msg.channel_name || msg.channel}
                    </span>
                    <span className="whitespace-nowrap text-xs text-gray-400">
                      {new Date(msg.date).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800" dir="auto">
                    {msg.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========== AI INTELLIGENCE TAB ========== */}
      {activeTab === "intel" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: t("admin.telegram.intelTotal"), value: events.length, color: "text-purple-700 bg-purple-50 border-purple-200" },
              { label: t("admin.telegram.intelCritical"), value: events.filter((e) => e.severity >= 4).length, color: "text-red-700 bg-red-50 border-red-200" },
              { label: t("admin.telegram.intelHighConf"), value: events.filter((e) => (e.confidence ?? 0) >= 0.7).length, color: "text-green-700 bg-green-50 border-green-200" },
              { label: t("admin.telegram.intelChannels"), value: new Set(events.map((e) => e.source_channel).filter(Boolean)).size, color: "text-blue-700 bg-blue-50 border-blue-200" },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-lg border p-4 ${stat.color}`}>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs font-medium">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={fetchEvents}
              disabled={eventsLoading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${eventsLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t("admin.telegram.refresh")}
            </button>
          </div>

          {/* --- Real-time AI analysis cards --- */}
          {processingMessages.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => setProcessingMessages([])}
                  className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {t("admin.telegram.clearFeed")}
                </button>
              </div>
              {processingMessages.map((pm) => {
                const sevMap: Record<string, { label: string; border: string; bg: string; text: string }> = {
                  low:      { label: "Low",      border: "border-blue-200",   bg: "bg-blue-50",   text: "text-blue-700" },
                  medium:   { label: "Medium",   border: "border-yellow-200", bg: "bg-yellow-50", text: "text-yellow-700" },
                  high:     { label: "High",     border: "border-orange-200", bg: "bg-orange-50", text: "text-orange-700" },
                  critical: { label: "Critical", border: "border-red-300",    bg: "bg-red-50",    text: "text-red-700" },
                  extreme:  { label: "Extreme",  border: "border-red-400",    bg: "bg-red-100",   text: "text-red-900" },
                };
                const sevKey = (pm.severity || "").toLowerCase();
                const sev = sevMap[sevKey];
                const cardStyle = pm.status === "processing"
                  ? "border-amber-300 bg-amber-50"
                  : pm.is_crisis && sev
                    ? `${sev.border} ${sev.bg}`
                    : !pm.is_crisis
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-white";

                return (
                  <div key={pm.message_id} className={`relative rounded-lg border p-4 transition-all ${cardStyle}`}>
                    {pm.status !== "processing" && (
                      <button
                        onClick={() => setProcessingMessages((prev) => prev.filter((p) => p.message_id !== pm.message_id))}
                        className="absolute end-2 top-2 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {pm.status === "processing" ? (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                            </span>
                            <span className="text-xs font-semibold text-amber-700">Processing...</span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {pm.date ? new Date(pm.date).toLocaleTimeString() : ""}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                            {pm.channel_name || pm.channel}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-gray-700" dir="auto">
                          {pm.text}
                        </p>
                        <div className="mt-2 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-amber-200">
                            <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-500"></div>
                          </div>
                          <span className="text-[10px] text-amber-600">Analyzing with AI</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Classification badge */}
                          {pm.is_crisis ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${sev ? `${sev.text} bg-opacity-80` : "text-red-800"} ${sev ? sev.bg : "bg-red-100"}`}>
                              {sev ? sev.label : "Threat"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                              No Threat
                            </span>
                          )}
                          {/* Event type */}
                          {pm.event_type && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              pm.is_crisis ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"
                            }`}>
                              {pm.event_type}
                            </span>
                          )}
                          {/* Confidence */}
                          {pm.confidence != null && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                              {(pm.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                          <span className="ms-auto text-xs text-gray-400">
                            {pm.date ? new Date(pm.date).toLocaleTimeString() : ""}
                          </span>
                        </div>
                        {/* Channel */}
                        <div className="mt-2">
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                            {pm.channel_name || pm.channel}
                          </span>
                        </div>
                        {/* AI details / summary */}
                        {pm.details && (
                          <p className="mt-2 text-sm font-medium text-gray-800">{pm.details}</p>
                        )}
                        {/* Original text */}
                        <div className="mt-2 rounded-md bg-gray-50 p-2">
                          <p className="text-xs text-gray-500" dir="auto">{pm.text}</p>
                        </div>
                        {/* Location if available */}
                        {pm.latitude != null && pm.longitude != null && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {pm.latitude.toFixed(4)}, {pm.longitude.toFixed(4)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {eventsLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-gray-500">{t("common.loading")}</div>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="mt-3 text-gray-500">{t("admin.telegram.noEvents")}</p>
              <p className="mt-1 text-xs text-gray-400">{t("admin.telegram.noEventsHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const severityMap: Record<number, { label: string; color: string }> = {
                  1: { label: t("admin.telegram.severityLow"), color: "bg-blue-100 text-blue-700" },
                  2: { label: t("admin.telegram.severityMedium"), color: "bg-yellow-100 text-yellow-700" },
                  3: { label: t("admin.telegram.severityHigh"), color: "bg-orange-100 text-orange-700" },
                  4: { label: t("admin.telegram.severityCritical"), color: "bg-red-100 text-red-700" },
                  5: { label: t("admin.telegram.severityExtreme"), color: "bg-red-200 text-red-900" },
                };
                const sev = severityMap[ev.severity] || severityMap[1];
                const eventTypeMap: Record<string, { icon: string; color: string }> = {
                  bombing: { icon: "\uD83D\uDCA3", color: "bg-red-100 text-red-800" },
                  airstrike: { icon: "\u2708\uFE0F", color: "bg-red-100 text-red-800" },
                  shelling: { icon: "\uD83D\uDCA5", color: "bg-orange-100 text-orange-800" },
                  shooting: { icon: "\uD83D\uDD2B", color: "bg-red-100 text-red-800" },
                  flood: { icon: "\uD83C\uDF0A", color: "bg-blue-100 text-blue-800" },
                  earthquake: { icon: "\uD83C\uDF0D", color: "bg-amber-100 text-amber-800" },
                  fire: { icon: "\uD83D\uDD25", color: "bg-orange-100 text-orange-800" },
                  displacement: { icon: "\uD83C\uDFDA\uFE0F", color: "bg-gray-100 text-gray-800" },
                  medical: { icon: "\uD83C\uDFE5", color: "bg-green-100 text-green-800" },
                  infrastructure: { icon: "\uD83C\uDFD7\uFE0F", color: "bg-slate-100 text-slate-800" },
                  other: { icon: "\uD83D\uDCCB", color: "bg-gray-100 text-gray-700" },
                };
                const evType = eventTypeMap[ev.event_type] || eventTypeMap.other;
                return (
                  <div key={ev.id} className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${evType.color}`}>
                        <span>{evType.icon}</span>
                        {ev.event_type}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sev.color}`}>{sev.label}</span>
                      {ev.confidence != null && (
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          {t("admin.telegram.confidence")}: {(ev.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className="ms-auto text-xs text-gray-400">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "\u2014"}
                      </span>
                    </div>
                    {ev.title && <h4 className="mt-2 text-sm font-semibold text-gray-900">{ev.title}</h4>}
                    {ev.details && <p className="mt-1 text-sm text-gray-600">{ev.details}</p>}
                    {ev.original_text && (
                      <div className="mt-3 rounded-md bg-gray-50 p-3">
                        <p className="mb-1 text-xs font-medium text-gray-400">{t("admin.telegram.originalText")}</p>
                        <p className="whitespace-pre-wrap text-sm text-gray-700" dir="auto">{ev.original_text}</p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                      {ev.source_channel && (
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          @{ev.source_channel}
                        </span>
                      )}
                      {ev.latitude != null && ev.longitude != null && (
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== AUTH MODAL ========== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">
              {t("admin.telegram.authTitle")}
            </h3>
            <p className="mb-5 text-sm text-gray-500">
              {authStep === "sending"
                ? t("admin.telegram.authSending")
                : authStep === "2fa"
                  ? t("admin.telegram.auth2faPrompt")
                  : t("admin.telegram.authCodePrompt", { phone: `***${authPhoneHint}` })}
            </p>

            {authStep === "sending" && (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
              </div>
            )}

            {(authStep === "code" || authStep === "verifying") && (
              <div className="space-y-4">
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder={t("admin.telegram.authCodePlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-widest focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  maxLength={10}
                  autoFocus
                />
                {authError && <p className="text-sm text-red-600">{authError}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleVerifyCode}
                    disabled={authCode.length < 3 || authStep === "verifying"}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {authStep === "verifying" ? t("common.loading") : t("admin.telegram.authVerify")}
                  </button>
                </div>
              </div>
            )}

            {authStep === "2fa" && (
              <div className="space-y-4">
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={t("admin.telegram.auth2faPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  autoFocus
                />
                {authError && <p className="text-sm text-red-600">{authError}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleVerifyCode}
                    disabled={!authPassword}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {t("admin.telegram.authVerify")}
                  </button>
                </div>
              </div>
            )}

            {authStep === "idle" && authError && (
              <div className="space-y-4">
                <p className="text-sm text-red-600">{authError}</p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleStartAuth}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700"
                  >
                    {t("admin.retry")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== DISCOVER CHANNELS MODAL ========== */}
      {showDiscoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.telegram.discoverChannels")}
              </h3>
              <button
                onClick={() => { setShowDiscoverModal(false); setSelectedDiscovered(new Set()); setDiscoverSearch(""); }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="border-b px-6 py-3">
              <input
                type="text"
                value={discoverSearch}
                onChange={(e) => setDiscoverSearch(e.target.value)}
                placeholder={t("admin.telegram.searchChannels")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {discoverLoading ? (
                <div className="py-12 text-center text-gray-500">{t("common.loading")}</div>
              ) : filteredDiscovered.length === 0 ? (
                <div className="py-12 text-center text-gray-500">{t("admin.telegram.noDiscoveredChannels")}</div>
              ) : (
                <div className="space-y-2">
                  {filteredDiscovered.map((ch) => (
                    <label
                      key={ch.chat_id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedDiscovered.has(ch.chat_id) ? "border-purple-300 bg-purple-50" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDiscovered.has(ch.chat_id)}
                        onChange={() => toggleDiscoverSelect(ch.chat_id)}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{ch.name}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className={`rounded px-1.5 py-0.5 ${ch.type === "channel" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {ch.type}
                          </span>
                          {ch.username && <span>@{ch.username}</span>}
                          {ch.participants_count != null && <span>{ch.participants_count.toLocaleString()} members</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-6 py-4">
              <span className="text-sm text-gray-500">{selectedDiscovered.size} {t("admin.telegram.selected")}</span>
              <button
                onClick={handleImportSelected}
                disabled={selectedDiscovered.size === 0 || importLoading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {importLoading ? t("common.loading") : t("admin.telegram.importSelected")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ADD CHANNEL MODAL ========== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.telegram.addChannel")}</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.telegram.username")}</label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  placeholder={t("admin.telegram.usernamePlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.telegram.category")}</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="crisis">{t("admin.telegram.categoryOptions.crisis")}</option>
                  <option value="news">{t("admin.telegram.categoryOptions.news")}</option>
                  <option value="medical">{t("admin.telegram.categoryOptions.medical")}</option>
                  <option value="unknown">{t("admin.telegram.categoryOptions.unknown")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.telegram.language")}</label>
                <select
                  value={addForm.language}
                  onChange={(e) => setAddForm({ ...addForm, language: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="ar">{"\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={addLoading} className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
                  {addLoading ? t("common.loading") : t("admin.telegram.addChannel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== REMOVE CONFIRMATION MODAL ========== */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">{t("admin.telegram.confirmRemove")}</h3>
            <p className="mb-6 text-sm text-gray-600">
              {t("admin.telegram.confirmRemoveMessage", {
                name: showRemoveModal.channel_name || `@${showRemoveModal.channel_id}`,
              })}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRemoveModal(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {t("common.cancel")}
              </button>
              <button onClick={handleRemove} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
                {t("admin.telegram.removeChannel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MESSAGES MODAL ========== */}
      {showMessagesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("admin.telegram.messages")} {"\u2014"} {showMessagesModal.channel_name || `@${showMessagesModal.channel_id}`}
              </h3>
              <button onClick={() => { setShowMessagesModal(null); setMessages([]); }} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {messagesLoading ? (
                <div className="py-12 text-center text-gray-500">{t("common.loading")}</div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center text-gray-500">{t("admin.telegram.noMessages")}</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="whitespace-pre-wrap text-sm text-gray-800" dir="auto">{msg.text}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                        <span>{new Date(msg.date).toLocaleString()}</span>
                        {msg.views != null && <span>{msg.views.toLocaleString()} views</span>}
                        {msg.forwards != null && <span>{msg.forwards.toLocaleString()} forwards</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== DISCONNECT CONFIRMATION MODAL ========== */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              {t("admin.telegram.confirmDisconnect")}
            </h3>
            <p className="mb-6 text-sm text-gray-600">
              {t("admin.telegram.confirmDisconnectMessage")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnectLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnectLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {disconnectLoading ? t("common.loading") : t("admin.telegram.disconnect")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialMediaPage;
