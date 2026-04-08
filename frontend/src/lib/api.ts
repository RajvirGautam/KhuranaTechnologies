import axios from "axios";
import type { Application, ParseJobResponse, User } from "../types";

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim();

const baseURL =
  configuredBaseURL && configuredBaseURL.length > 0
    ? configuredBaseURL.replace(/\/$/, "")
    : "/api";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("job_tracker_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      // Handle 401 Unauthorized - clear token and redirect to landing
      if (error.response?.status === 401) {
        localStorage.removeItem("job_tracker_token");
        localStorage.removeItem("job_tracker_user");
        // Only redirect if not already on the landing page.
        const currentPath = window.location.pathname;
        if (currentPath !== "/") {
          window.location.href = "/";
        }
      }
      // Handle 403 Forbidden
      else if (error.response?.status === 403) {
        console.error("Access forbidden:", error);
      }
    }
    return Promise.reject(error);
  }
);

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: async (payload: { email: string; password: string; name: string }): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/register", payload);
    return response.data;
  },
  login: async (payload: { email: string; password: string }): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/login", payload);
    return response.data;
  },
  googleLogin: async (payload: { credential: string }): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/google", payload);
    return response.data;
  },
  me: async (): Promise<{ user: User }> => {
    const response = await api.get<{ user: User }>("/auth/me");
    return response.data;
  },
  updateName: async (payload: { name: string }): Promise<{ user: User }> => {
    try {
      const response = await api.put<{ user: User }>("/auth/me/name", payload);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        try {
          const fallbackResponse = await api.patch<{ user: User }>("/auth/me/name", payload);
          return fallbackResponse.data;
        } catch (fallbackError) {
          if (axios.isAxiosError(fallbackError) && fallbackError.response?.status === 404) {
            throw new Error("Rename endpoint not found. Restart backend server and try again.");
          }

          throw fallbackError;
        }
      }

      throw error;
    }
  }
};

export type ApplicationInput = Omit<Application, "_id" | "createdAt" | "updatedAt">;

export const applicationApi = {
  list: async (): Promise<Application[]> => {
    const response = await api.get<{ applications: Application[] }>("/applications");
    return response.data.applications;
  },
  create: async (payload: Partial<ApplicationInput>): Promise<Application> => {
    const response = await api.post<{ application: Application }>("/applications", payload);
    return response.data.application;
  },
  update: async (id: string, payload: Partial<ApplicationInput>): Promise<Application> => {
    const response = await api.put<{ application: Application }>(`/applications/${id}`, payload);
    return response.data.application;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/applications/${id}`);
  }
};

export const aiApi = {
  parse: async (payload: { jobDescription?: string; jobLink?: string }): Promise<ParseJobResponse["parsed"]> => {
    const response = await api.post<ParseJobResponse>("/ai/parse", payload);
    return response.data.parsed;
  },
  suggestions: async (payload: {
    role: string;
    company: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
    seniority: string;
  }): Promise<string[]> => {
    const response = await api.post<{ suggestions: string[] }>("/ai/suggestions", payload);
    return response.data.suggestions;
  }
};
