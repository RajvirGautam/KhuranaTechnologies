import { useState, useCallback } from "react";
import axios from "axios";

interface UseAsyncOptions {
  retries?: number;
  retryDelay?: number;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  options: UseAsyncOptions = {}
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const { retries = 2, retryDelay = 1000 } = options;

  const executeAsync = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await asyncFunction();
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    setState({ data: null, loading: false, error: lastError });
    throw lastError;
  }, [asyncFunction, retries, retryDelay]);

  return {
    ...state,
    execute: executeAsync,
  };
}

/**
 * Extracts user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Failed to connect to server. Please check your internet connection.";
    }

    const { status, data, statusText } = error.response;
    const message =
      (data as any)?.message || (data as any)?.error || statusText;

    if (status === 401) {
      return "Your session has expired. Please log in again.";
    }
    if (status === 403) {
      return "You don't have permission to perform this action.";
    }
    if (status === 404) {
      return "The requested resource was not found.";
    }
    if (status === 429) {
      return "Too many requests. Please try again later.";
    }
    if (status >= 500) {
      return "Server error. Please try again later.";
    }

    return message || "An error occurred. Please try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

/**
 * Hook to handle errors with consistent error messages
 */
export function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null);

  const handleError = useCallback((err: unknown) => {
    const errorMessage = getErrorMessage(err);
    setError(new Error(errorMessage));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    errorMessage: error?.message || null,
    handleError,
    clearError,
    hasError: !!error,
  };
}
