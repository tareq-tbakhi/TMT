import React, { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-semibold text-white shadow-2"
    >
      <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>No internet connection — SMS SOS mode available</span>
    </div>
  );
};

export default OfflineIndicator;
