/**
 * API service for TMT backend communication.
 * Uses the native fetch API with automatic JWT token management.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_PREFIX = "/api/v1";

// ─── Token helpers ──────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem("tmt-token");
}

function clearAuth(): void {
  localStorage.removeItem("tmt-token");
  localStorage.removeItem("tmt-user");
  window.location.href = "/login";
}

// ─── Core fetch wrapper ─────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  noAuth?: boolean;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, noAuth = false } = options;

  const url = `${API_BASE}${API_PREFIX}${endpoint}`;
  const token = getToken();

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token && !noAuth) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: reqHeaders,
  };

  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401 - unauthorized
  if (response.status === 401) {
    clearAuth();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ||
        `Request failed with status ${response.status}`
    );
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ─── Auth endpoints ─────────────────────────────────────────────

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
  user_id: string;
  hospital_id?: string;
  patient_id?: string;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: data,
    noAuth: true,
  });
}

// ─── Patient endpoints ──────────────────────────────────────────

export interface RegisterPatientRequest {
  phone: string;
  password: string;
  name: string;
  latitude?: number;
  longitude?: number;
  mobility?: string;
  living_situation?: string;
  blood_type?: string;
  emergency_contacts?: Array<{ name: string; phone: string }>;
}

export function registerPatient(data: RegisterPatientRequest) {
  return request("/patients", {
    method: "POST",
    body: data,
    noAuth: true,
  });
}

export interface Patient {
  id: string;
  phone: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  mobility: string;
  living_situation: string;
  blood_type: string | null;
  emergency_contacts: Array<{ name: string; phone: string }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function getPatient(patientId: string): Promise<Patient> {
  return request<Patient>(`/patients/${patientId}`);
}

export function updatePatient(
  patientId: string,
  data: Partial<Patient>
): Promise<Patient> {
  return request<Patient>(`/patients/${patientId}`, {
    method: "PUT",
    body: data,
  });
}

// ─── Hospital endpoints ─────────────────────────────────────────

export interface RegisterHospitalRequest {
  name: string;
  phone: string;
  password: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  bed_capacity?: number;
  icu_beds?: number;
  specialties?: string[];
  coverage_radius_km?: number;
}

export function registerHospital(data: RegisterHospitalRequest) {
  return request("/hospitals", {
    method: "POST",
    body: data,
    noAuth: true,
  });
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  bed_capacity: number;
  icu_beds: number;
  available_beds: number;
  specialties: string[];
  coverage_radius_km: number;
  phone: string | null;
  supply_levels: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export function getHospitals(): Promise<Hospital[]> {
  return request<Hospital[]>("/hospitals");
}

export function updateHospitalStatus(
  hospitalId: string,
  data: {
    status?: string;
    available_beds?: number;
    supply_levels?: Record<string, string>;
  }
): Promise<Hospital> {
  return request<Hospital>(`/hospitals/${hospitalId}/status`, {
    method: "PUT",
    body: data,
  });
}

// ─── Alert endpoints ────────────────────────────────────────────

export interface Alert {
  id: string;
  event_type: string;
  severity: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  title: string;
  details: string | null;
  source: string | null;
  confidence: number;
  acknowledged: string | null;
  affected_patients_count: number;
  created_at: string;
  expires_at: string | null;
}

export async function getAlerts(params?: {
  severity?: string;
  event_type?: string;
  limit?: number;
  offset?: number;
}): Promise<Alert[]> {
  const searchParams = new URLSearchParams();
  if (params?.severity) searchParams.set("severity", params.severity);
  if (params?.event_type) searchParams.set("event_type", params.event_type);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  const data = await request<{ alerts: Alert[]; total: number }>(`/alerts${qs ? `?${qs}` : ""}`);
  return data.alerts;
}

// ─── SOS endpoints ──────────────────────────────────────────────

export interface SOSRequest {
  latitude: number;
  longitude: number;
  patient_status?: string;
  severity?: number;
  details?: string;
}

export interface SOSResponse {
  id: string;
  patient_id: string;
  status: string;
  hospital_notified_id: string | null;
  created_at: string;
}

export function createSOS(data: SOSRequest): Promise<SOSResponse> {
  return request<SOSResponse>("/sos", {
    method: "POST",
    body: data,
  });
}

// ─── Analytics endpoints ────────────────────────────────────────

export interface AnalyticsStats {
  total_patients: number;
  active_alerts: number;
  hospitals_operational: number;
  hospitals_total: number;
  sos_pending: number;
  sos_today: number;
  patients_at_risk: number;
}

export function getAnalyticsStats(): Promise<AnalyticsStats> {
  return request<AnalyticsStats>("/analytics/stats");
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number;
  type: string;
}

export function getHeatmapData(): Promise<HeatmapPoint[]> {
  return request<HeatmapPoint[]>("/analytics/heatmap");
}

// ─── Map endpoints ──────────────────────────────────────────────

export interface MapEvent {
  id: string;
  event_type: string;
  latitude: number;
  longitude: number;
  source: string;
  severity: number;
  title: string | null;
  details: string | null;
  layer: string;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
}

export function getMapEvents(params?: {
  hours?: number;
  layer?: string;
}): Promise<MapEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.hours) searchParams.set("hours", String(params.hours));
  if (params?.layer) searchParams.set("layer", params.layer);
  const qs = searchParams.toString();
  return request<{ events: MapEvent[] }>(`/map/events${qs ? `?${qs}` : ""}`).then(
    (res) => res.events
  );
}
