import { useState, useEffect } from "react";

interface NetworkStatus {
  isOnline: boolean;
  effectiveType?: string; // '4g', '3g', '2g', 'slow-2g'
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
}

interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [connectionInfo, setConnectionInfo] = useState<
    Omit<NetworkStatus, "isOnline">
  >({});

  useEffect(() => {
    // Update online status
    const handleOnline = () => {
      setIsOnline(true);
      console.log("🌐 Network: Online");
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log("📵 Network: Offline");
    };

    // Update connection info if available
    const updateConnectionInfo = () => {
      const nav = navigator as Navigator & {
        connection?: NetworkInformation;
        mozConnection?: NetworkInformation;
        webkitConnection?: NetworkInformation;
      };
      const connection =
        nav.connection || nav.mozConnection || nav.webkitConnection;

      if (connection) {
        setConnectionInfo({
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
        });
      }
    };

    // Listen for online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen for connection changes
    const nav = navigator as Navigator & {
      connection?: NetworkInformation;
      mozConnection?: NetworkInformation;
      webkitConnection?: NetworkInformation;
    };
    const connection =
      nav.connection || nav.mozConnection || nav.webkitConnection;

    if (connection) {
      updateConnectionInfo();
      connection.addEventListener("change", updateConnectionInfo);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if (connection) {
        connection.removeEventListener("change", updateConnectionInfo);
      }
    };
  }, []);

  return {
    isOnline,
    ...connectionInfo,
  };
}

// Helper to determine if connection is slow
export function useIsSlowConnection(): boolean {
  const { effectiveType, rtt } = useNetworkStatus();

  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    return true;
  }

  if (rtt && rtt > 1000) {
    return true;
  }

  return false;
}
