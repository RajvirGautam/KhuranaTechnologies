import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AuthForm } from "../components/AuthForm";
import { DarkModeToggle } from "../components/DarkModeToggle";
import { useAuth } from "../context/AuthContext";

interface LandingPageProps {
  authModal?: "login" | "register";
}

export const LandingPage = ({ authModal }: LandingPageProps) => {
  const { user, login, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const heroParametersRef = useRef<HTMLDivElement>(null);
  const [isNavScrolled, setIsNavScrolled] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [heroStatValues, setHeroStatValues] = useState({
    applicationsTracked: 0,
    interviewLift: 0,
    weeklyReminders: 0
  });
  const isAuthModalOpen = authModal === "login" || authModal === "register";
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const nextPath = useMemo(() => {
    const requestedPath = searchParams.get("next")?.trim();
    if (!requestedPath || !requestedPath.startsWith("/") || requestedPath.startsWith("//")) {
      return "/applications";
    }
    return requestedPath;
  }, [searchParams]);

  useEffect(() => {
    const revealElements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    const observer = new IntersectionObserver(
      (entries, activeObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          activeObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.2,
        rootMargin: "0px 0px -10% 0px"
      }
    );

    revealElements.forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${Math.min(index * 80, 320)}ms`);
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateNavState = () => {
      setIsNavScrolled(window.scrollY > 8);
    };

    updateNavState();
    window.addEventListener("scroll", updateNavState, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateNavState);
    };
  }, []);

  useEffect(() => {
    if (!isAuthModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        navigate("/", { replace: true });
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAuthModalOpen, navigate]);

  useEffect(() => {
    const targetValues = {
      applicationsTracked: 3800,
      interviewLift: 2.4,
      weeklyReminders: 1200
    };

    const animateValue = () => {
      const duration = 1400;
      const startTime = performance.now();

      const step = (currentTime: number) => {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        setHeroStatValues({
          applicationsTracked: Math.round(targetValues.applicationsTracked * easedProgress),
          interviewLift: Number((targetValues.interviewLift * easedProgress).toFixed(1)),
          weeklyReminders: Math.round(targetValues.weeklyReminders * easedProgress)
        });

        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };

      window.requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry], activeObserver) => {
        if (!entry.isIntersecting) {
          return;
        }

        animateValue();
        activeObserver.disconnect();
      },
      {
        threshold: 0.35
      }
    );

    if (heroParametersRef.current) {
      observer.observe(heroParametersRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const formatTrackedApplications = (value: number) => `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k+`;
  const formatWeeklyReminders = (value: number) => `${(value / 1000).toFixed(0)}k`;
  const formatInterviewLift = (value: number) => `${value.toFixed(1)}x`;

  if (user && isAuthModalOpen) {
    return <Navigate to={nextPath} replace />;
  }

  return (
    <>
      <div className={`lp-shell relative min-h-screen overflow-x-hidden px-4 pb-12 pt-2 md:px-8 md:pt-3 ${isAuthModalOpen ? "lp-auth-page-blurred" : ""}`}>
        <div className="lp-orb lp-orb-left pointer-events-none" />
        <div className="lp-orb lp-orb-right pointer-events-none" />

        <div className="mx-auto max-w-6xl">
          <header
            className={`lp-topnav fixed left-1/2 top-8 z-50 flex w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-3 backdrop-blur-md transition-all duration-300 md:top-8 md:w-[calc(100%-1.5rem)] md:px-5 lg:w-1/2 ${
              isNavScrolled
                ? "lp-topnav-scrolled -translate-y-0.5 scale-[0.99] lg:w-[72%]"
                : "lg:w-1/2"
            }`}
          >
            <Link className="flex shrink-0 items-center gap-3" to="/" aria-label="careerflow home">
              <div className="lp-logo-mark" aria-hidden>
                <span />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-stone-900 md:text-base">careerflow</p>
              </div>
            </Link>

            <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Landing navigation">
              <a className="lp-nav-pill" href="#home">
                Home
              </a>
              <Link className="lp-nav-pill" to="/applications">
                Board
              </Link>
              <Link className="lp-nav-pill" to="/dashboard">
                Dashboard
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-2 md:ml-4">
              <DarkModeToggle />
              {!user ? (
                  <Link className="lp-nav-cta" to="/login?next=%2Fapplications">
                    Get Started
                  </Link>
              ) : (
                <>
                  <Link className="lp-nav-pill sm:hidden" to="/dashboard" aria-label="Dashboard" title="Dashboard">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <rect x="3" y="3" width="8" height="8" rx="1.5" />
                      <rect x="13" y="3" width="8" height="5" rx="1.5" />
                      <rect x="13" y="10" width="8" height="11" rx="1.5" />
                      <rect x="3" y="13" width="8" height="8" rx="1.5" />
                    </svg>
                  </Link>
                  <Link className="lp-nav-cta" to="/applications">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </header>

          <div aria-hidden className="h-24 md:h-28" />

          <section id="home" className="relative overflow-hidden rounded-[2.2rem] border border-stone-200 bg-white/88 px-6 pb-9 pt-7 shadow-2xl md:px-10 md:pb-10 md:pt-9">
          <div className="lp-grid-overlay" aria-hidden />

          <div className="relative z-10">
            <div className="landing-reveal reveal-up relative z-20 mx-auto max-w-3xl text-center" data-reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Mindful career operations</p>
              <h1 className="mt-4 text-3xl font-semibold leading-[1.07] text-stone-900 sm:text-4xl md:text-5xl lg:text-6xl">
                Career Matters.
                <br />
                Empowering Progress
                <br />
                For Every Ambitious Move
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm text-stone-600 sm:text-base md:text-lg">
                Digital planning for applications, interviews, and offers. Empower your process from first outreach to final
                decision.
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <a className="lp-secondary-btn" href="#hero-parameters">
                  Learn More
                </a>
                <Link className="lp-primary-btn" to={user ? "/applications" : "/login?next=%2Fapplications"}>
                  Get Started
                </Link>
              </div>

              <div
                ref={heroParametersRef}
                id="hero-parameters"
                className="mt-7 grid grid-cols-3 gap-2 text-center text-sm text-stone-500 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 sm:gap-y-4"
              >
                <p className="min-w-0">
                  <span className="block text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-stone-400 sm:text-[11px] sm:tracking-[0.2em]">
                    Applications tracked
                  </span>
                  <span className="mt-1 block text-lg font-semibold leading-none text-stone-900 sm:text-2xl">
                    {formatTrackedApplications(heroStatValues.applicationsTracked)}
                  </span>
                </p>
                <p className="min-w-0">
                  <span className="block text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-stone-400 sm:text-[11px] sm:tracking-[0.2em]">
                    Avg interview lift
                  </span>
                  <span className="mt-1 block text-lg font-semibold leading-none text-stone-900 sm:text-2xl">
                    {formatInterviewLift(heroStatValues.interviewLift)}
                  </span>
                </p>
                <p className="min-w-0">
                  <span className="block text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-stone-400 sm:text-[11px] sm:tracking-[0.2em]">
                    Weekly reminders sent
                  </span>
                  <span className="mt-1 block text-lg font-semibold leading-none text-stone-900 sm:text-2xl">
                    {formatWeeklyReminders(heroStatValues.weeklyReminders)}
                  </span>
                </p>
              </div>

              <div className="my-3 flex justify-center">
                <span className="inline-flex rounded-full border border-white/70 bg-white/58 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[1px] sm:text-sm">
                  Responsive to all screens
                </span>
              </div>
            </div>

            <div className="lp-fade-entry relative z-10 mt-2 rounded-2xl border border-stone-200 bg-white/78 p-4 text-left shadow-sm dark:border-white/10 dark:bg-white/[0.05] sm:mt-1 sm:p-6">
              <div className="rounded-xl bg-white/58 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[1px] dark:bg-white/[0.08] dark:shadow-none sm:px-4">
                <h3 className="text-sm font-semibold text-stone-900 whitespace-nowrap dark:text-stone-100 sm:text-lg">How Careerflow keeps you organized</h3>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-stone-600 dark:text-stone-300 sm:grid-cols-3">
                <p className="rounded-xl bg-stone-50 px-3 py-3 dark:bg-white/[0.07]">
                  <strong className="block text-stone-900 dark:text-stone-100">1. Collect</strong>
                  Add roles quickly from job descriptions and direct job links AI will scrape.
                </p>
                <p className="rounded-xl bg-stone-50 px-3 py-3 dark:bg-white/[0.07]">
                  <strong className="block text-stone-900 dark:text-stone-100">2. Track</strong>
                  Move applications through each stage.
                </p>
                <p className="rounded-xl bg-stone-50 px-3 py-3 dark:bg-white/[0.07]">
                  <strong className="block text-stone-900 dark:text-stone-100">3. Execute</strong>
                  Follow up on time and close with confidence.
                </p>
              </div>
            </div>

            <div className="landing-reveal reveal-up relative z-10 mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-reveal>
              <article className="rounded-2xl border border-stone-200 bg-white/80 p-4 text-left shadow-sm sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Pipeline Health</p>
                <h3 className="mt-2 text-lg font-semibold text-stone-900">Daily Focus Queue</h3>
                <p className="mt-2 text-sm text-stone-600">
                  Surface applications that are waiting for action so your most important follow-ups are never buried.
                </p>
              </article>

              <article className="rounded-2xl border border-stone-200 bg-white/80 p-4 text-left shadow-sm sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Interview Prep</p>
                <h3 className="mt-2 text-lg font-semibold text-stone-900">Role-Based Notes</h3>
                <p className="mt-2 text-sm text-stone-600">
                  Keep one place for talking points, requirements, and compensation details by company and role.
                </p>
              </article>

              <article className="rounded-2xl border border-stone-200 bg-white/80 p-4 text-left shadow-sm sm:col-span-2 sm:p-5 lg:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Momentum</p>
                <h3 className="mt-2 text-lg font-semibold text-stone-900">Weekly Progress Snapshot</h3>
                <p className="mt-2 text-sm text-stone-600">
                  See your response rate and interview movement at a glance to quickly adjust your strategy.
                </p>
              </article>
            </div>

          </div>
        </section>

        <footer className="lp-footer relative z-10 mx-auto mt-6 w-full max-w-6xl rounded-[1.6rem] px-4 py-4 sm:mt-8 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="max-w-md space-y-2 sm:space-y-3">
              <Link className="flex items-center gap-3" to="/" aria-label="careerflow home">
                <div className="lp-logo-mark" aria-hidden>
                  <span />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900 sm:text-base">careerflow</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500 sm:text-xs">Job search, organized</p>
                </div>
              </Link>
              <p className="hidden text-sm leading-6 text-stone-600 sm:block sm:text-base">
                Keep your applications, interview notes, and follow-ups in one calm workspace that works on phones,
                laptops, and everything in between.
              </p>

              <div className="flex items-center gap-3 pt-1">
                <a
                  className="lp-social-link"
                  href="https://github.com/RajvirGautam"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub profile"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.38 6.84 9.74.5.1.68-.22.68-.48 0-.24-.01-.86-.02-1.69-2.78.62-3.37-1.38-3.37-1.38-.46-1.2-1.12-1.52-1.12-1.52-.92-.65.07-.64.07-.64 1.02.07 1.56 1.08 1.56 1.08.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.72 0 0 .84-.27 2.75 1.05A9.2 9.2 0 0 1 12 7.89c.85 0 1.71.12 2.52.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.42.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.35 4.82-4.58 5.07.36.32.68.96.68 1.94 0 1.4-.01 2.54-.01 2.89 0 .27.18.59.69.48A10.13 10.13 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
                  </svg>
                  <span>GitHub</span>
                </a>

                <a
                  className="lp-social-link"
                  href="https://www.linkedin.com/in/rajvirgautam/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn profile"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6.94 8.5H3.89V21h3.05V8.5ZM5.42 2C4.43 2 3.6 2.83 3.6 3.84c0 1.02.83 1.84 1.82 1.84 1 0 1.83-.82 1.83-1.84C7.25 2.83 6.42 2 5.42 2Zm4.38 6.5h2.92v1.71h.04c.41-.78 1.41-1.6 2.92-1.6 3.12 0 3.7 2.06 3.7 4.74V21h-3.05v-5.86c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1V21H9.8V8.5Z" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>

            <div className="grid w-full grid-flow-col auto-cols-[minmax(170px,1fr)] gap-3 overflow-x-auto pb-1 no-scrollbar sm:grid-flow-row sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:pb-0 lg:gap-10">
              <div className="rounded-xl bg-white/35 p-3 sm:rounded-none sm:bg-transparent sm:p-0">
                <p className="lp-footer-title">Explore</p>
                <div className="lp-footer-links mt-2 sm:mt-3">
                  <a href="#home">Home</a>
                  <a href="#hero-parameters">Board</a>
                  <Link to="/dashboard">Dashboard</Link>
                </div>
              </div>

              <div className="rounded-xl bg-white/35 p-3 sm:rounded-none sm:bg-transparent sm:p-0">
                <p className="lp-footer-title">Account</p>
                <div className="lp-footer-links mt-2 sm:mt-3">
                  <Link to={user ? "/applications" : "/login?next=%2Fapplications"}>Get Started</Link>
                  <Link to={user ? "/dashboard" : "/login?next=%2Fdashboard"}>Dashboard</Link>
                  {!user ? <Link to="/login">Login</Link> : null}
                </div>
              </div>

              <div className="rounded-xl bg-white/35 p-3 sm:rounded-none sm:bg-transparent sm:p-0">
                <p className="lp-footer-title">Contact</p>
                <div className="lp-footer-links mt-3">
                  <a href="mailto:support@careerflow.app">support@careerflow.app</a>
                  <a href="mailto:hello@careerflow.app">hello@careerflow.app</a>
                  <span className="text-stone-500">Built for focused job searching</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-stone-200/70 pt-3 text-[11px] text-stone-500 sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:pt-4 sm:text-xs">
            <p>© {new Date().getFullYear()} careerflow. All rights reserved.</p>
          </div>
        </footer>

        </div>
      </div>

      {isAuthModalOpen ? (
        <div className="lp-auth-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close authentication dialog"
            className="lp-auth-backdrop absolute inset-0"
            onClick={() => navigate("/", { replace: true })}
          />

          <div className="lp-auth-modal relative z-10 w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl">
            <AuthForm
              title={authModal === "register" ? "Create Account" : "Welcome Back"}
              submitLabel={authModal === "register" ? "Register" : "Login"}
              askName={authModal === "register"}
              onSubmit={
                authModal === "register"
                  ? async (email, password, name) => {
                      const trimmedName = name?.trim();
                      if (!trimmedName) {
                        throw new Error("Please enter your name.");
                      }
                      await register(email, password, trimmedName);
                    }
                  : login
              }
              googleClientId={googleClientId}
              onGoogleLogin={loginWithGoogle}
              googleButtonText={authModal === "register" ? "signup_with" : "signin_with"}
              googleError={googleError}
              onGoogleError={setGoogleError}
              footer={
                authModal === "register" ? (
                  <>
                    Already registered?{" "}
                    <Link className="font-semibold text-cyan-700 underline" to="/login">
                      Login
                    </Link>
                  </>
                ) : (
                  <>
                    Need an account?{" "}
                    <Link className="font-semibold text-cyan-700 underline" to="/register">
                      Create one
                    </Link>
                  </>
                )
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
};
