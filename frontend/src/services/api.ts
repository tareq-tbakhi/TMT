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
  // Demographics
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  primary_language: string | null;
  // Location
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  // Physical
  mobility: string;
  living_situation: string;
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  // Medical
  chronic_conditions: string[];
  allergies: string[];
  current_medications: string[];
  special_equipment: string[];
  insurance_info: string | null;
  notes: string | null;
  // Contacts
  emergency_contacts: Array<{ name: string; phone: string; relationship?: string }>;
  // System
  false_alarm_count: number;
  total_sos_count: number;
  trust_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  conditions: string[];
  medications: string[];
  allergies: string[];
  special_equipment: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SOSHistoryItem {
  id: string;
  patient_id: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  patient_status: string;
  severity: number;
  source: string;
  hospital_notified_id: string | null;
  origin_hospital_id: string | null;
  auto_resolved: boolean;
  details: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface NearestHospitalResponse {
  hospital: {
    id: string;
    name: string;
    distance_km: number;
    status: string;
    available_beds: number;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  message?: string;
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

export function getPatientRecords(patientId: string): Promise<MedicalRecord[]> {
  return request<MedicalRecord[]>(`/patients/${patientId}/records`);
}

export function getPatientSOS(patientId: string): Promise<SOSHistoryItem[]> {
  return request<SOSHistoryItem[]>(`/patients/${patientId}/sos`);
}

export function getPatientNearestHospital(patientId: string): Promise<NearestHospitalResponse> {
  return request<NearestHospitalResponse>(`/patients/${patientId}/nearest-hospital`);
}

export function updatePatientLocation(
  patientId: string,
  latitude: number,
  longitude: number
): Promise<{ status: string; latitude: number; longitude: number }> {
  return request(`/patients/${patientId}/location`, {
    method: "POST",
    body: { latitude, longitude },
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
  department_type?: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  bed_capacity: number;
  icu_beds: number;
  available_beds: number;
  specialties: string[];
  coverage_radius_km: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  supply_levels: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export function getHospitals(): Promise<Hospital[]> {
  return request<{ hospitals: Hospital[]; total: number }>("/hospitals").then(
    (res) => res.hospitals
  );
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

export function updateHospitalProfile(
  hospitalId: string,
  data: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
    latitude?: number;
    longitude?: number;
    coverage_radius_km?: number;
  }
): Promise<Hospital> {
  return request<Hospital>(`/hospitals/${hospitalId}/profile`, {
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
  alert_type?: string;
  parent_alert_id?: string | null;
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
  total_hospitals: number;
  operational_hospitals: number;
  active_alerts: number;
  critical_alerts: number;
  pending_sos: number;
  resolved_sos_today: number;
  created_sos_today: number;
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

/** Patient data embedded in SOS / patient map-event metadata. */
export interface MapEventPatientInfo {
  name?: string;
  phone?: string;
  blood_type?: string;
  mobility?: string;
  gender?: string;
  date_of_birth?: string;
  chronic_conditions?: string[];
  allergies?: string[];
  current_medications?: string[];
  special_equipment?: string[];
  emergency_contacts?: Array<{
    name: string;
    phone: string;
    relation?: string;
  }>;
  trust_score?: number;
  total_sos_count?: number;
  false_alarm_count?: number;
}

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

// ─── Aid Request endpoints ─────────────────────────────────────

export interface AidRequest {
  id: string;
  requesting_hospital_id: string;
  requesting_hospital_name?: string;
  category: string;
  title: string;
  description: string | null;
  urgency: string;
  quantity: string | null;
  unit: string | null;
  status: string;
  contact_phone: string | null;
  contact_name: string | null;
  response_count: number;
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
  responses?: AidResponse[];
}

export interface AidResponse {
  id: string;
  aid_request_id: string;
  responding_hospital_id: string;
  responding_hospital_name?: string;
  message: string | null;
  eta_hours: number | null;
  status: string;
  created_at: string;
}

export function getAidRequests(params?: {
  category?: string;
  urgency?: string;
  status_filter?: string;
  limit?: number;
  offset?: number;
}): Promise<{ aid_requests: AidRequest[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.urgency) searchParams.set("urgency", params.urgency);
  if (params?.status_filter) searchParams.set("status_filter", params.status_filter);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return request<{ aid_requests: AidRequest[]; total: number }>(
    `/aid-requests${qs ? `?${qs}` : ""}`
  );
}

export function getAidRequestDetail(id: string): Promise<AidRequest> {
  return request<AidRequest>(`/aid-requests/${id}`);
}

export function createAidRequest(data: {
  category: string;
  title: string;
  description?: string;
  urgency?: string;
  quantity?: string;
  unit?: string;
  contact_phone?: string;
  contact_name?: string;
}): Promise<AidRequest> {
  return request<AidRequest>("/aid-requests", {
    method: "POST",
    body: data,
  });
}

export function respondToAidRequest(
  requestId: string,
  data: { message?: string; eta_hours?: number }
): Promise<AidResponse> {
  return request<AidResponse>(`/aid-requests/${requestId}/respond`, {
    method: "PUT",
    body: data,
  });
}

export function updateAidRequestStatus(
  requestId: string,
  status: string
): Promise<AidRequest> {
  return request<AidRequest>(`/aid-requests/${requestId}/status`, {
    method: "PUT",
    body: { status },
  });
}
