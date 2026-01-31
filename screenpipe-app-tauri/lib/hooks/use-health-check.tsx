import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { debounce } from "@/lib/utils/throttle";
import { getHealthWsUrl } from "../utils/api-url";

interface HealthCheckResponse {
  status: string;
  status_code: number;
  last_frame_timestamp: string | null;
  last_audio_timestamp: string | null;
  last_ui_timestamp: string | null;
  frame_status: string;
  audio_status: string;
  ui_status: string;
  message: string;
  verbose_instructions?: string | null;
  device_status_details?: string | null;
}

function isHealthChanged(
  oldHealth: HealthCheckResponse | null,
  newHealth: HealthCheckResponse
): boolean {
  if (!oldHealth) return true;
  return (
    oldHealth.status !== newHealth.status ||
    oldHealth.status_code !== newHealth.status_code ||
    oldHealth.last_frame_timestamp !== newHealth.last_frame_timestamp ||
    oldHealth.last_audio_timestamp !== newHealth.last_audio_timestamp ||
    oldHealth.last_ui_timestamp !== newHealth.last_ui_timestamp ||
    oldHealth.frame_status !== newHealth.frame_status ||
    oldHealth.audio_status !== newHealth.audio_status ||
    oldHealth.ui_status !== newHealth.ui_status ||
    oldHealth.message !== newHealth.message
  );
}

interface HealthCheckHook {
  health: HealthCheckResponse | null;
  isServerDown: boolean;
  isLoading: boolean;
  fetchHealth: () => Promise<void>;
  debouncedFetchHealth: () => Promise<void>;
}

export function useHealthCheck(port?: number) {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isServerDown, setIsServerDown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const healthRef = useRef(health);
  const wsRef = useRef<WebSocket | null>(null);
  const previousHealthStatus = useRef<string | null>(null);
  const unhealthyTransitionsRef = useRef<number>(0);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const serverDownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SERVER_DOWN_GRACE_PERIOD_MS = 5000; // Wait 5 seconds before showing "server down"

  const fetchHealth = useCallback(async () => {
    // Clean up existing WebSocket connection
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN || 
            wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch (error) {
        console.warn("Error closing existing WebSocket:", error);
      }
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(getHealthWsUrl(port));
      wsRef.current = ws;

      ws.onopen = () => {
        // Clear the grace period timer - server is up
        if (serverDownTimerRef.current) {
          clearTimeout(serverDownTimerRef.current);
          serverDownTimerRef.current = null;
        }
        setIsServerDown(false);
        setIsLoading(false);
        if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: HealthCheckResponse = JSON.parse(event.data);
          if (isHealthChanged(healthRef.current, data)) {
            setHealth(data);
            healthRef.current = data;
            setIsServerDown(false);
          }

          if (
            data.status === "unhealthy" &&
            previousHealthStatus.current === "healthy"
          ) {
            unhealthyTransitionsRef.current += 1;
          }

          previousHealthStatus.current = data.status;
        } catch (error) {
          console.error("Error parsing health data:", error);
        }
      };

      ws.onerror = (event) => {
        console.warn("WebSocket error:", event);
        const errorHealth: HealthCheckResponse = {
          status: "error",
          status_code: 500,
          last_frame_timestamp: null,
          last_audio_timestamp: null,
          last_ui_timestamp: null,
          frame_status: "error",
          audio_status: "error",
          ui_status: "error",
          message: "Connection error",
        };
        setHealth(errorHealth);
        setIsLoading(false);

        // Only show "server down" after grace period (server might be starting)
        if (!serverDownTimerRef.current && !isServerDown) {
          serverDownTimerRef.current = setTimeout(() => {
            setIsServerDown(true);
            serverDownTimerRef.current = null;
          }, SERVER_DOWN_GRACE_PERIOD_MS);
        }

        // Start retry interval if not already running
        if (!retryIntervalRef.current) {
          retryIntervalRef.current = setInterval(fetchHealth, 3000);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        const errorHealth: HealthCheckResponse = {
          status: "error",
          status_code: 500,
          last_frame_timestamp: null,
          last_audio_timestamp: null,
          last_ui_timestamp: null,
          frame_status: "error",
          audio_status: "error",
          ui_status: "error",
          message: "WebSocket connection closed",
        };
        setHealth(errorHealth);

        // Only show "server down" after grace period (server might be starting)
        if (!serverDownTimerRef.current && !isServerDown && event.code !== 1000) {
          serverDownTimerRef.current = setTimeout(() => {
            setIsServerDown(true);
            serverDownTimerRef.current = null;
          }, SERVER_DOWN_GRACE_PERIOD_MS);
        }

        // Only start retry if this wasn't a manual close
        if (!retryIntervalRef.current && event.code !== 1000) {
          retryIntervalRef.current = setInterval(fetchHealth, 3000);
        }
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      setIsLoading(false);

      // Only show "server down" after grace period
      if (!serverDownTimerRef.current && !isServerDown) {
        serverDownTimerRef.current = setTimeout(() => {
          setIsServerDown(true);
          serverDownTimerRef.current = null;
        }, SERVER_DOWN_GRACE_PERIOD_MS);
      }

      if (!retryIntervalRef.current) {
        retryIntervalRef.current = setInterval(fetchHealth, 3000);
      }
    }
  }, [isServerDown, port]);

  // Create stable debounced function with useMemo to prevent recreation
  // This runs once and never changes, preventing the memory leak
  const debouncedFetchHealthFn = useMemo(
    () => debounce(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Access fetchHealth from the ref to get latest version without dependency
        fetchHealthRef.current?.();
      }
    }, 1000),
    [] // Empty deps - create once and never recreate
  );

  // Keep a ref to fetchHealth so debounced function always uses latest
  const fetchHealthRef = useRef(fetchHealth);
  fetchHealthRef.current = fetchHealth;

  const debouncedFetchHealth = useCallback(async () => {
    debouncedFetchHealthFn();
  }, [debouncedFetchHealthFn]);

  useEffect(() => {
    fetchHealth();
    return () => {
      // Clean up WebSocket connection
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN ||
              wsRef.current.readyState === WebSocket.CONNECTING) {
            wsRef.current.close(1000, "Component unmounting");
          }
        } catch (error) {
          console.warn("Error closing WebSocket during cleanup:", error);
        }
        wsRef.current = null;
      }

      // Clear retry interval
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }

      // Clear server down grace period timer
      if (serverDownTimerRef.current) {
        clearTimeout(serverDownTimerRef.current);
        serverDownTimerRef.current = null;
      }

      // Cancel any pending debounced calls
      debouncedFetchHealthFn.cancel();
    };
  }, [fetchHealth, debouncedFetchHealthFn]);

  return {
    health,
    isServerDown,
    isLoading,
    fetchHealth,
    debouncedFetchHealth,
  } as HealthCheckHook;
}
