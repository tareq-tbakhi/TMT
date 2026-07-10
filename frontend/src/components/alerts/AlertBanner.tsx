import React from 'react';
import { CircleAlert, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from 'lucide-react';

interface AlertBannerProps {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  onDismiss?: () => void;
  onView?: () => void;
}

const SEVERITY_STYLES: Record<string, { container: string; icon: LucideIcon }> = {
  critical: {
    container: 'border-sev-critical bg-sev-critical-soft text-on-sev-critical-soft',
    icon: OctagonAlert,
  },
  high: {
    container: 'border-sev-high bg-sev-high-soft text-on-sev-high-soft',
    icon: TriangleAlert,
  },
  medium: {
    container: 'border-sev-medium bg-sev-medium-soft text-on-sev-medium-soft',
    icon: CircleAlert,
  },
  low: {
    container: 'border-sev-low bg-sev-low-soft text-on-sev-low-soft',
    icon: Info,
  },
};

const AlertBanner: React.FC<AlertBannerProps> = ({ severity, title, message, onDismiss, onView }) => {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  const Icon = style.icon;

  return (
    <div
      className={`${style.container} mb-3 rounded-e-lg border-s-4 p-4 shadow-1`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold">{title}</h4>
            <p className="mt-0.5 text-sm opacity-90">{message}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onView && (
            <button
              type="button"
              onClick={onView}
              className="min-h-11 rounded-md px-3 text-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              View
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex h-11 w-11 items-center justify-center rounded-md hover:opacity-70 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertBanner;
