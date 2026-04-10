import axios from "axios";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { aiApi, type ApplicationInput } from "../lib/api";
import { getTodayDateInputValue, toIsoUtcStartOfDay } from "../lib/date";
import { STATUSES, type ApplicationStatus } from "../types";

interface AddApplicationModalProps {
  onClose: () => void;
  onCreate: (payload: Partial<ApplicationInput>) => Promise<void>;
}

const initialStatus: ApplicationStatus = "Applied";

export const AddApplicationModal = ({ onClose, onCreate }: AddApplicationModalProps) => {
  const [jobDescription, setJobDescription] = useState("");
  const [parseProgress, setParseProgress] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jdLink, setJdLink] = useState("");
  const [notes, setNotes] = useState("");
  const [dateApplied, setDateApplied] = useState(getTodayDateInputValue());
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus);
  const [salaryRange, setSalaryRange] = useState("");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);
  const [seniority, setSeniority] = useState("");
  const [location, setLocation] = useState("");
  const [resumeSuggestions, setResumeSuggestions] = useState<string[]>([]);
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const startProgress = () => {
    setParseProgress(8);

    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
    }

    progressTimerRef.current = window.setInterval(() => {
      setParseProgress((current) => (current < 88 ? current + 4 : current));
    }, 220);
  };

  const stopProgress = (finalValue: number) => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    setParseProgress(finalValue);
  };

  const canParse = jobDescription.trim().length > 0 || jdLink.trim().length > 0;

  const handleParse = async () => {
    setParseError(null);
    setResumeSuggestions([]);
    setIsParsing(true);
    startProgress();

    try {
      const parsed = await aiApi.parse({
        jobDescription: jobDescription.trim() || undefined,
        jobLink: jdLink.trim() || undefined
      });
      setCompany(parsed.companyName);
      setRole(parsed.role);
      setSalaryRange(parsed.salaryRange);
      setRequiredSkills(parsed.requiredSkills);
      setNiceToHaveSkills(parsed.niceToHaveSkills);
      setSeniority(parsed.seniority);
      setLocation(parsed.location);

      setParseProgress(72);

      const suggestions = await aiApi.suggestions({
        role: parsed.role,
        company: parsed.companyName,
        requiredSkills: parsed.requiredSkills,
        niceToHaveSkills: parsed.niceToHaveSkills,
        seniority: parsed.seniority
      });
      setResumeSuggestions(suggestions);
      stopProgress(100);
    } catch (error) {
      const apiMessage =
        axios.isAxiosError<{ message?: string }>(error) && error.response?.data?.message
          ? error.response.data.message
          : null;
      const message =
        apiMessage ?? (error instanceof Error ? error.message : "Failed to parse job description");
      setParseError(message);
      stopProgress(0);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!company || !role) {
      setFormError("Company and role are required.");
      return;
    }

    if (!salaryRange.trim()) {
      setFormError("Salary range is required.");
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      await onCreate({
        company,
        role,
        jdLink,
        notes,
        dateApplied: toIsoUtcStartOfDay(dateApplied),
        status,
        salaryRange: salaryRange.trim(),
        requiredSkills,
        niceToHaveSkills,
        seniority,
        location,
        resumeSuggestions,
        nextFollowUpDate: nextFollowUpDate ? toIsoUtcStartOfDay(nextFollowUpDate) : null,
        followUpNote: followUpNote.trim(),
        followUpCompletedAt: null
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save application";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100">Add Application</h2>
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
            type="button"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900/50 dark:bg-cyan-900/20">
          <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Paste Job Description</label>
          <input
            className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={jdLink}
            onChange={(e) => setJdLink(e.target.value)}
            placeholder="Job link (Wellfound, Unstop, Internshala, etc.)"
          />
          <textarea
            className="h-24 sm:h-32 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            placeholder="Paste full JD here, or use the link field above and let AI scrape it..."
          />
          {parseError ? <p className="mt-2 text-sm text-rose-300 dark:text-rose-400">{parseError}</p> : null}
          <button
            type="button"
            className="mt-3 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition"
            onClick={handleParse}
            disabled={isParsing || !canParse}
          >
            {isParsing ? `Parsing with AI... ${parseProgress}%` : "Parse JD / Job Link + Generate Resume Suggestions"}
          </button>
        </div>

        <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSave}>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">
              Company name
              <span className="text-rose-500">*</span>
            </span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enter company name"
              required
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">
              Role
              <span className="text-rose-500">*</span>
            </span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Enter role"
              required
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">
              Salary range
              <span className="text-rose-500">*</span>
            </span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={salaryRange}
              onChange={(e) => setSalaryRange(e.target.value)}
              placeholder="Enter salary range"
              required
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Seniority</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              placeholder="Enter seniority"
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Location</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter location"
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Date applied</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              type="date"
              value={dateApplied}
              onChange={(e) => setDateApplied(e.target.value)}
            />
          </label>
          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Status</span>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
                value={status}
                onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              >
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500 dark:text-indigo-400"
              >
                <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            </div>
          </label>

          <label className="relative block mt-1.5 md:col-span-2">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Notes</span>
            <textarea
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes"
            />
          </label>

          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Next follow-up</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              type="date"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
            />
          </label>

          <label className="relative block mt-1.5">
            <span className="pointer-events-none absolute left-4 top-0 z-10 -translate-y-1/2 px-1.5 text-[13px] font-semibold leading-none text-[#5d39f5]">Follow-up note</span>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/50"
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              placeholder="What to follow up on"
            />
          </label>

          <div className="md:col-span-2">
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Resume Suggestions</p>
            <div className="space-y-2">
              {resumeSuggestions.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-400">No AI suggestions yet.</p>
              ) : (
                resumeSuggestions.map((suggestion, index) => (
                  <div key={`${suggestion}-${index}`} className="flex items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600">
                    <p className="text-sm text-slate-700 dark:text-slate-100">{suggestion}</p>
                    <button
                      type="button"
                      className="ml-auto rounded bg-indigo-500 px-2 py-1 text-xs text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 transition"
                      onClick={() => navigator.clipboard.writeText(suggestion)}
                    >
                      Copy
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {formError ? <p className="md:col-span-2 text-sm text-rose-500 dark:text-rose-400">{formError}</p> : null}

          <div className="md:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              className="w-full sm:w-auto rounded-lg border border-slate-300 px-4 py-3 sm:py-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="w-full sm:w-auto rounded-lg bg-indigo-500 px-4 py-3 sm:py-2 font-semibold text-white disabled:opacity-50 transition hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
