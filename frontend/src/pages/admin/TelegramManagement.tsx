import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import {
  Activity,
  BadgeCheck,
  Bomb,
  Building2,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Compass,
  Crosshair,
  Flame,
  Hash,
  HeartPulse,
  Lightbulb,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Pause,
  Phone,
  Plane,
  Play,
  Plus,
  Radar,
  RadioTower,
  RefreshCw,
  Search,
  Send,
  Siren,
  Tent,
  Trash2,
  TriangleAlert,
  Unplug,
  Waves,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
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
  StatCard,
  type BadgeTone,
} from "../../components/ui";
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
    icon: <Send aria-hidden="true" className="h-4 w-4" />,
    enabled: true,
  },
  {
    id: "whatsapp" as const,
    label: "admin.socialMedia.platformWhatsApp",
    icon: <Phone aria-hidden="true" className="h-4 w-4" />,
    enabled: false,
  },
  {
    id: "twitter" as const,
    label: "admin.socialMedia.platformTwitter",
    icon: <Hash aria-hidden="true" className="h-4 w-4" />,
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
    <div className="mx-auto max-w-7xl">
      {/* Page header */}
      <PageHeader
        title={t("admin.socialMedia.title")}
        description={t("admin.socialMedia.subtitle")}
        icon={<MessageCircle />}
      />

      {/* Platform sub-tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-edge">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => p.enabled && setActivePlatform(p.id)}
            disabled={!p.enabled}
            aria-pressed={activePlatform === p.id}
            className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              activePlatform === p.id
                ? "border-accent text-accent"
                : p.enabled
                  ? "border-transparent text-ink-muted hover:border-edge-strong hover:text-ink"
                  : "cursor-not-allowed border-transparent text-ink-faint"
            }`}
          >
            {p.icon}
            <span>{t(p.label)}</span>
            {!p.enabled && (
              <Badge tone="neutral" size="sm">
                {t("admin.socialMedia.comingSoon")}
              </Badge>
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
    if (score >= 0.6) return "bg-success-soft text-on-success-soft";
    if (score >= 0.3) return "bg-warning-soft text-on-warning-soft";
    return "bg-danger-soft text-on-danger-soft";
  };

  const getTrustBarColor = (score: number) => {
    if (score >= 0.6) return "bg-success";
    if (score >= 0.3) return "bg-warning";
    return "bg-danger";
  };

  // Status badge
  const getStatusBadge = (s: string) => {
    const toneMap: Record<string, BadgeTone> = {
      active: "success",
      paused: "warning",
      blacklisted: "danger",
      removed: "neutral",
    };
    const labelMap: Record<string, string> = {
      active: t("admin.telegram.statusActive"),
      paused: t("admin.telegram.statusPaused"),
      blacklisted: t("admin.telegram.statusBlacklisted"),
      removed: t("admin.telegram.statusRemoved"),
    };
    return (
      <Badge tone={toneMap[s] ?? "neutral"} size="sm" dot>
        {labelMap[s] || s}
      </Badge>
    );
  };

  if (loading) {
    return <LoadingState label={t("common.loading")} />;
  }

  if (error) {
    return (
      <Card className="border-danger bg-danger-soft text-center">
        <TriangleAlert
          aria-hidden="true"
          className="mx-auto mb-3 h-8 w-8 text-danger"
        />
        <p className="text-base font-semibold text-on-danger-soft">{error}</p>
        <Button variant="danger" className="mt-4" onClick={fetchData}>
          {t("admin.retry")}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Notification toast */}
      {notification && (
        <div
          role="status"
          className={`fixed end-4 top-20 z-50 flex items-center gap-2.5 rounded-md px-4 py-3 shadow-2 ${
            notification.type === "success"
              ? "bg-success text-white"
              : "bg-danger text-white"
          }`}
        >
          {notification.type === "success" ? (
            <CircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Connection status banner + action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Status banner */}
        {status && (
          <Card
            className={`flex-1 ${
              status.connected
                ? "border-success bg-success-soft"
                : status.configured
                  ? "border-warning bg-warning-soft"
                  : "border-danger bg-danger-soft"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    status.connected
                      ? "bg-success text-white"
                      : status.configured
                        ? "bg-warning text-white"
                        : "bg-danger text-white"
                  }`}
                >
                  {status.connected ? (
                    <Wifi className="h-5 w-5" />
                  ) : (
                    <WifiOff className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-bold ${
                      status.connected
                        ? "text-on-success-soft"
                        : status.configured
                          ? "text-on-warning-soft"
                          : "text-on-danger-soft"
                    }`}
                  >
                    {t("admin.telegram.connectionStatus")}:{" "}
                    {status.connected
                      ? t("admin.telegram.connected")
                      : status.configured
                        ? t("admin.telegram.disconnected")
                        : t("admin.telegram.notConfigured")}
                  </p>
                  <p className="text-xs text-ink-muted">
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
              <div className="flex shrink-0 items-center gap-2">
                {(status.connected || channels.length > 0) && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Unplug />}
                    onClick={() => setShowDisconnectModal(true)}
                  >
                    {t("admin.telegram.disconnect")}
                  </Button>
                )}
                {status.configured && !status.connected && (
                  <Button size="sm" onClick={handleConnect}>
                    {t("admin.telegram.connect")}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" icon={<Compass />} onClick={handleDiscover}>
            {t("admin.telegram.discoverChannels")}
          </Button>
          <Button icon={<Plus />} onClick={() => setShowAddModal(true)}>
            {t("admin.telegram.addChannel")}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-edge bg-surface-2 p-1">
        {(["channels", "live", "intel"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              activeTab === tab
                ? "bg-accent text-on-accent shadow-1"
                : "text-ink-muted hover:bg-surface-3 hover:text-ink"
            }`}
          >
            {tab === "channels" && t("admin.telegram.tabChannels")}
            {tab === "live" && t("admin.telegram.tabLive")}
            {tab === "intel" && t("admin.telegram.tabIntel")}
            {tab === "live" && liveMessages.length > 0 && (
              <span
                className={`ms-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  activeTab === tab
                    ? "bg-surface text-accent"
                    : "bg-accent text-on-accent"
                }`}
              >
                {liveMessages.length}
              </span>
            )}
            {tab === "intel" &&
              processingMessages.filter((p) => p.status === "processing").length > 0 && (
                <span className="ms-1.5 inline-flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-warning px-1.5 text-xs font-bold text-white">
                  {processingMessages.filter((p) => p.status === "processing").length}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* ========== CHANNELS TAB ========== */}
      {activeTab === "channels" && (
        <Card flush className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("admin.telegram.username")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("admin.telegram.trustScore")}
                  </th>
                  <th className="hidden px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted md:table-cell">
                    {t("admin.telegram.totalReports")}
                  </th>
                  <th className="hidden px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted lg:table-cell">
                    {t("admin.telegram.verifiedReports")} / {t("admin.telegram.falseReports")}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("admin.telegram.status")}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-bold uppercase tracking-wide text-ink-muted">
                    {t("admin.telegram.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {channels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6">
                      <EmptyState
                        icon={<RadioTower />}
                        title={t("admin.telegram.noChannels")}
                        className="border-0"
                      />
                    </td>
                  </tr>
                ) : (
                  channels.map((ch) => (
                    <tr key={ch.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">
                            {ch.channel_name || `@${ch.channel_id}`}
                          </p>
                          {ch.channel_url && (
                            <a
                              href={ch.channel_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-xs text-link hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                            >
                              {ch.channel_url}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            role="meter"
                            aria-label={t("admin.telegram.trustScore")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(ch.trust_score * 100)}
                            className="h-2 w-20 overflow-hidden rounded-full bg-surface-3"
                          >
                            <div
                              className={`h-full rounded-full ${getTrustBarColor(ch.trust_score)}`}
                              style={{
                                width: `${Math.round(ch.trust_score * 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getTrustColor(ch.trust_score)}`}
                          >
                            {(ch.trust_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-sm text-ink-muted md:table-cell">
                        {ch.total_reports}
                      </td>
                      <td className="hidden px-4 py-3 text-sm lg:table-cell">
                        <span className="font-semibold text-success">{ch.verified_reports}</span>
                        <span className="text-ink-faint">{" / "}</span>
                        <span className="font-semibold text-danger">{ch.false_reports}</span>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(ch.monitoring_status)}</td>
                      <td className="px-4 py-2 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleViewMessages(ch)}
                            aria-label={t("admin.telegram.viewMessages")}
                            title={t("admin.telegram.viewMessages")}
                            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-on-accent-soft focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                          >
                            <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                          </button>
                          {ch.monitoring_status !== "removed" && (
                            <button
                              type="button"
                              onClick={() => handleTogglePause(ch)}
                              aria-label={
                                ch.monitoring_status === "active"
                                  ? t("admin.telegram.statusPaused")
                                  : t("admin.telegram.statusActive")
                              }
                              title={
                                ch.monitoring_status === "active"
                                  ? t("admin.telegram.statusPaused")
                                  : t("admin.telegram.statusActive")
                              }
                              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warning-soft hover:text-on-warning-soft focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                            >
                              {ch.monitoring_status === "active" ? (
                                <Pause aria-hidden="true" className="h-4 w-4" />
                              ) : (
                                <Play aria-hidden="true" className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowRemoveModal(ch)}
                            aria-label={t("admin.telegram.removeChannel")}
                            title={t("admin.telegram.removeChannel")}
                            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========== LIVE FEED TAB ========== */}
      {activeTab === "live" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-danger"></span>
              </span>
              <span className="text-sm font-semibold text-ink">
                {t("admin.telegram.liveMessages")} ({liveMessages.length})
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLiveMessages([])}
            >
              {t("admin.telegram.clearFeed")}
            </Button>
          </div>

          <div
            ref={liveFeedRef}
            className="max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border border-edge bg-surface p-4 shadow-1"
          >
            {liveMessages.length === 0 ? (
              <EmptyState
                icon={<MessageCircle />}
                title={t("admin.telegram.waitingForMessages")}
                description={t("admin.telegram.waitingHint")}
                className="border-0"
              />
            ) : (
              liveMessages.map((msg, idx) => (
                <div
                  key={`${msg.id}-${idx}`}
                  className="rounded-md border border-edge bg-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="accent" size="sm">
                      {msg.channel_name || msg.channel}
                    </Badge>
                    <span className="whitespace-nowrap text-xs text-ink-faint">
                      {new Date(msg.date).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink" dir="auto">
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
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label={t("admin.telegram.intelTotal")}
              value={events.length}
              icon={<Radar />}
              tone="accent"
            />
            <StatCard
              label={t("admin.telegram.intelCritical")}
              value={events.filter((e) => e.severity >= 4).length}
              icon={<Siren />}
              tone="danger"
            />
            <StatCard
              label={t("admin.telegram.intelHighConf")}
              value={events.filter((e) => (e.confidence ?? 0) >= 0.7).length}
              icon={<BadgeCheck />}
              tone="success"
            />
            <StatCard
              label={t("admin.telegram.intelChannels")}
              value={new Set(events.map((e) => e.source_channel).filter(Boolean)).size}
              icon={<RadioTower />}
              tone="info"
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchEvents}
              disabled={eventsLoading}
              icon={<RefreshCw className={eventsLoading ? "animate-spin" : ""} />}
            >
              {t("admin.telegram.refresh")}
            </Button>
          </div>

          {/* --- Real-time AI analysis cards --- */}
          {processingMessages.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProcessingMessages([])}
                >
                  {t("admin.telegram.clearFeed")}
                </Button>
              </div>
              {processingMessages.map((pm) => {
                const sevMap: Record<
                  string,
                  { label: string; card: string; tone: BadgeTone }
                > = {
                  low: { label: "Low", card: "border-sev-low bg-sev-low-soft", tone: "low" },
                  medium: { label: "Medium", card: "border-sev-medium bg-sev-medium-soft", tone: "medium" },
                  high: { label: "High", card: "border-sev-high bg-sev-high-soft", tone: "high" },
                  critical: { label: "Critical", card: "border-sev-critical bg-sev-critical-soft", tone: "critical" },
                  extreme: { label: "Extreme", card: "border-sev-critical bg-sev-critical-soft", tone: "critical" },
                };
                const sevKey = (pm.severity || "").toLowerCase();
                const sev = sevMap[sevKey];
                const cardStyle =
                  pm.status === "processing"
                    ? "border-warning bg-warning-soft"
                    : pm.is_crisis && sev
                      ? sev.card
                      : !pm.is_crisis
                        ? "border-success bg-success-soft"
                        : "border-edge bg-surface";

                return (
                  <div
                    key={pm.message_id}
                    className={`relative rounded-lg border p-4 shadow-1 transition-all ${cardStyle}`}
                  >
                    {pm.status !== "processing" && (
                      <button
                        type="button"
                        onClick={() =>
                          setProcessingMessages((prev) =>
                            prev.filter((p) => p.message_id !== pm.message_id)
                          )
                        }
                        aria-label="Dismiss"
                        title="Dismiss"
                        className="absolute end-1 top-1 flex h-11 w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                    {pm.status === "processing" ? (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning"></span>
                            </span>
                            <span className="text-xs font-bold text-on-warning-soft">Processing...</span>
                          </div>
                          <span className="text-xs text-ink-faint">
                            {pm.date ? new Date(pm.date).toLocaleTimeString() : ""}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone="accent" size="sm">
                            {pm.channel_name || pm.channel}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-ink" dir="auto">
                          {pm.text}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            aria-hidden="true"
                            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
                          >
                            <div className="h-full w-2/3 animate-pulse rounded-full bg-warning"></div>
                          </div>
                          <span className="text-xs font-medium text-on-warning-soft">
                            Analyzing with AI
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2 pe-10">
                          {/* Classification badge */}
                          {pm.is_crisis ? (
                            <Badge tone={sev ? sev.tone : "critical"} size="sm">
                              {sev ? sev.label : "Threat"}
                            </Badge>
                          ) : (
                            <Badge tone="success" size="sm">
                              No Threat
                            </Badge>
                          )}
                          {/* Event type */}
                          {pm.event_type && (
                            <Badge tone={pm.is_crisis ? "danger" : "neutral"} size="sm">
                              {pm.event_type}
                            </Badge>
                          )}
                          {/* Confidence */}
                          {pm.confidence != null && (
                            <Badge tone="accent" size="sm">
                              {(pm.confidence * 100).toFixed(0)}%
                            </Badge>
                          )}
                          <span className="ms-auto text-xs text-ink-faint">
                            {pm.date ? new Date(pm.date).toLocaleTimeString() : ""}
                          </span>
                        </div>
                        {/* Channel */}
                        <div className="mt-2">
                          <Badge tone="accent" size="sm">
                            {pm.channel_name || pm.channel}
                          </Badge>
                        </div>
                        {/* AI details / summary */}
                        {pm.details && (
                          <p className="mt-2 text-sm font-semibold text-ink">{pm.details}</p>
                        )}
                        {/* Original text */}
                        <div className="mt-2 rounded-md border border-edge bg-surface p-2">
                          <p className="text-xs text-ink-muted" dir="auto">{pm.text}</p>
                        </div>
                        {/* Location if available */}
                        {pm.latitude != null && pm.longitude != null && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
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
            <LoadingState label={t("common.loading")} />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Lightbulb />}
              title={t("admin.telegram.noEvents")}
              description={t("admin.telegram.noEventsHint")}
            />
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const severityMap: Record<number, { label: string; tone: BadgeTone }> = {
                  1: { label: t("admin.telegram.severityLow"), tone: "low" },
                  2: { label: t("admin.telegram.severityMedium"), tone: "medium" },
                  3: { label: t("admin.telegram.severityHigh"), tone: "high" },
                  4: { label: t("admin.telegram.severityCritical"), tone: "critical" },
                  5: { label: t("admin.telegram.severityExtreme"), tone: "critical" },
                };
                const sev = severityMap[ev.severity] || severityMap[1];
                const eventTypeMap: Record<
                  string,
                  { icon: React.ReactNode; tone: BadgeTone }
                > = {
                  bombing: { icon: <Bomb />, tone: "danger" },
                  airstrike: { icon: <Plane />, tone: "danger" },
                  shelling: { icon: <Zap />, tone: "high" },
                  shooting: { icon: <Crosshair />, tone: "danger" },
                  flood: { icon: <Waves />, tone: "info" },
                  earthquake: { icon: <Activity />, tone: "warning" },
                  fire: { icon: <Flame />, tone: "high" },
                  displacement: { icon: <Tent />, tone: "neutral" },
                  medical: { icon: <HeartPulse />, tone: "success" },
                  infrastructure: { icon: <Building2 />, tone: "neutral" },
                  other: { icon: <ClipboardList />, tone: "neutral" },
                };
                const evType = eventTypeMap[ev.event_type] || eventTypeMap.other;
                return (
                  <Card key={ev.id} className="transition-shadow hover:shadow-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={evType.tone} size="sm" icon={evType.icon}>
                        {ev.event_type}
                      </Badge>
                      <Badge tone={sev.tone} size="sm">{sev.label}</Badge>
                      {ev.confidence != null && (
                        <Badge tone="accent" size="sm">
                          {t("admin.telegram.confidence")}: {(ev.confidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                      <span className="ms-auto text-xs text-ink-faint">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : "—"}
                      </span>
                    </div>
                    {ev.title && <h4 className="mt-2 text-sm font-bold text-ink">{ev.title}</h4>}
                    {ev.details && <p className="mt-1 text-sm text-ink-muted">{ev.details}</p>}
                    {ev.original_text && (
                      <div className="mt-3 rounded-md bg-surface-2 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                          {t("admin.telegram.originalText")}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-ink-muted" dir="auto">
                          {ev.original_text}
                        </p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                      {ev.source_channel && (
                        <span className="flex items-center gap-1">
                          <Send aria-hidden="true" className="h-3.5 w-3.5" />
                          @{ev.source_channel}
                        </span>
                      )}
                      {ev.latitude != null && ev.longitude != null && (
                        <span className="flex items-center gap-1">
                          <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                          {ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== AUTH MODAL ========== */}
      {showAuthModal && (
        <Modal
          open
          onClose={() => { setShowAuthModal(false); setAuthStep("idle"); }}
          title={t("admin.telegram.authTitle")}
          description={
            authStep === "sending"
              ? t("admin.telegram.authSending")
              : authStep === "2fa"
                ? t("admin.telegram.auth2faPrompt")
                : t("admin.telegram.authCodePrompt", { phone: `***${authPhoneHint}` })
          }
          size="sm"
          dismissible={false}
        >
          {authStep === "sending" && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" label={t("admin.telegram.authSending")} />
            </div>
          )}

          {(authStep === "code" || authStep === "verifying") && (
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder={t("admin.telegram.authCodePlaceholder")}
                aria-label={t("admin.telegram.authCodePlaceholder")}
                className="min-h-12 w-full rounded-md border border-edge-strong bg-surface px-3.5 text-center text-lg font-semibold tracking-widest text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1"
                maxLength={10}
                autoFocus
              />
              {authError && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {authError}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleVerifyCode}
                  disabled={authCode.length < 3 || authStep === "verifying"}
                  loading={authStep === "verifying"}
                >
                  {t("admin.telegram.authVerify")}
                </Button>
              </div>
            </div>
          )}

          {authStep === "2fa" && (
            <div className="flex flex-col gap-4">
              <Input
                label={t("admin.telegram.auth2faPlaceholder")}
                hideLabel
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={t("admin.telegram.auth2faPlaceholder")}
                autoFocus
              />
              {authError && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {authError}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                >
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleVerifyCode} disabled={!authPassword}>
                  {t("admin.telegram.authVerify")}
                </Button>
              </div>
            </div>
          )}

          {authStep === "idle" && authError && (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                {authError}
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => { setShowAuthModal(false); setAuthStep("idle"); }}
                >
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleStartAuth}>{t("admin.retry")}</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ========== DISCOVER CHANNELS MODAL ========== */}
      {showDiscoverModal && (
        <Modal
          open
          onClose={() => { setShowDiscoverModal(false); setSelectedDiscovered(new Set()); setDiscoverSearch(""); }}
          title={t("admin.telegram.discoverChannels")}
          footer={
            <>
              <span className="me-auto text-sm text-ink-muted">
                {selectedDiscovered.size} {t("admin.telegram.selected")}
              </span>
              <Button
                onClick={handleImportSelected}
                disabled={selectedDiscovered.size === 0 || importLoading}
                loading={importLoading}
              >
                {t("admin.telegram.importSelected")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="text"
                value={discoverSearch}
                onChange={(e) => setDiscoverSearch(e.target.value)}
                placeholder={t("admin.telegram.searchChannels")}
                aria-label={t("admin.telegram.searchChannels")}
                className="min-h-11 w-full rounded-md border border-edge-strong bg-surface ps-10 pe-3.5 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1"
              />
            </div>
            {discoverLoading ? (
              <LoadingState label={t("common.loading")} />
            ) : filteredDiscovered.length === 0 ? (
              <EmptyState
                icon={<Compass />}
                title={t("admin.telegram.noDiscoveredChannels")}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredDiscovered.map((ch) => (
                  <label
                    key={ch.chat_id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                      selectedDiscovered.has(ch.chat_id)
                        ? "border-accent bg-accent-soft"
                        : "border-edge hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDiscovered.has(ch.chat_id)}
                      onChange={() => toggleDiscoverSelect(ch.chat_id)}
                      className="h-5 w-5 shrink-0 rounded border-edge-strong accent-accent focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{ch.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Badge tone={ch.type === "channel" ? "info" : "success"} size="sm">
                          {ch.type}
                        </Badge>
                        {ch.username && <span>@{ch.username}</span>}
                        {ch.participants_count != null && (
                          <span>{ch.participants_count.toLocaleString()} members</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========== ADD CHANNEL MODAL ========== */}
      {showAddModal && (
        <Modal
          open
          onClose={() => setShowAddModal(false)}
          title={t("admin.telegram.addChannel")}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" form="add-channel-form" loading={addLoading}>
                {t("admin.telegram.addChannel")}
              </Button>
            </>
          }
        >
          <form id="add-channel-form" onSubmit={handleAdd} className="flex flex-col gap-4">
            <Input
              label={t("admin.telegram.username")}
              value={addForm.username}
              onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
              placeholder={t("admin.telegram.usernamePlaceholder")}
              required
            />
            <Select
              label={t("admin.telegram.category")}
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
            >
              <option value="crisis">{t("admin.telegram.categoryOptions.crisis")}</option>
              <option value="news">{t("admin.telegram.categoryOptions.news")}</option>
              <option value="medical">{t("admin.telegram.categoryOptions.medical")}</option>
              <option value="unknown">{t("admin.telegram.categoryOptions.unknown")}</option>
            </Select>
            <Select
              label={t("admin.telegram.language")}
              value={addForm.language}
              onChange={(e) => setAddForm({ ...addForm, language: e.target.value })}
            >
              <option value="ar">{"العربية"}</option>
              <option value="en">English</option>
            </Select>
          </form>
        </Modal>
      )}

      {/* ========== REMOVE CONFIRMATION MODAL ========== */}
      {showRemoveModal && (
        <Modal
          open
          onClose={() => setShowRemoveModal(null)}
          title={t("admin.telegram.confirmRemove")}
          size="sm"
          dismissible={false}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowRemoveModal(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" icon={<Trash2 />} onClick={handleRemove}>
                {t("admin.telegram.removeChannel")}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <TriangleAlert className="h-5 w-5" />
            </span>
            <p className="text-sm text-ink-muted">
              {t("admin.telegram.confirmRemoveMessage", {
                name: showRemoveModal.channel_name || `@${showRemoveModal.channel_id}`,
              })}
            </p>
          </div>
        </Modal>
      )}

      {/* ========== MESSAGES MODAL ========== */}
      {showMessagesModal && (
        <Modal
          open
          onClose={() => { setShowMessagesModal(null); setMessages([]); }}
          title={`${t("admin.telegram.messages")} — ${showMessagesModal.channel_name || `@${showMessagesModal.channel_id}`}`}
          size="lg"
        >
          {messagesLoading ? (
            <LoadingState label={t("common.loading")} />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText />}
              title={t("admin.telegram.noMessages")}
            />
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="rounded-md border border-edge bg-surface-2 p-3">
                  <p className="whitespace-pre-wrap text-sm text-ink" dir="auto">{msg.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-faint">
                    <span>{new Date(msg.date).toLocaleString()}</span>
                    {msg.views != null && <span>{msg.views.toLocaleString()} views</span>}
                    {msg.forwards != null && <span>{msg.forwards.toLocaleString()} forwards</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ========== DISCONNECT CONFIRMATION MODAL ========== */}
      {showDisconnectModal && (
        <Modal
          open
          onClose={() => setShowDisconnectModal(false)}
          title={t("admin.telegram.confirmDisconnect")}
          size="sm"
          dismissible={false}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnectLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                icon={<Unplug />}
                loading={disconnectLoading}
                onClick={handleDisconnect}
              >
                {t("admin.telegram.disconnect")}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
            >
              <TriangleAlert className="h-5 w-5" />
            </span>
            <p className="text-sm text-ink-muted">
              {t("admin.telegram.confirmDisconnectMessage")}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SocialMediaPage;
