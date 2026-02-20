/**
 * Offline Indicator Component
 *
 * Displays offline status and pending sync information.
 * Shows a banner when the app is offline with pending operations.
 *
 * @module components/OfflineIndicator
 */

import { useOfflineStore, useOfflineDuration, usePendingOperations } from '../store/offlineStore';

// ─── Offline Banner ──────────────────────────────────────────────

/**
 * Full-width banner shown at top of screen when offline
 */
export function OfflineBanner(): JSX.Element | null {
  const { isOnline, pendingSOSCount, pendingSyncCount, isSyncing } = useOfflineStore();
  const offlineDuration = useOfflineDuration();
  const hasPending = usePendingOperations();

  // Don't show if online and no pending
  if (isOnline && !hasPending && !isSyncing) {
    return null;
  }

  // Show syncing status
  if (isOnline && isSyncing) {
    return (
      <div className="bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
        <SyncSpinner />
        <span>Syncing pending data...</span>
      </div>
    );
  }

  // Show pending items while online
  if (isOnline && hasPending) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
        <PendingIcon />
        <span>
          {pendingSOSCount > 0 && `${pendingSOSCount} SOS pending`}
          {pendingSOSCount > 0 && pendingSyncCount > 0 && ' • '}
          {pendingSyncCount > 0 && `${pendingSyncCount} items to sync`}
        </span>
      </div>
    );
  }

  // Show offline status
  return (
    <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
      <OfflineIcon />
      <span>
        Offline
        {offlineDuration && <span className="text-gray-400 ml-1">({offlineDuration})</span>}
      </span>
      {hasPending && (
        <span className="text-amber-400 ml-2">
          • {pendingSOSCount + pendingSyncCount} pending
        </span>
      )}
    </div>
  );
}

// ─── Compact Offline Indicator ───────────────────────────────────

/**
 * Small indicator for nav bars or status areas
 */
export function OfflineIndicatorCompact(): JSX.Element | null {
  const { isOnline, isSyncing } = useOfflineStore();
  const hasPending = usePendingOperations();

  if (isOnline && !hasPending && !isSyncing) {
    return null;
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1 text-blue-500">
        <SyncSpinner className="w-4 h-4" />
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1 text-gray-500">
        <OfflineIcon className="w-4 h-4" />
      </div>
    );
  }

  if (hasPending) {
    return (
      <div className="flex items-center gap-1 text-amber-500">
        <PendingIcon className="w-4 h-4" />
      </div>
    );
  }

  return null;
}

// ─── Sync Status Badge ───────────────────────────────────────────

interface SyncStatusBadgeProps {
  status: 'synced' | 'pending' | 'conflict' | 'stale';
  className?: string;
}

/**
 * Badge showing sync status for individual items
 */
export function SyncStatusBadge({ status, className = '' }: SyncStatusBadgeProps): JSX.Element {
  const config = {
    synced: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: 'Synced',
      icon: <CheckIcon className="w-3 h-3" />,
    },
    pending: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      label: 'Pending',
      icon: <PendingIcon className="w-3 h-3" />,
    },
    conflict: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      label: 'Conflict',
      icon: <ConflictIcon className="w-3 h-3" />,
    },
    stale: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      label: 'Cached',
      icon: <CacheIcon className="w-3 h-3" />,
    },
  };

  const { bg, text, label, icon } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text} ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Cache Info Display ──────────────────────────────────────────

interface CacheInfoProps {
  cacheAge: string | null;
  fromCache: boolean;
}

/**
 * Shows cache information when data is from cache
 */
export function CacheInfo({ cacheAge, fromCache }: CacheInfoProps): JSX.Element | null {
  if (!fromCache) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <CacheIcon className="w-3 h-3" />
      <span>Cached {cacheAge}</span>
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────

interface IconProps {
  className?: string;
}

function OfflineIcon({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
      />
    </svg>
  );
}

function PendingIcon({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function SyncSpinner({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ConflictIcon({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function CacheIcon({ className = 'w-5 h-5' }: IconProps): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  );
}

// ─── Default Export ──────────────────────────────────────────────

export default OfflineBanner;
