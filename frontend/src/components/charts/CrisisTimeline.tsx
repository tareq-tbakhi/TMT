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

const CrisisTimeline: React.FC<CrisisTimelineProps> = ({ data, height = 300 }) => {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Crisis Activity Timeline</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
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
            dot={false}
            name="Casualties"
          />
          <Line
            type="monotone"
            dataKey="sos_requests"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            name="SOS Requests"
          />
          <Line
            type="monotone"
            dataKey="alerts"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Alerts"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CrisisTimeline;
