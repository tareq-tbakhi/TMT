/**
 * Offline detection hook.
 * Monitors navigator.onLine and fires callbacks on status change.
 */

import { useState, useEffect } from "react";

interface UseOfflineReturn {
  isOnline: boolean;
  isOffline: boolean;
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
  };
}
