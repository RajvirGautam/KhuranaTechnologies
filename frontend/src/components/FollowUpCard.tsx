import { useState } from "react";
import type { Application } from "../types";

interface FollowUpCardProps {
  application: Application;
  mode: "due" | "upcoming" | "past";
  isHighlighted?: boolean;
  isStale?: boolean;
  onEdit?: (application: Application) => void;
  onDelete?: (application: Application) => Promise<void>;
  onSnooze?: (application: Application, daysToAdd: number) => Promise<void>;
  onClearFollowUp?: (application: Application) => Promise<void>;
  onMarkCompleted?: (application: Application) => Promise<void>;
}

const reminderLabel = (application: Application) => {
  if (!application.nextFollowUpDate) {
    return "Follow-up";
  }

  return new Date(application.nextFollowUpDate).toLocaleDateString();
};

export const FollowUpCard = ({
  application,
  mode,
  isHighlighted = false,
  isStale = false,
  onEdit,
  onDelete,
  onSnooze,
  onClearFollowUp,
  onMarkCompleted
}: FollowUpCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasNote = Boolean(application.followUpNote?.trim());

  const closeMenus = () => {
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    await onDelete?.(application);
    closeMenus();
  };

  return (
    <article
      className={`relative w-full min-w-0 overflow-visible rounded-2xl border bg-white p-2.5 shadow-sm transition-[box-shadow,border-color,background-color,transform] duration-300 dark:border-slate-700 dark:bg-slate-900 sm:p-4 ${
        isHighlighted ? "border-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.55),0_12px_30px_rgba(8,145,178,0.12)] dark:border-cyan-400" : "border-slate-200"
      } ${
        mode === "due"
          ? isStale
            ? "bg-fuchsia-50/70 dark:bg-fuchsia-900/25"
            : "bg-amber-50/55 dark:bg-amber-900/20"
          : mode === "past"
            ? "bg-slate-50/80 dark:bg-slate-800/70"
            : "bg-sky-50/50 dark:bg-sky-900/20"
      }`}
    >
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-slate-900 dark:text-slate-100 sm:text-sm">{application.company}</p>
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-300 sm:text-xs">{application.role}</p>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:py-1 sm:text-[11px] ${
              mode === "due"
                ? isStale
                  ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-200"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/45 dark:text-amber-200"
                : mode === "past"
                  ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-900/45 dark:text-sky-200"
            }`}
          >
            {mode === "due" ? "Due" : mode === "past" ? "Completed" : "Upcoming"}
          </span>
          {mode !== "past" ? (
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-2 sm:py-1 sm:text-xs"
              onClick={() => setMenuOpen((value) => !value)}
            >
              More
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1 text-[10px] text-slate-500 dark:text-slate-300 sm:mt-3 sm:gap-2 sm:text-xs">
        <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 sm:py-1">
          {reminderLabel(application)}
        </span>
        <span className="truncate text-slate-400 dark:text-slate-300">{application.status}</span>
        {mode === "past" && application.followUpCompletedAt ? (
          <span className="truncate text-slate-400 dark:text-slate-300">Completed: {new Date(application.followUpCompletedAt).toLocaleDateString()}</span>
        ) : null}
      </div>

      {hasNote ? (
        <div className="mt-2 rounded-xl border border-white/70 bg-white/85 p-2 text-[12px] leading-5 text-slate-700 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-100 sm:mt-3 sm:p-3 sm:text-sm">
          {application.followUpNote}
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white/65 p-2 text-[12px] text-slate-400 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-300 sm:mt-3 sm:p-3 sm:text-sm">
          No follow-up note added.
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1 sm:mt-4 sm:gap-2">
        {mode === "due" ? (
          <>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-200 sm:px-3 sm:py-2 sm:text-xs"
              onClick={() => {
                void onSnooze?.(application, 1);
              }}
            >
              Snooze 1d
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-200 sm:px-3 sm:py-2 sm:text-xs"
              onClick={() => {
                void onSnooze?.(application, 3);
              }}
            >
              Snooze 3d
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 sm:px-3 sm:py-2 sm:text-xs"
              onClick={() => {
                void onMarkCompleted?.(application);
              }}
            >
              Mark completed
            </button>
          </>
        ) : mode === "upcoming" ? (
          <>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-200 sm:px-3 sm:py-2 sm:text-xs"
              onClick={() => onEdit?.(application)}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-600/70 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-900/20 sm:px-3 sm:py-2 sm:text-xs"
              onClick={() => {
                void handleDelete();
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-200 sm:px-3 sm:py-2 sm:text-xs"
            onClick={() => {
              void onClearFollowUp?.(application);
            }}
          >
            Delete follow-up
          </button>
        )}
      </div>

      {menuOpen ? (
        <div className="absolute right-4 top-14 z-20 w-36 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-800">
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={() => {
              onEdit?.(application);
              closeMenus();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-slate-100 dark:text-rose-300 dark:hover:bg-slate-700"
            onClick={() => {
              void handleDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
};
