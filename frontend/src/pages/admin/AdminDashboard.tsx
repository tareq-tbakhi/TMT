import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  BellRing,
  Building2,
  Flame,
  HeartPulse,
  LayoutDashboard,
  Shield,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  LoadingState,
  PageHeader,
  StatCard,
  type StatCardProps,
} from "../../components/ui";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface AdminStats {
  total_users: number;
  total_patients: number;
  total_hospitals: number;
  total_police_stations: number;
  total_civil_defense: number;
  total_facilities: number;
  total_alerts: number;
  total_sos: number;
}

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("tmt-token");
        const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch stats: ${res.status}`);
        }

        const data = (await res.json()) as AdminStats;
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("common.error")
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [t]);

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
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          {t("admin.retry")}
        </Button>
      </Card>
    );
  }

  const statCards: {
    key: string;
    label: React.ReactNode;
    value: number;
    tone: StatCardProps["tone"];
    icon: React.ReactNode;
  }[] = [
    {
      key: "users",
      label: t("admin.stats.totalUsers"),
      value: stats?.total_users ?? 0,
      tone: "accent",
      icon: <Users />,
    },
    {
      key: "patients",
      label: t("admin.stats.totalPatients"),
      value: stats?.total_patients ?? 0,
      tone: "success",
      icon: <HeartPulse />,
    },
    {
      key: "alerts",
      label: t("admin.stats.totalAlerts"),
      value: stats?.total_alerts ?? 0,
      tone: "danger",
      icon: <TriangleAlert />,
    },
    {
      key: "sos",
      label: t("admin.stats.totalSOS"),
      value: stats?.total_sos ?? 0,
      tone: "warning",
      icon: <BellRing />,
    },
  ];

  const departments = [
    {
      key: "hospitals",
      label: "Hospitals",
      value: stats?.total_hospitals ?? 0,
      icon: Building2,
      chip: "bg-info-soft text-on-info-soft",
    },
    {
      key: "police",
      label: "Police Stations",
      value: stats?.total_police_stations ?? 0,
      icon: Shield,
      chip: "bg-accent-soft text-on-accent-soft",
    },
    {
      key: "civil_defense",
      label: "Civil Defense",
      value: stats?.total_civil_defense ?? 0,
      icon: Flame,
      chip: "bg-warning-soft text-on-warning-soft",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("admin.dashboard.title")}
        description={t("admin.dashboard.subtitle")}
        icon={<LayoutDashboard />}
      />

      <div className="space-y-6">
        {/* System-wide KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.value.toLocaleString()}
              icon={card.icon}
              tone={card.tone}
            />
          ))}
        </div>

        {/* Department breakdown */}
        <Card>
          <CardHeader
            title="Facilities by Department"
            icon={<Building2 />}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {departments.map((dept) => {
              const Icon = dept.icon;
              return (
                <div
                  key={dept.key}
                  className="flex items-center gap-4 rounded-md border border-edge bg-surface-2 p-4"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${dept.chip}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight text-ink">
                      {dept.value.toLocaleString()}
                    </p>
                    <p className="text-sm font-semibold text-ink-muted">
                      {dept.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader title={t("admin.dashboard.quickActions")} />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              icon={<Building2 />}
              onClick={() => navigate("/admin/hospitals")}
            >
              Manage Facilities
            </Button>
            <Button
              variant="secondary"
              icon={<Users />}
              onClick={() => navigate("/admin/users")}
            >
              {t("admin.dashboard.manageUsers")}
            </Button>
            <Button
              variant="secondary"
              icon={<TriangleAlert />}
              onClick={() => navigate("/admin/alerts")}
            >
              View Alerts
            </Button>
            <Button
              variant="secondary"
              icon={<BarChart3 />}
              onClick={() => navigate("/admin/analytics")}
            >
              Analytics
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
