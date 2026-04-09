import { useQuery } from "@tanstack/react-query";
import { Link, NavLink } from "react-router-dom";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorDisplay, EmptyState } from "../components/StateDisplay";
import { LoadingSpinner } from "../components/LoadingSkeletons";
import { useAuth } from "../context/AuthContext";
import { applicationApi } from "../lib/api";
import { getErrorMessage } from "../hooks/useAsync";
import { STATUSES } from "../types";

const statusColors: Record<(typeof STATUSES)[number], string> = {
  Applied: "bg-fuchsia-500",
  "Phone Screen": "bg-indigo-500",
  Interview: "bg-cyan-500",
  Offer: "bg-emerald-500",
  Rejected: "bg-rose-500"
};

const buildRecentMonths = (count: number) => {
  const months: { key: string; label: string }[] = [];
  const now = new Date();

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString(undefined, { month: "short" });
    months.push({ key, label });
  }

  return months;
};

const formatMonthKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const formatCompactPercent = (value: number) => `${Math.round(value)}%`;

const formatDateForCsv = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString();
};

const csvEscape = (value: string | number) => {
  const normalized = String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
};

const formatDayMonthLabel = (value: Date) => {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const getActivityDate = (updatedAt: string, createdAt: string, dateApplied: string) => {
  const updated = new Date(updatedAt);

  if (!Number.isNaN(updated.getTime())) {
    return updated;
  }

  const created = new Date(createdAt);

  if (!Number.isNaN(created.getTime())) {
    return created;
  }

  const applied = new Date(dateApplied);

  if (!Number.isNaN(applied.getTime())) {
    return applied;
  }

  return null;
};

export const DashboardPage = () => {
  const { logout, user, updateDisplayName } = useAuth();
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: applicationApi.list
  });

  const applications = applicationsQuery.data ?? [];
  const total = applications.length;
  const safeTotal = Math.max(1, total);

  const statusCounts = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        count: applications.filter((application) => application.status === status).length
      })),
    [applications]
  );

  const responseCount = total - (statusCounts.find((item) => item.status === "Applied")?.count ?? 0);
  const offerCount = statusCounts.find((item) => item.status === "Offer")?.count ?? 0;
  const rejectedCount = statusCounts.find((item) => item.status === "Rejected")?.count ?? 0;
  const activeCount = total - offerCount - rejectedCount;
  const salaryTrackedCount = applications.filter((application) => application.salaryRange?.trim()).length;
  const remoteCount = applications.filter((application) => /remote/i.test(application.location)).length;

  const requiredSkills = new Set(
    applications.flatMap((application) => application.requiredSkills.map((skill) => skill.toLowerCase().trim()))
  );

  const months = useMemo(() => buildRecentMonths(6), []);
  const monthlyApplied = months.map((month) => {
    const count = applications.filter((application) => formatMonthKey(application.dateApplied) === month.key).length;
    return { ...month, count };
  });

  const maxMonthlyCount = Math.max(1, ...monthlyApplied.map((item) => item.count));
  const linePoints = monthlyApplied
    .map((item, index) => {
      const x = (index / (monthlyApplied.length - 1 || 1)) * 100;
      const y = 100 - (item.count / maxMonthlyCount) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  const weeklyActivity = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const currentWeekStart = new Date(now);
    const dayIndex = (currentWeekStart.getDay() + 6) % 7; // Monday-start week
    currentWeekStart.setDate(currentWeekStart.getDate() - dayIndex);

    const buckets = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(currentWeekStart);
      start.setDate(currentWeekStart.getDate() - (7 - index) * 7);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        label: formatDayMonthLabel(start),
        count: 0
      };
    });

    applications.forEach((application) => {
      const activityDate = getActivityDate(application.updatedAt, application.createdAt, application.dateApplied);

      if (!activityDate) {
        return;
      }

      const timestamp = activityDate.getTime();
      const targetBucket = buckets.find((bucket) => {
        return timestamp >= bucket.start.getTime() && timestamp <= bucket.end.getTime();
      });

      if (targetBucket) {
        targetBucket.count += 1;
      }
    });

    return buckets.map(({ label, count }) => ({ label, count }));
  }, [applications]);

  const maxWeeklyCount = Math.max(1, ...weeklyActivity.map((item) => item.count));

  const topLocations = Object.entries(
    applications.reduce<Record<string, number>>((accumulator, application) => {
      const key = application.location?.trim() || "Unknown";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const locationSeries: Array<[string, number]> =
    topLocations.length > 0 ? topLocations : [["No data", 0]];

  const recentActivity = applications
    .slice()
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 8)
    .map((item) => ({
      text:
        item.status === "Applied"
          ? `Added application at ${item.company}`
          : `Updated ${item.company} to ${item.status}`,
      date: new Date(item.updatedAt).toLocaleDateString()
    }));

  const avgResponseDays = (() => {
    const progressionTimes = applications
      .filter((application) => application.status !== "Applied")
      .map((application) => {
        const appliedAt = new Date(application.dateApplied).getTime();
        const updatedAt = new Date(application.updatedAt).getTime();
        return Math.max(0, (updatedAt - appliedAt) / (1000 * 60 * 60 * 24));
      });

    if (!progressionTimes.length) {
      return 0;
    }

    return Math.round(progressionTimes.reduce((sum, value) => sum + value, 0) / progressionTimes.length);
  })();

  const progress = statusCounts.map((item) => ({
    name: item.status,
    value: item.count,
    color: statusColors[item.status]
  }));

  const exportCsv = () => {
    const headers = [
      "Company",
      "Role",
      "Status",
      "Date Applied",
      "Last Updated",
      "Salary Range",
      "Seniority",
      "Location",
      "Required Skills",
      "Nice to Have Skills",
      "Job Description Link",
      "Notes"
    ];

    const rows = applications.map((application) => [
      application.company,
      application.role,
      application.status,
      formatDateForCsv(application.dateApplied),
      formatDateForCsv(application.updatedAt),
      application.salaryRange,
      application.seniority,
      application.location,
      application.requiredSkills.join(", "),
      application.niceToHaveSkills.join(", "),
      application.jdLink,
      application.notes
    ]);

    const csvContent = [
      headers.map((header) => csvEscape(header)).join(","),
      ...rows.map((row) => row.map((cell) => csvEscape(cell)).join(","))
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.setAttribute("download", `applications-${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const greetingName = user?.name?.trim() || user?.email.split("@")[0] || "Friend";

  const openNameModal = () => {
    setDraftName(greetingName);
    setNameError(null);
    setIsNameModalOpen(true);
  };

  const closeNameModal = () => {
    setIsNameModalOpen(false);
    setNameError(null);
  };

  const handleNameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setNameError("Please enter a name.");
      return;
    }

    setIsSavingName(true);
    setNameError(null);

    try {
      await updateDisplayName(trimmedName);
      setIsNameModalOpen(false);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Failed to update name.");
    } finally {
      setIsSavingName(false);
    }
  };

  const confirmLogout = () => {
    logout();
    window.location.replace("/");
  };

  const openLogoutConfirm = () => {
    setIsLogoutConfirmOpen(true);
  };

  const closeLogoutConfirm = () => {
    setIsLogoutConfirmOpen(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-[#f6e8f4] to-[#edf2ff] p-4 md:p-6">
      <div className="relative mx-auto flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f8f9ff] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 backdrop-blur">
          <Link className="flex items-center gap-3" to="/" aria-label="careerflow home">
            <div className="lp-logo-mark" aria-hidden>
              <span />
            </div>
            <p className="text-base font-semibold text-stone-900">careerflow</p>
          </Link>

          <p className="hidden text-[11px] font-medium text-slate-400 lg:block">
            Track momentum with clear signals.
          </p>

          <nav className="ml-auto hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex">
            <NavLink
              className={({ isActive }) => (isActive ? "text-fuchsia-500" : "text-slate-500")}
              to="/applications"
            >
              Applications
            </NavLink>
            <NavLink
              className={({ isActive }) => (isActive ? "text-fuchsia-500" : "text-slate-500")}
              to="/dashboard"
            >
              Dashboard
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <NavLink
              to="/applications"
              className="rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 md:hidden"
            >
              Back to Board
            </NavLink>

            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 sm:px-4 sm:py-2 sm:text-sm"
              type="button"
              onClick={openLogoutConfirm}
            >
              Logout
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
          {applicationsQuery.isPending ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <LoadingSpinner size="lg" />
                <p className="text-slate-500">Loading your dashboard...</p>
              </div>
            </div>
          ) : applicationsQuery.isError ? (
            <div className="space-y-4">
              <ErrorDisplay
                message={getErrorMessage(applicationsQuery.error)}
                onRetry={() => applicationsQuery.refetch()}
              />
            </div>
          ) : applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="Start adding applications to see insights and analytics"
              icon="📊"
              action={{
                label: "Go to Board and Add Applications",
                onClick: () => window.location.href = "/applications"
              }}
            />
          ) : (
            <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
            <div>
              <div className="relative inline-flex items-start pr-9">
                <p className="text-2xl font-semibold tracking-tight text-slate-800 sm:text-3xl md:text-4xl">
                  Hey {greetingName}
                </p>
                <button
                  type="button"
                  onClick={openNameModal}
                  className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600"
                  aria-label="Edit display name"
                >
                  ✎
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 sm:mt-2 sm:text-sm">
                Live funnel intelligence with hiring and response trends.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={exportCsv}
                disabled={!applications.length}
                className="rounded-xl border border-cyan-500 bg-white px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-white sm:px-4 sm:text-sm"
              >
                Export CSV
              </button>
              <NavLink
                to="/applications"
                className="hidden rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white md:inline-flex"
              >
                Go to Board
              </NavLink>
            </div>
          </div>

          <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Total</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{total}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Applications tracked</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Response Rate</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">
                {formatCompactPercent((responseCount / safeTotal) * 100)}
              </p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Reached beyond applied stage</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Offer Rate</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">
                {formatCompactPercent((offerCount / safeTotal) * 100)}
              </p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Offers out of total applications</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Active Pipeline</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{activeCount}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Still in motion</p>
            </div>
          </section>

          <section className="mt-2.5 grid grid-cols-2 gap-2.5 sm:mt-4 sm:gap-4 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Avg Response</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{avgResponseDays}d</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">From application to update</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Salary Data</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{salaryTrackedCount}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Cards with compensation</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Remote Roles</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{remoteCount}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Location marked remote</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.15em]">Skill Breadth</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-800 sm:mt-2 sm:text-3xl">{requiredSkills.size}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-500 sm:text-xs">Unique required skills</p>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Applications Over 6 Months</h3>
                <p className="text-xs text-slate-400">Trend chart</p>
              </div>
              <div className="h-48 rounded-xl bg-slate-50 p-3">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                  <polyline
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2.8"
                    points={linePoints}
                    vectorEffect="non-scaling-stroke"
                  />
                  {monthlyApplied.map((item, index) => {
                    const x = (index / (monthlyApplied.length - 1 || 1)) * 100;
                    const y = 100 - (item.count / maxMonthlyCount) * 100;
                    return <circle key={item.key} cx={x} cy={y} r="1.7" fill="#0ea5e9" />;
                  })}
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-2 text-center text-xs text-slate-500">
                {monthlyApplied.map((item) => (
                  <div key={item.key}>
                    <p>{item.label}</p>
                    <p className="font-semibold text-slate-700">{item.count}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Status Distribution</h3>
                <p className="text-xs text-slate-400">Quick Glance</p>
              </div>
              <div className="space-y-4">
                {progress.map((item) => (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
                      <span>{item.name}</span>
                      <span>
                        {item.value}/{safeTotal}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${item.color}`}
                        style={{ width: `${Math.min(100, (item.value / safeTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Weekly Update Activity</h3>
                <p className="text-xs text-slate-400">Last 8 weeks</p>
              </div>
              <div className="relative flex h-40 min-h-[10rem] items-end gap-1 overflow-hidden rounded-xl bg-slate-50 p-3 pb-2 pl-10 xl:h-full xl:flex-1 xl:min-h-0 xl:gap-2">
                <span className="pointer-events-none absolute left-10 right-3 top-3 h-px bg-slate-200/70" aria-hidden="true" />
                {maxWeeklyCount > 2 ? (
                  <span className="pointer-events-none absolute left-10 right-3 top-1/2 h-px -translate-y-1/2 bg-slate-200/70" aria-hidden="true" />
                ) : null}
                <span className="pointer-events-none absolute bottom-7 left-10 right-3 h-px bg-slate-200" aria-hidden="true" />
                <span className="pointer-events-none absolute left-6 top-3 text-[10px] text-slate-400" aria-hidden="true">
                  {maxWeeklyCount}
                </span>
                {maxWeeklyCount > 2 ? (
                  <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[10px] text-slate-400" aria-hidden="true">
                    {Math.floor(maxWeeklyCount / 2)}
                  </span>
                ) : null}
                <span className="pointer-events-none absolute left-7 bottom-7 text-[10px] text-slate-400" aria-hidden="true">
                  0
                </span>
                {weeklyActivity.map((item) => (
                  <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 pb-1">
                    <div
                      className={`rounded-full ${item.count === 0 ? "bg-slate-300" : "bg-emerald-500"}`}
                      style={{
                        width: "5px",
                        height: item.count === 0 ? "2px" : `${Math.max(10, (item.count / maxWeeklyCount) * 100)}%`
                      }}
                    />
                    <p className="w-full truncate text-center text-[9px] text-slate-500 sm:text-[10px]">{item.label}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Top Locations</h3>
                <p className="text-xs text-slate-400">Geography mix</p>
              </div>
              <div className="space-y-3">
                {locationSeries.map(([location, count]) => (
                  <div key={location}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
                      <span className="truncate pr-3">{location}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-amber-400"
                        style={{ width: `${Math.min(100, (count / safeTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Recent Activity</h3>
                <p className="text-xs text-slate-400">Latest events</p>
              </div>
              <ul className="space-y-3">
                {(recentActivity.length
                  ? recentActivity
                  : [{ text: "Add your first application", date: new Date().toLocaleDateString() }]
                ).map((item, index) => (
                  <li key={`${item.text}-${index}`} className="flex items-start gap-3 text-sm text-slate-500">
                    <span
                      className={`mt-1 inline-block h-3 w-3 rounded-full ${
                        index % 2 === 0 ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate leading-snug text-slate-600">{item.text}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.date}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </section>
            </>
          )}
        </main>

        {isNameModalOpen ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-900/30 p-4">
            <form
              onSubmit={handleNameSubmit}
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-slate-800">What should we call you?</h2>
              <p className="mt-1 text-sm text-slate-500">Update the name used in your dashboard greeting.</p>
              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 outline-none transition focus:border-cyan-400"
                minLength={1}
                maxLength={80}
                autoFocus
                required
              />
              {nameError ? <p className="mt-2 text-sm text-rose-500">{nameError}</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeNameModal}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingName}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingName ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {isLogoutConfirmOpen ? (
          <div className="absolute inset-0 z-40 grid place-items-center bg-slate-900/35 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
              <h2 className="text-lg font-semibold text-slate-800">Confirm logout</h2>
              <p className="mt-1 text-sm text-slate-500">Are you sure you want to log out?</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeLogoutConfirm}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLogout}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
