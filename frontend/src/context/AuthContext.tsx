import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { authApi } from "../lib/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = "job_tracker_token";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setIsInitializing(false);
        return;
      }

      try {
        const response = await authApi.me();
        setUser(response.user);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      } finally {
        setIsInitializing(false);
      }
    };

    void initialize();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    localStorage.setItem(TOKEN_KEY, response.token);
    setUser(response.user);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const response = await authApi.googleLogin({ credential });
    localStorage.setItem(TOKEN_KEY, response.token);
    setUser(response.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const response = await authApi.register({ email, password, name });
    localStorage.setItem(TOKEN_KEY, response.token);
    setUser(response.user);
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    const response = await authApi.updateName({ name });
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isInitializing,
      login,
      loginWithGoogle,
      register,
      updateDisplayName,
      logout
    }),
    [user, isInitializing, login, loginWithGoogle, register, updateDisplayName, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
