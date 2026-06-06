import { useState, useCallback } from 'react';

/**
 * Custom hook for API calls with built-in status management.
 */
export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchJson = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, options);
      const raw = await res.text();
      let data = null;
      
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      }

      if (!res.ok) {
        const detail = typeof data === "string"
          ? data
          : typeof data?.detail === "string"
            ? data.detail
            : data?.detail?.message || JSON.stringify(data?.detail || {});
        throw new Error(detail || `Request failed: ${res.status}`);
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchJson, loading, error };
};
