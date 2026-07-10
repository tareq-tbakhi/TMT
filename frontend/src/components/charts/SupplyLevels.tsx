import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Package } from 'lucide-react';
import { Card, CardHeader } from '../ui';

interface SupplyData {
  name: string;
  level: number; // 0-100
  status: 'high' | 'medium' | 'low' | 'critical';
}

interface SupplyLevelsProps {
  data: SupplyData[];
  height?: number;
}

const STATUS_COLORS: Record<string, string> = {
  high: 'var(--t-success)',
  medium: 'var(--t-sev-medium)',
  low: 'var(--t-sev-high)',
  critical: 'var(--t-sev-critical)',
};

const AXIS_TICK = { fontSize: 12, fill: 'var(--t-ink-muted)' };

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--t-surface)',
  border: '1px solid var(--t-border)',
  borderRadius: 'var(--t-radius-sm)',
  boxShadow: 'var(--t-shadow-2)',
  color: 'var(--t-ink)',
};

const SupplyLevels: React.FC<SupplyLevelsProps> = ({ data, height = 300 }) => {
  return (
    <Card>
      <CardHeader title="Supply Levels" icon={<Package />} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={AXIS_TICK}
            stroke="var(--t-border-strong)"
            tickLine={{ stroke: 'var(--t-border-strong)' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            width={100}
            stroke="var(--t-border-strong)"
            tickLine={{ stroke: 'var(--t-border-strong)' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--t-ink)', fontWeight: 600 }}
            cursor={{ fill: 'var(--t-surface-2)' }}
          />
          <Bar dataKey="level" name="Level %" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={STATUS_COLORS[entry.status] || 'var(--t-ink-faint)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default SupplyLevels;
