/**
 * History - Police officer's completed cases history
 */

import { useResponderStore } from "../../../store/responderStore";
import { PRIORITY_COLORS, CASE_TYPE_ICONS } from "../../../types/responderTypes";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PoliceHistory() {
  const { completedCases } = useResponderStore();

  if (completedCases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No History Yet</h3>
        <p className="text-gray-500">Completed incidents will appear here</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      {/* Stats Summary */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <h2 className="text-gray-500 text-sm font-medium mb-3">Today's Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{completedCases.length}</p>
            <p className="text-xs text-gray-500">Incidents</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600">
              {completedCases.filter((c) => c.type === "security").length}
            </p>
            <p className="text-xs text-gray-500">Security</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {formatDuration(completedCases.reduce((acc, c) => acc + c.duration, 0))}
            </p>
            <p className="text-xs text-gray-500">Total Time</p>
          </div>
        </div>
      </div>

      {/* History List */}
      <h2 className="text-gray-500 text-sm font-medium mb-3">Recent Incidents</h2>
      <div className="space-y-3">
        {completedCases.map((entry) => {
          const priorityColors = PRIORITY_COLORS[entry.priority];
          const icon = CASE_TYPE_ICONS[entry.type];

          return (
            <div
              key={entry.id}
              className="bg-white rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 ${priorityColors.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <span className="text-xl">{icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-500">{entry.caseNumber}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityColors.bg} ${priorityColors.text}`}>
                      {entry.priority}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 text-sm line-clamp-2">
                    {entry.briefDescription}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">{formatDate(entry.completedAt)}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDuration(entry.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
