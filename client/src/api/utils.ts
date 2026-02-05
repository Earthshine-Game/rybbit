import { Filter } from "@rybbit/shared";
import { DateTime } from "luxon";
import { Time } from "../components/DateSelector/types";
import axios, { AxiosRequestConfig } from "axios";
import { BACKEND_URL } from "../lib/const";
import { getTimezone, useStore } from "../lib/store";
import { CommonApiParams } from "./analytics/endpoints/types";

export function getStartAndEndDate(time: Time): { startDate: string | null; endDate: string | null } {
  if (time.mode === "range") {
    return { startDate: time.startDate, endDate: time.endDate };
  }
  if (time.mode === "week") {
    return {
      startDate: time.week,
      endDate: DateTime.fromISO(time.week).endOf("week").toISODate(),
    };
  }
  if (time.mode === "month") {
    return {
      startDate: time.month,
      endDate: DateTime.fromISO(time.month).endOf("month").toISODate(),
    };
  }
  if (time.mode === "year") {
    return {
      startDate: time.year,
      endDate: DateTime.fromISO(time.year).endOf("year").toISODate(),
    };
  }
  if (time.mode === "all-time" || time.mode === "past-minutes") {
    return { startDate: null, endDate: null };
  }
  return { startDate: time.day, endDate: time.day };
}

/**
 * Build CommonApiParams from a Time object, handling all time modes including past-minutes.
 * This centralizes the logic for converting Time to API params across all hooks.
 */
export function buildApiParams(time: Time, options: { filters?: Filter[] } = {}): CommonApiParams {
  const timeZone = getTimezone();

  if (time.mode === "past-minutes") {
    return {
      startDate: "",
      endDate: "",
      timeZone,
      filters: options.filters,
      pastMinutesStart: time.pastMinutesStart,
      pastMinutesEnd: time.pastMinutesEnd,
    };
  }

  const { startDate, endDate } = getStartAndEndDate(time);
  return {
    startDate: startDate ?? "",
    endDate: endDate ?? "",
    timeZone,
    filters: options.filters,
  };
}

export async function authedFetch<T>(
  url: string,
  params?: Record<string, any>,
  config: AxiosRequestConfig = {}
): Promise<T> {
  const fullUrl = url.startsWith("http") ? url : `${BACKEND_URL}${url}`;

  // Process params to handle arrays correctly for backend JSON parsing
  let processedParams = params;
  if (params) {
    processedParams = { ...params };
    Object.entries(processedParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // Convert arrays to JSON strings for backend parsing
        processedParams![key] = JSON.stringify(value);
      }
    });
  }

  // Get private key from store and add to headers if present
  const privateKey = useStore.getState().privateKey;
  const headers = {
    ...config.headers,
    ...(privateKey ? { "x-private-key": privateKey } : {}),
  };

  try {
    const response = await axios({
      url: fullUrl,
      params: processedParams,
      withCredentials: true,
      timeout: config.timeout ?? 30000, // 30 second default timeout
      ...config,
      headers,
    });

    return response.data;
  } catch (error: any) {
    // Handle network errors (no response from server)
    if (!error.response) {
      if (error.code === "ECONNREFUSED" || error.message?.includes("Network Error")) {
        const portHint = BACKEND_URL.includes(":3001") 
          ? "\n\nTip: If running backend in Docker, it may be on port 8080. Set NEXT_PUBLIC_BACKEND_URL=http://localhost:8080"
          : "";
        throw new Error(
          `Unable to connect to server at ${BACKEND_URL}.${portHint}\n\nPlease ensure:\n- The backend server is running\n- The correct port is configured (check docker-compose.yml)\n- NEXT_PUBLIC_BACKEND_URL environment variable is set correctly`
        );
      }
      if (error.code === "ERR_NETWORK") {
        const portHint = fullUrl.includes(":3001")
          ? "\n\nTip: If running backend in Docker, try http://localhost:8080/api instead"
          : "";
        throw new Error(
          `Network error: Unable to reach ${fullUrl}.${portHint}\n\nCheck:\n- Your network connection\n- The server is running\n- CORS is properly configured\n- The correct port is being used`
        );
      }
      if (error.message) {
        throw new Error(`Network error: ${error.message}`);
      }
      throw new Error("Network error: Unable to connect to the server");
    }

    // Handle HTTP errors (server responded with error status)
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }

    // Handle other HTTP errors
    if (error.response?.status) {
      const statusText = error.response?.statusText || "Unknown error";
      throw new Error(`HTTP ${error.response.status}: ${statusText}`);
    }

    throw error;
  }
}
