import axios from "axios";
import { useState, type FormEvent, type ReactNode } from "react";
import { GoogleLogin } from "@react-oauth/google";

interface AuthFormProps {
  title: string;
  submitLabel: string;
  onSubmit: (email: string, password: string, name?: string) => Promise<void>;
  footer: ReactNode;
  googleClientId?: string;
  onGoogleLogin?: (credential: string) => Promise<void>;
  googleError?: string | null;
  onGoogleError?: (message: string) => void;
  askName?: boolean;
  googleButtonText?: "signin_with" | "signup_with" | "continue_with";
}

export const AuthForm = ({
  title,
  submitLabel,
  onSubmit,
  footer,
  googleClientId,
  onGoogleLogin,
  googleError,
  onGoogleError,
  askName = false,
  googleButtonText = "signin_with"
}: AuthFormProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCredentials = async (emailValue: string, passwordValue: string, nameValue?: string) => {
    setError(null);
    setLoading(true);

    try {
      await onSubmit(emailValue, passwordValue, askName ? nameValue ?? name : undefined);
    } catch (submissionError) {
      const isNetworkError = axios.isAxiosError(submissionError) && !submissionError.response;
      const apiMessage =
        axios.isAxiosError<{ message?: string }>(submissionError) &&
        submissionError.response?.data?.message
          ? submissionError.response.data.message
          : null;
      const message =
        apiMessage ??
        (isNetworkError
          ? "Cannot reach server. Start backend on port 4011 and try again."
          : null) ??
        (submissionError instanceof Error ? submissionError.message : "Authentication failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitCredentials(email, password, name);
  };

  const handleDummyUserSignIn = async () => {
    const dummyEmail = "dummy@user.com";
    const dummyPassword = "dummy@123";
    setEmail(dummyEmail);
    setPassword(dummyPassword);
    await submitCredentials(dummyEmail, dummyPassword);
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white/85 p-6 sm:p-8 shadow-2xl backdrop-blur">
      <div className="mb-2 inline-flex rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-fuchsia-600">
        Job Tracker
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Track your applications with AI-assisted workflow.</p>

      {googleClientId && onGoogleLogin ? (
        <>
          <div className="auth-google-wrap mt-6 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
            <GoogleLogin
              onError={() => onGoogleError?.("Google sign-in failed.")}
              onSuccess={(credentialResponse) => {
                const credential = credentialResponse.credential;
                if (!credential) {
                  onGoogleError?.("Google sign-in did not return a credential.");
                  return;
                }

                void onGoogleLogin(credential).catch((googleLoginError) => {
                  onGoogleError?.(
                    googleLoginError instanceof Error ? googleLoginError.message : "Google sign-in failed."
                  );
                });
              }}
              shape="pill"
              text={googleButtonText}
              width="100%"
              useOneTap={false}
            />
          </div>

          {!askName ? (
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
              onClick={() => {
                void handleDummyUserSignIn();
              }}
            >
              {loading ? "Please wait..." : "Dummy User Signin"}
            </button>
          ) : null}

          {googleError ? <p className="mt-3 text-sm text-rose-500">{googleError}</p> : null}

          <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>or continue with email</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : googleClientId ? null : (
        <p className="mt-6 text-sm text-slate-500">Google sign-in is not configured for this environment.</p>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {askName ? (
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">What should we call you?</span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 outline-none transition focus:border-cyan-400"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={1}
              maxLength={80}
              required
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Email</span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 outline-none transition focus:border-cyan-400"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Password</span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 outline-none transition focus:border-cyan-400"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>

        {error ? <p className="text-sm text-rose-500">{error}</p> : null}

        <button
          className="w-full rounded-xl bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Please wait..." : submitLabel}
        </button>
      </form>

      <div className="mt-4 text-sm text-slate-500">{footer}</div>
    </div>
  );
};
