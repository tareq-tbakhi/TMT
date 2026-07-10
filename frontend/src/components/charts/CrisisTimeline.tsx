import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Activity } from 'lucide-react';
import { Card, CardHeader } from '../ui';

interface TimelineDataPoint {
  date: string;
  casualties: number;
  sos_requests: number;
  alerts: number;
}

interface CrisisTimelineProps {
  data: TimelineDataPoint[];
  height?: number;
}

const AXIS_TICK = { fontSize: 12, fill: 'var(--t-ink-muted)' };

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--t-surface)',
  border: '1px solid var(--t-border)',
  borderRadius: 'var(--t-radius-sm)',
  boxShadow: 'var(--t-shadow-2)',
  color: 'var(--t-ink)',
};

const CrisisTimeline: React.FC<CrisisTimelineProps> = ({ data, height = 300 }) => {
  return (
    <Card>
      <CardHeader title="Crisis Activity Timeline" icon={<Activity />} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
          <XAxis
            dataKey="date"
            tick={AXIS_TICK}
            stroke="var(--t-border-strong)"
            tickLine={{ stroke: 'var(--t-border-strong)' }}
          />
          <YAxis
            tick={AXIS_TICK}
            stroke="var(--t-border-strong)"
            tickLine={{ stroke: 'var(--t-border-strong)' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--t-ink)', fontWeight: 600 }}
            cursor={{ stroke: 'var(--t-border-strong)' }}
          />
          <Legend wrapperStyle={{ color: 'var(--t-ink-muted)' }} />
          <Line
            type="monotone"
            dataKey="casualties"
            stroke="var(--t-sev-critical)"
            strokeWidth={2}
            dot={false}
            name="Casualties"
          />
          <Line
            type="monotone"
            dataKey="sos_requests"
            stroke="var(--t-sev-high)"
            strokeWidth={2}
            dot={false}
            name="SOS Requests"
          />
          <Line
            type="monotone"
            dataKey="alerts"
            stroke="var(--t-accent)"
            strokeWidth={2}
            dot={false}
            name="Alerts"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default CrisisTimeline;
