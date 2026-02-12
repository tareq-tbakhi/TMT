import React from 'react';

interface AlertBannerProps {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  onDismiss?: () => void;
  onView?: () => void;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-500',
    text: 'text-red-800',
    icon: '!!',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-500',
    text: 'text-orange-800',
    icon: '!',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-500',
    text: 'text-yellow-800',
    icon: '!',
  },
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-800',
    icon: 'i',
  },
};

const AlertBanner: React.FC<AlertBannerProps> = ({ severity, title, message, onDismiss, onView }) => {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;

  return (
    <div className={`${style.bg} ${style.border} border-s-4 p-4 rounded-e-lg mb-3`} role="alert">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`${style.text} flex h-6 w-6 items-center justify-center rounded-full bg-current/10 text-xs font-bold shrink-0 mt-0.5`}
          >
            {style.icon}
          </div>
          <div>
            <h4 className={`${style.text} font-semibold text-sm`}>{title}</h4>
            <p className={`${style.text} text-sm mt-0.5 opacity-80`}>{message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onView && (
            <button
              onClick={onView}
              className={`${style.text} text-xs font-medium underline hover:no-underline`}
            >
              View
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`${style.text} text-lg leading-none hover:opacity-70`}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertBanner;
