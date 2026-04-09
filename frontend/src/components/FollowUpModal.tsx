import { useMemo, useState, type FormEvent } from "react";
import type { Application } from "../types";
import type { ApplicationInput } from "../lib/api";
import { toDateInputValue, toIsoUtcStartOfDay } from "../lib/date";
import { getErrorMessage } from "../hooks/useAsync";
import { ErrorDisplay } from "./StateDisplay";

interface FollowUpModalProps {
  application: Application;
  onClose: () => void;
  onSave: (id: string, payload: Partial<ApplicationInput>) => Promise<void>;
}

export const FollowUpModal = ({ application, onClose, onSave }: FollowUpModalProps) => {
  const [nextFollowUpDate, setNextFollowUpDate] = useState(toDateInputValue(application.nextFollowUpDate));
  const [followUpNote, setFollowUpNote] = useState(application.followUpNote ?? "");
  const [isCompleted, setIsCompleted] = useState(Boolean(application.followUpCompletedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFollowUpData = useMemo(() => {
    return Boolean(nextFollowUpDate || followUpNote.trim() || isCompleted);
  }, [followUpNote, isCompleted, nextFollowUpDate]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSave(application._id, {
        nextFollowUpDate: nextFollowUpDate ? toIsoUtcStartOfDay(nextFollowUpDate) : null,
        followUpNote: followUpNote.trim(),
        followUpCompletedAt: isCompleted ? application.followUpCompletedAt ?? new Date().toISOString() : null
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSave(application._id, {
        nextFollowUpDate: null,
        followUpNote: "",
        followUpCompletedAt: null
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-start justify-center overflow-y-auto bg-slate-900/35 p-4 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-[linear-gradient(155deg,#ffffff_0%,#f8fbff_52%,#f4f7ff_100%)] p-5 shadow-2xl shadow-slate-900/10 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">Follow-Up</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-slate-800">{application.company}</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{application.role}</p>
          </div>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="mb-4">
            <ErrorDisplay message={error} onDismiss={() => setError(null)} />
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current Card</p>
            {hasFollowUpData ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {isCompleted ? "Completed" : "Active"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {nextFollowUpDate ? new Date(nextFollowUpDate).toLocaleDateString() : "No date"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{followUpNote.trim() || "No note added."}</p>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white/70 p-3 text-sm text-slate-500">
                No follow-up card yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Completed History</p>
            {application.followUpCompletedAt ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                Completed on {new Date(application.followUpCompletedAt).toLocaleDateString()}
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white/70 p-3 text-sm text-slate-500">
                Nothing completed yet.
              </p>
            )}
          </div>
        </div>

        <form className="grid grid-cols-1 gap-4" onSubmit={handleSave}>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Next follow-up date</span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400"
              type="date"
              value={nextFollowUpDate}
              onChange={(event) => setNextFollowUpDate(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Follow-up note</span>
            <textarea
              className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400"
              value={followUpNote}
              onChange={(event) => setFollowUpNote(event.target.value)}
              placeholder="Add what needs to be followed up"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(event) => setIsCompleted(event.target.checked)}
            />
            Mark follow-up completed
          </label>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
              onClick={() => {
                void handleDelete();
              }}
              disabled={saving || !hasFollowUpData}
            >
              Delete follow-up
            </button>

            <button
              type="submit"
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving..." : hasFollowUpData ? "Update follow-up" : "Create follow-up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
