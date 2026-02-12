import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

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
  high: '#22c55e',
  medium: '#eab308',
  low: '#f97316',
  critical: '#ef4444',
};

const SupplyLevels: React.FC<SupplyLevelsProps> = ({ data, height = 300 }) => {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Supply Levels</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
          <Tooltip />
          <Bar dataKey="level" name="Level %">
            {data.map((entry, index) => (
              <Cell key={index} fill={STATUS_COLORS[entry.status] || '#6b7280'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SupplyLevels;
