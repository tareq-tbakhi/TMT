const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("tmt-token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface TelegramChannel {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_url: string | null;
  trust_score: number;
  total_reports: number;
  verified_reports: number;
  false_reports: number;
  unverified_reports: number;
  monitoring_status: string;
  last_verified_at: string | null;
  created_at: string | null;
}

export interface TelegramMessage {
  id: number;
  text: string;
  date: string;
  channel: string;
  views: number | null;
  forwards: number | null;
}

export interface TelegramStatus {
  connected: boolean;
  configured: boolean;
  monitored_channels: number;
  session_exists: boolean;
}

export interface TelegramDiscoveredChannel {
  chat_id: string;
  name: string;
  username: string | null;
  type: "channel" | "group";
  participants_count: number | null;
}

export interface TelegramEvent {
  id: string;
  event_type: string;
  severity: number;
  title: string | null;
  details: string | null;
  latitude: number | null;
  longitude: number | null;
  source_channel: string | null;
  confidence: number | null;
  original_text: string | null;
  created_at: string | null;
}

export interface TelegramLiveMessage {
  id: number;
  text: string;
  date: string;
  chat_id: string;
  channel: string;
  channel_name: string;
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const res = await fetch(`${API_URL}/api/v1/telegram/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function getTelegramChannels(): Promise<{
  channels: TelegramChannel[];
  total: number;
}> {
  const res = await fetch(`${API_URL}/api/v1/telegram/channels`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function addTelegramChannel(
  username: string,
  category: string = "unknown",
  language: string = "ar"
): Promise<TelegramChannel> {
  const res = await fetch(`${API_URL}/api/v1/telegram/channels`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ username, category, language }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}

export async function removeTelegramChannel(
  channelId: string
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/v1/telegram/channels/${channelId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
}

export async function togglePauseChannel(
  channelId: string
): Promise<{ status: string }> {
  const res = await fetch(
    `${API_URL}/api/v1/telegram/channels/${channelId}/pause`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    }
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function getChannelMessages(
  channelId: string,
  limit: number = 20
): Promise<TelegramMessage[]> {
  const res = await fetch(
    `${API_URL}/api/v1/telegram/channels/${channelId}/messages?limit=${limit}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function getTelegramEvents(
  hours: number = 24,
  limit: number = 50
): Promise<TelegramEvent[]> {
  const res = await fetch(
    `${API_URL}/api/v1/telegram/events?hours=${hours}&limit=${limit}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function getStoredMessages(
  hours: number = 24,
  limit: number = 200
): Promise<TelegramLiveMessage[]> {
  const res = await fetch(
    `${API_URL}/api/v1/telegram/messages?hours=${hours}&limit=${limit}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function connectTelegram(): Promise<{
  status: string;
  message: string;
}> {
  const res = await fetch(`${API_URL}/api/v1/telegram/connect`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}

export async function discoverMyChannels(): Promise<TelegramDiscoveredChannel[]> {
  const res = await fetch(`${API_URL}/api/v1/telegram/my-channels`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.channels;
}

export async function importChannels(
  channels: TelegramDiscoveredChannel[]
): Promise<{ imported: number; channels: string[] }> {
  const res = await fetch(`${API_URL}/api/v1/telegram/import-channels`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ channels }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}

export async function disconnectTelegram(): Promise<{
  status: string;
  purged: { channels: number; events: number; alerts: number };
}> {
  const res = await fetch(`${API_URL}/api/v1/telegram/disconnect`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}

export async function sendTelegramAuthCode(): Promise<{
  status: string;
  phone_hint: string;
}> {
  const res = await fetch(`${API_URL}/api/v1/telegram/auth/send-code`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}

export async function verifyTelegramAuthCode(
  code: string,
  password?: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_URL}/api/v1/telegram/auth/verify-code`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ code, ...(password ? { password } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string }).detail || `Failed: ${res.status}`
    );
  }
  return res.json();
}
