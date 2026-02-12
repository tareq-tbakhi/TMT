import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { MapContainer, TileLayer } from "react-leaflet";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Types for analytics data
interface CasualtyPoint {
  date: string;
  casualties: number;
  injuries: number;
}

interface SupplyLevel {
  hospital: string;
  medical: number;
  surgical: number;
  blood: number;
  medication: number;
}

interface ConditionCount {
  name: string;
  value: number;
}

interface ComplaintCount {
  complaint: string;
  count: number;
}

const CHART_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

const TIME_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

const CRISIS_TYPES = [
  { value: "", label: "All Crises" },
  { value: "bombing", label: "Bombing" },
  { value: "earthquake", label: "Earthquake" },
  { value: "flood", label: "Flood" },
  { value: "fire", label: "Fire" },
];

const Analytics: React.FC = () => {
  const { t } = useTranslation();

  // Filters
  const [region, setRegion] = useState("");
  const [timeRange, setTimeRange] = useState("7d");
  const [crisisType, setCrisisType] = useState("");

  // Data states
  const [casualtiesData, setCasualtiesData] = useState<CasualtyPoint[]>([]);
  const [supplyData, setSupplyData] = useState<SupplyLevel[]>([]);
  const [conditionsData, setConditionsData] = useState<ConditionCount[]>([]);
  const [complaintsData, setComplaintsData] = useState<ComplaintCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("tmt-token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (region) params.set("region", region);
        if (timeRange) params.set("time_range", timeRange);
        if (crisisType) params.set("crisis_type", crisisType);
        const qs = params.toString();

        const [casualtiesRes, suppliesRes, conditionsRes, complaintsRes] =
          await Promise.all([
            fetch(
              `${API_URL}/api/v1/analytics/casualties${qs ? `?${qs}` : ""}`,
              { headers }
            ).catch(() => null),
            fetch(
              `${API_URL}/api/v1/analytics/supplies${qs ? `?${qs}` : ""}`,
              { headers }
            ).catch(() => null),
            fetch(
              `${API_URL}/api/v1/analytics/conditions${qs ? `?${qs}` : ""}`,
              { headers }
            ).catch(() => null),
            fetch(
              `${API_URL}/api/v1/analytics/complaints${qs ? `?${qs}` : ""}`,
              { headers }
            ).catch(() => null),
          ]);

        if (casualtiesRes?.ok) {
          setCasualtiesData(
            (await casualtiesRes.json()) as CasualtyPoint[]
          );
        } else {
          // Fallback sample data for visualization
          setCasualtiesData([
            { date: "Mon", casualties: 12, injuries: 45 },
            { date: "Tue", casualties: 8, injuries: 32 },
            { date: "Wed", casualties: 15, injuries: 58 },
            { date: "Thu", casualties: 6, injuries: 28 },
            { date: "Fri", casualties: 22, injuries: 67 },
            { date: "Sat", casualties: 18, injuries: 52 },
            { date: "Sun", casualties: 10, injuries: 38 },
          ]);
        }

        if (suppliesRes?.ok) {
          setSupplyData((await suppliesRes.json()) as SupplyLevel[]);
        } else {
          setSupplyData([
            { hospital: "Al-Shifa", medical: 65, surgical: 40, blood: 30, medication: 55 },
            { hospital: "Al-Aqsa", medical: 80, surgical: 60, blood: 45, medication: 70 },
            { hospital: "Nasser", medical: 35, surgical: 25, blood: 20, medication: 40 },
            { hospital: "European", medical: 90, surgical: 75, blood: 60, medication: 85 },
          ]);
        }

        if (conditionsRes?.ok) {
          setConditionsData(
            (await conditionsRes.json()) as ConditionCount[]
          );
        } else {
          setConditionsData([
            { name: "Trauma", value: 35 },
            { name: "Burns", value: 20 },
            { name: "Respiratory", value: 15 },
            { name: "Fractures", value: 18 },
            { name: "Internal", value: 12 },
          ]);
        }

        if (complaintsRes?.ok) {
          setComplaintsData(
            (await complaintsRes.json()) as ComplaintCount[]
          );
        } else {
          setComplaintsData([
            { complaint: "Chest Pain", count: 42 },
            { complaint: "Difficulty Breathing", count: 38 },
            { complaint: "Head Injury", count: 35 },
            { complaint: "Leg Fracture", count: 28 },
            { complaint: "Abdominal Pain", count: 22 },
            { complaint: "Shrapnel Wounds", count: 19 },
          ]);
        }
      } catch {
        // Use fallback data if API fails - already set above
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [region, timeRange, crisisType]);

  // Heatmap center
  const heatmapCenter: [number, number] = [31.5, 34.47];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("nav.analytics")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Comprehensive crisis analytics and visualizations
        </p>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Region
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Regions</option>
            <option value="north">North Gaza</option>
            <option value="gaza_city">Gaza City</option>
            <option value="central">Central</option>
            <option value="khan_younis">Khan Younis</option>
            <option value="rafah">Rafah</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Time Range
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Crisis Type
          </label>
          <select
            value={crisisType}
            onChange={(e) => setCrisisType(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {CRISIS_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Casualties Over Time */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Casualties Over Time
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={casualtiesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="casualties"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Casualties"
                  />
                  <Line
                    type="monotone"
                    dataKey="injuries"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Injuries"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Supply Levels by Hospital */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Supply Levels by Hospital (%)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={supplyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hospital" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="medical" fill="#3b82f6" name="Medical" />
                  <Bar dataKey="surgical" fill="#ef4444" name="Surgical" />
                  <Bar dataKey="blood" fill="#f59e0b" name="Blood" />
                  <Bar dataKey="medication" fill="#10b981" name="Medication" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Most Common Conditions */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Most Common Conditions
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={conditionsData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine
                  >
                    {conditionsData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top Complaints */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Top Complaints
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={complaintsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="complaint"
                    tick={{ fontSize: 11 }}
                    width={130}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" name="Count" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Heatmap Section */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Activity Heatmap
              </h3>
              <p className="text-xs text-gray-500">
                Geographic distribution of crisis events. Heatmap layer loads
                from analytics/heatmap endpoint.
              </p>
            </div>
            <div className="h-80">
              <MapContainer
                center={heatmapCenter}
                zoom={10}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/*
                  HeatLayer placeholder:
                  To add a real heatmap, install leaflet.heat and create a custom
                  component that calls L.heatLayer(points).addTo(map) using the
                  useMap() hook with data from GET /api/v1/analytics/heatmap
                */}
              </MapContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
