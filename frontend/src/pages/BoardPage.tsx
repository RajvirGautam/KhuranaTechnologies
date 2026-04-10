import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router-dom";
import { AddApplicationModal } from "../components/AddApplicationModal";
import { ApplicationDetailModal } from "../components/ApplicationDetailModal";
import { FollowUpCard } from "../components/FollowUpCard";
import { FollowUpModal } from "../components/FollowUpModal";
import { ErrorDisplay, EmptyState } from "../components/StateDisplay";
import { LoadingSpinner } from "../components/LoadingSkeletons";
import { useAuth } from "../context/AuthContext";
import { DarkModeToggle } from "../components/DarkModeToggle";
import { applicationApi, type ApplicationInput } from "../lib/api";
import { addDaysToDateInputValue, getTodayDateInputValue, toDateInputValue, toIsoUtcStartOfDay } from "../lib/date";
import { getErrorMessage } from "../hooks/useAsync";
import { STATUSES, type Application, type ApplicationStatus } from "../types";

const normalizeText = (value: string) => value.trim().toLowerCase();

const parseSalaryBounds = (salaryRange: string) => {
  const normalized = salaryRange.replace(/\s+/g, " ").trim();

  const matches = Array.from(
    normalized.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*([kKmMlL]))?/g),
    (match) => ({
      value: Number(match[1].replace(/,/g, "")),
      suffix: match[2]?.toLowerCase() ?? null
    })
  );

  if (!matches?.length) {
    return null;
  }

  const containsK = /\b\d[\d,]*(?:\.\d+)?\s*[kK]\b/.test(normalized) || /[kK]\b/.test(normalized);
  const containsL = /\b\d[\d,]*(?:\.\d+)?\s*[lL]\b/.test(normalized) || /\b(?:lpa|lakh|lakhs?)\b/i.test(normalized);
  const multiplier = containsL ? 100000 : containsK ? 1000 : 1;

  const values = matches
    .map(({ value, suffix }) => {
      if (!Number.isFinite(value)) {
        return Number.NaN;
      }

      if (suffix === "l") {
        return value * 100000;
      }

      if (suffix === "k") {
        return value * 1000;
      }

      return value < 1000 && multiplier > 1 ? value * multiplier : value;
    })
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
};

const matchesTextQuery = (application: Application, query: string) => {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchableFields = [
    application.company,
    application.role,
    application.location,
    application.notes,
    application.seniority,
    application.salaryRange,
    application.requiredSkills.join(" "),
    application.niceToHaveSkills.join(" ")
  ];

  return searchableFields.some((field) => normalizeText(field).includes(normalizedQuery));
};

const matchesSalaryFilter = (
  application: Application,
  stipendMin: string,
  stipendMax: string
) => {
  const hasSalaryFilter = stipendMin.trim().length > 0 || stipendMax.trim().length > 0;

  if (!hasSalaryFilter) {
    return true;
  }

  const salaryBounds = parseSalaryBounds(application.salaryRange);

  if (!salaryBounds) {
    return false;
  }

  const filterMin = stipendMin.trim() ? Number(stipendMin) : null;
  const filterMax = stipendMax.trim() ? Number(stipendMax) : null;

  if ((filterMin !== null && !Number.isFinite(filterMin)) || (filterMax !== null && !Number.isFinite(filterMax))) {
    return false;
  }

  if (filterMin !== null && salaryBounds.max < filterMin) {
    return false;
  }

  if (filterMax !== null && salaryBounds.min > filterMax) {
    return false;
  }

  return true;
};

const matchesDateFilter = (application: Application, dateFrom: string, dateTo: string) => {
  const hasDateFilter = dateFrom.trim().length > 0 || dateTo.trim().length > 0;

  if (!hasDateFilter) {
    return true;
  }

  const appliedDate = new Date(application.dateApplied);

  if (Number.isNaN(appliedDate.getTime())) {
    return false;
  }

  if (dateFrom.trim()) {
    const startDate = new Date(dateFrom);

    if (appliedDate < startDate) {
      return false;
    }
  }

  if (dateTo.trim()) {
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    if (appliedDate > endDate) {
      return false;
    }
  }

  return true;
};

type SortOption = "random" | "dateLatest" | "dateOldest" | "stipendMax" | "stipendMin";

const sortOptionLabels: Record<SortOption, string> = {
  random: "Random",
  dateLatest: "Date: Latest",
  dateOldest: "Date: Oldest",
  stipendMax: "Stipend: Max",
  stipendMin: "Stipend: Min"
};

const getDateSortValue = (application: Application) => {
  const parsedDate = new Date(application.dateApplied);
  return Number.isNaN(parsedDate.getTime()) ? Number.NEGATIVE_INFINITY : parsedDate.getTime();
};

const getStipendSortValue = (application: Application, mode: "stipendMax" | "stipendMin") => {
  const salaryBounds = parseSalaryBounds(application.salaryRange);

  if (!salaryBounds) {
    return mode === "stipendMax" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  }

  return mode === "stipendMax" ? salaryBounds.max : salaryBounds.min;
};

type ReminderState = "overdue" | "today" | "upcoming" | "completed";

const FOLLOW_UP_STALE_DAYS = 3;

const getReminderState = (application: Application, now: Date): ReminderState | null => {
  if (application.followUpCompletedAt) {
    return "completed";
  }

  if (!application.nextFollowUpDate) {
    return null;
  }

  const reminderDate = new Date(application.nextFollowUpDate);

  if (Number.isNaN(reminderDate.getTime())) {
    return null;
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  if (reminderDate < todayStart) {
    return "overdue";
  }

  if (reminderDate < tomorrowStart) {
    return "today";
  }

  return "upcoming";
};

const isFinalStatus = (status: ApplicationStatus) => status === "Offer" || status === "Rejected";

const isApplicationOlderThanDays = (application: Application, days: number, now: Date) => {
  const appliedDate = new Date(application.dateApplied);

  if (Number.isNaN(appliedDate.getTime())) {
    return false;
  }

  const nowStart = new Date(now);
  nowStart.setHours(0, 0, 0, 0);

  const appliedStart = new Date(appliedDate);
  appliedStart.setHours(0, 0, 0, 0);

  const elapsedDays = Math.floor((nowStart.getTime() - appliedStart.getTime()) / (1000 * 60 * 60 * 24));
  return elapsedDays > days;
};

const isFollowUpDue = (application: Application, now: Date) => {
  if (application.followUpCompletedAt) {
    return false;
  }

  if (isFinalStatus(application.status)) {
    return false;
  }

  const reminderState = getReminderState(application, now);

  if (reminderState === "overdue" || reminderState === "today") {
    return true;
  }

  return isApplicationOlderThanDays(application, FOLLOW_UP_STALE_DAYS, now);
};

const isOverdueFollowUpCard = (application: Application, now: Date) => {
  if (application.followUpCompletedAt) {
    return false;
  }

  return getReminderState(application, now) === "overdue";
};

const isUpcomingFollowUp = (application: Application, now: Date) => getReminderState(application, now) === "upcoming";

const isPastFollowUp = (application: Application) => Boolean(application.followUpCompletedAt);

const sortFollowUpApplications = (applications: Application[]) => {
  return [...applications].sort((left, right) => {
    const leftDate = left.nextFollowUpDate ? new Date(left.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDate = right.nextFollowUpDate ? new Date(right.nextFollowUpDate).getTime() : Number.POSITIVE_INFINITY;

    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    return new Date(left.dateApplied).getTime() - new Date(right.dateApplied).getTime();
  });
};

const statusCardThemes: Record<
  ApplicationStatus,
  { badgeClass: string; fadeGradient: string }
> = {
  Applied: {
    badgeClass: "bg-sky-100 text-sky-700 ring-1 ring-sky-300/50",
    fadeGradient: "from-transparent via-sky-300/45 to-sky-700/55"
  },
  "Phone Screen": {
    badgeClass: "bg-amber-100 text-amber-700 ring-1 ring-amber-300/50",
    fadeGradient: "from-transparent via-amber-300/45 to-amber-700/55"
  },
  Interview: {
    badgeClass: "bg-violet-100 text-violet-700 ring-1 ring-violet-300/50",
    fadeGradient: "from-transparent via-violet-300/45 to-violet-700/55"
  },
  Offer: {
    badgeClass: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/50",
    fadeGradient: "from-transparent via-emerald-300/45 to-emerald-700/55"
  },
  Rejected: {
    badgeClass: "bg-rose-100 text-rose-700 ring-1 ring-rose-300/50",
    fadeGradient: "from-transparent via-rose-300/45 to-rose-700/55"
  }
};

/** Tier-list row themes for the mobile stacked view */
const statusTierThemes: Record<
  ApplicationStatus,
  { slab: string; label: string; border: string; bg: string }
> = {
  Applied:        { label: "Applied",      slab: "bg-sky-500",     border: "border-sky-200",     bg: "bg-sky-50/60" },
  "Phone Screen": { label: "Phone Screen", slab: "bg-amber-500",   border: "border-amber-200",   bg: "bg-amber-50/60" },
  Interview:      { label: "Interview",    slab: "bg-violet-500",  border: "border-violet-200",  bg: "bg-violet-50/60" },
  Offer:          { label: "Offer",        slab: "bg-emerald-500", border: "border-emerald-200", bg: "bg-emerald-50/60" },
  Rejected:       { label: "Rejected",     slab: "bg-rose-500",    border: "border-rose-200",    bg: "bg-rose-50/60" }
};

const COLUMN_ID_PREFIX = "column:";

const statusQuotes: Record<ApplicationStatus, string> = {
  Applied: "Every application is a vote for your future self.",
  "Phone Screen": "Your story is opening doors, keep speaking with confidence.",
  Interview: "Preparation turns pressure into performance.",
  Offer: "Hard work pays off. You are close to a big yes.",
  Rejected: "Redirection is part of the journey. The right role is still ahead."
};

const getColumnDroppableId = (status: ApplicationStatus) => `${COLUMN_ID_PREFIX}${status}`;

const parseColumnStatus = (value: string): ApplicationStatus | null => {
  if (!value.startsWith(COLUMN_ID_PREFIX)) {
    return null;
  }

  const candidate = value.slice(COLUMN_ID_PREFIX.length);
  return STATUSES.find((status) => status === candidate) ?? null;
};

const syncOrderByStatus = (
  previousOrder: Record<ApplicationStatus, string[]>,
  applications: Application[]
) => {
  return STATUSES.reduce<Record<ApplicationStatus, string[]>>((acc, status) => {
    const idsForStatus = applications.filter((application) => application.status === status).map((application) => application._id);
    const idSet = new Set(idsForStatus);
    const preservedOrder = previousOrder[status].filter((id) => idSet.has(id));
    const missingIds = idsForStatus.filter((id) => !preservedOrder.includes(id));
    acc[status] = [...preservedOrder, ...missingIds];
    return acc;
  }, {} as Record<ApplicationStatus, string[]>);
};

const DraggableBoardCard = ({
  card,
  draggable,
  showActions = true,
  compact = false,
  onView,
  onEdit,
  onDelete,
  onTogglePin,
  onFollowUp,
  isPinned = false,
  isHighlighted = false,
  registerRef,
  reminderState = null,
  isStaleFollowUp = false,
  onMobileMenuOpen
}: {
  card: Application;
  draggable: boolean;
  showActions?: boolean;
  compact?: boolean;
  onView?: (application: Application) => void;
  onEdit?: (application: Application) => void;
  onDelete?: (application: Application) => Promise<void>;
  onTogglePin?: (application: Application) => void;
  onFollowUp?: (application: Application) => void;
  isPinned?: boolean;
  isHighlighted?: boolean;
  registerRef?: (element: HTMLElement | null) => void;
  reminderState?: ReminderState | null;
  isStaleFollowUp?: boolean;
  onMobileMenuOpen?: (application: Application, anchorRect: DOMRect) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card._id,
    data: { type: "card", status: card.status },
    disabled: !draggable
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenuTimerRef = useRef<number | null>(null);

  const clearCloseMenuTimer = () => {
    if (closeMenuTimerRef.current) {
      window.clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  };

  const scheduleCloseMenu = () => {
    clearCloseMenuTimer();
    closeMenuTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
    }, 220);
  };

  const compensationText = card.salaryRange?.trim() ?? "";

  useEffect(() => {
    return () => {
      clearCloseMenuTimer();
    };
  }, []);

  // In compact mode, keep horizontal pan available so users can swipe strips.
  // A 1s touch hold activates dragging via TouchSensor.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: draggable && isDragging ? 0 : 1,
    touchAction: compact && draggable ? ("pan-x" as const) : undefined
  };

  const statusTheme = statusCardThemes[card.status];

  const reminderDateText = card.nextFollowUpDate
    ? new Date(card.nextFollowUpDate).toLocaleDateString()
    : "";
  const reminderBadgeClass =
    reminderState === "overdue"
      ? "bg-rose-100 text-rose-700"
      : reminderState === "today"
        ? "bg-amber-100 text-amber-700"
        : reminderState === "upcoming"
          ? "bg-sky-100 text-sky-700"
          : "bg-emerald-100 text-emerald-700";

  const topRightFollowUpBadge =
    reminderState && reminderState !== "upcoming"
      ? {
          text:
            reminderState === "overdue"
              ? "Overdue follow-up"
              : reminderState === "today"
                ? "Follow-up today"
                : "Follow-up done",
          className: reminderBadgeClass
        }
      : !reminderState && isStaleFollowUp
        ? {
            text: "Follow-up due (3+ days)",
            className: "bg-fuchsia-100 text-fuchsia-700"
          }
        : null;

  return (
    <article
      ref={(element) => {
        setNodeRef(element);
        registerRef?.(element);
      }}
      style={style}
      className={`kanban-status-card relative overflow-visible cursor-grab rounded-xl bg-white shadow-sm active:cursor-grabbing transition-[transform,box-shadow,border-color,background-color,opacity] duration-300 ${compact ? "px-2 py-1.5" : "p-3"} ${menuOpen ? "z-[70]" : isDragging ? "z-[60]" : "z-20"} ${
        isHighlighted
          ? "application-card-highlight border border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.6),0_0_0_16px_rgba(34,211,238,0.16),0_16px_44px_rgba(8,145,178,0.28)]"
          : ""
      } ${
        reminderState === "overdue"
          ? "border border-rose-300 bg-rose-50 shadow-[0_0_0_1px_rgba(251,113,133,0.5),0_0_0_10px_rgba(251,113,133,0.2)]"
          : reminderState === "today"
            ? "border border-amber-300 bg-amber-50"
            : isStaleFollowUp
              ? "border border-fuchsia-300 bg-fuchsia-50"
              : ""
      }`}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br ${statusTheme.fadeGradient}`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.18) 0.7px, transparent 0.7px), radial-gradient(rgba(0,0,0,0.16) 0.7px, transparent 0.7px)",
          backgroundPosition: "0 0, 1.4px 1.4px",
          backgroundSize: "3px 3px"
        }}
        aria-hidden="true"
      />
      <span className={`relative z-10 inline-flex rounded-full px-2 py-0 text-[10px] font-semibold ${statusTheme.badgeClass}`}>
        {card.status}
      </span>
      {topRightFollowUpBadge ? (
        <span
          className={`pointer-events-none absolute z-[140] inline-flex items-center rounded-full font-semibold shadow-sm ${compact ? "right-2 top-0 max-w-none -translate-y-1/2 px-1.5 py-0 text-[10px]" : "right-[15%] top-0 max-w-[calc(100%-6rem)] -translate-y-1/2 px-2 py-0.5 text-[11px]"} ${topRightFollowUpBadge.className}`}
          title={topRightFollowUpBadge.text}
        >
          <span className="whitespace-nowrap">{topRightFollowUpBadge.text}</span>
        </span>
      ) : null}
      {/* Drag-handle icon — visual affordance only in compact mode.
          The entire card is the drag activator so touch-action:none on the
          article already prevents the browser from claiming scroll gestures. */}
      {compact && draggable ? (
        <span
          className="pointer-events-none absolute right-11 top-2 z-[75] grid h-7 w-7 place-items-center rounded-md text-slate-400/70"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <circle cx="9" cy="7" r="1.5" />
            <circle cx="15" cy="7" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="17" r="1.5" />
            <circle cx="15" cy="17" r="1.5" />
          </svg>
        </span>
      ) : null}
      {showActions ? (
        <div
          className="absolute right-2 top-2 z-[80]"
          onMouseEnter={clearCloseMenuTimer}
          onMouseLeave={scheduleCloseMenu}
        >
          {isPinned ? (
            <span
              className={`absolute grid place-items-center rounded-full border border-amber-300/80 bg-amber-100 text-amber-700 ${
                compact ? "-left-6 -top-0.5 h-5 w-5" : "-left-7 top-1 h-6 w-6"
              }`}
              aria-label="Pinned card"
              title="Pinned card"
            >
              <svg viewBox="0 0 24 24" className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} fill-current`} aria-hidden="true">
                <path d="M14 3a1 1 0 0 1 1 1v3.38l2.7 2.7a1 1 0 0 1-.7 1.7H13v7.8a1 1 0 0 1-2 0v-7.8H7a1 1 0 0 1-.7-1.7L9 7.38V4a1 1 0 0 1 1-1h4Z" />
              </svg>
            </span>
          ) : null}

          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md bg-transparent text-slate-600 outline-none transition hover:bg-white/40 focus:outline-none"
            onClick={(event) => {
              event.stopPropagation();
              if (compact && onMobileMenuOpen) {
                onMobileMenuOpen(card, event.currentTarget.getBoundingClientRect());
                return;
              }
              clearCloseMenuTimer();
              setMenuOpen((value) => !value);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Card actions"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-[90] mt-1 w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => { onView?.(card); setMenuOpen(false); }}>View</button>
              <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => { onEdit?.(card); setMenuOpen(false); }}>Edit</button>
              <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => { onFollowUp?.(card); setMenuOpen(false); }}>Follow-Up</button>
              <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => { onTogglePin?.(card); setMenuOpen(false); }}>{isPinned ? "Unpin card" : "Pin card"}</button>
              <button type="button" className="block w-full rounded px-3 py-2 text-left text-sm text-rose-600 hover:bg-slate-100" onClick={() => { void onDelete?.(card); setMenuOpen(false); }}>Delete</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className={`relative z-10 font-bold text-slate-700 line-clamp-2 ${compact ? "mt-0.5 text-[12px] leading-tight" : "mt-2 text-[15px] leading-snug"}`} title={card.company}>{card.company}</p>
      <p className={`relative z-10 text-slate-500 line-clamp-2 ${compact ? "mt-0 text-[10px]" : "mt-1 text-xs"}`} title={card.role}>{card.role}</p>
      <div className={`relative z-10 flex items-center justify-between gap-2 text-xs text-slate-400 ${compact ? "mt-1" : "mt-4"}`}>
        <span>{new Date(card.dateApplied).toLocaleDateString()}</span>
        
        {compensationText ? (
          <span className={`relative ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-400/80 bg-emerald-100/90 px-2 py-0.5 ${compact ? "max-w-[88%]" : "max-w-[82%] lg:max-w-[86%]"}`}>
            <span className="relative z-10 min-w-0 flex-1 overflow-hidden">
              <span className="block truncate pr-1 text-[12.5px] font-[750] italic tracking-tight text-[#474747]" title={compensationText}>{compensationText}</span>
            </span>
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f4fcf6] text-[13px] shadow-sm ring-1 ring-emerald-50">
              💸
            </span>
          </span>
        ) : null}
        
      </div>
      {!card.followUpCompletedAt && (card.nextFollowUpDate || card.followUpNote?.trim()) ? (
        <p
          className={`relative z-10 text-slate-500 ${
            compact ? "mt-1 line-clamp-2 text-[10px] leading-tight" : "mt-2 text-xs"
          }`}
          title={card.followUpNote ?? undefined}
        >
          {card.nextFollowUpDate ? `Reminder: ${reminderDateText}` : "Follow-up note"}
          {card.followUpNote ? ` · ${card.followUpNote}` : ""}
        </p>
      ) : null}
    </article>
  );
};

const StatusColumn = ({
  status,
  children,
  className
}: {
  status: (typeof STATUSES)[number];
  children: React.ReactNode;
  className?: string;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: getColumnDroppableId(status),
    data: { type: "column", status }
  });

  // Default: desktop column layout. Pass className="" to get a transparent wrapper (mobile).
  const resolvedClass = className !== undefined
    ? className
    : `flex h-full min-h-0 flex-col rounded-2xl p-3 ${isOver ? "bg-cyan-100/70" : "bg-slate-100/70"}`;

  return (
    <div ref={setNodeRef} className={resolvedClass}>
      {children}
    </div>
  );
};

export const BoardPage = () => {
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeCard, setActiveCard] = useState<Application | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stipendMin, setStipendMin] = useState("");
  const [stipendMax, setStipendMax] = useState("");
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFollowUpsOnly, setShowFollowUpsOnly] = useState(false);
  const [activeFollowUpTab, setActiveFollowUpTab] = useState<"live" | "upcoming" | "past">("live");
  const [sortOption, setSortOption] = useState<SortOption>("random");
  const [followUpModalApplication, setFollowUpModalApplication] = useState<Application | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);
  const [isDragSelectionAnimated, setIsDragSelectionAnimated] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(min-width: 1280px)").matches;
  });
  const [mobileMenuState, setMobileMenuState] = useState<{ application: Application; anchorRect: DOMRect } | null>(null);
  const [orderByStatus, setOrderByStatus] = useState<Record<ApplicationStatus, string[]>>(() =>
    STATUSES.reduce<Record<ApplicationStatus, string[]>>((acc, status) => {
      acc[status] = [];
      return acc;
    }, {} as Record<ApplicationStatus, string[]>)
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sensors = useSensors(
    // Mouse/trackpad: drag starts after a tiny movement.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Touch: require ~1s hold to intentionally pick up a card, leaving swipe gestures intact.
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 8 } }),
    // Pointer fallback for environments that prefer pointer events.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const syncLayout = (event: MediaQueryListEvent) => {
      setIsDesktopLayout(event.matches);
    };

    setIsDesktopLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncLayout);

    return () => {
      mediaQuery.removeEventListener("change", syncLayout);
    };
  }, []);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: applicationApi.list,
    retry: 2,
    retryDelay: 1000
  });

  const createMutation = useMutation({
    mutationFn: (payload: Partial<ApplicationInput>) => applicationApi.create(payload),
    onSuccess: async () => {
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => {
      setMutationError(getErrorMessage(error));
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<ApplicationInput> }) =>
      applicationApi.update(id, payload),
    onMutate: async ({ id, payload }) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      const previousApplications = queryClient.getQueryData<Application[]>(["applications"]);

      if (previousApplications) {
        queryClient.setQueryData<Application[]>(
          ["applications"],
          previousApplications.map((application) =>
            application._id === id ? { ...application, ...payload } : application
          )
        );
      }

      return { previousApplications };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousApplications) {
        queryClient.setQueryData(["applications"], context.previousApplications);
      }
      setMutationError(getErrorMessage(_error));
    },
    onSuccess: async () => {
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => applicationApi.remove(id),
    onSuccess: async () => {
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (error) => {
      setMutationError(getErrorMessage(error));
    }
  });

  const applications = useMemo(() => applicationsQuery.data ?? [], [applicationsQuery.data]);

  useEffect(() => {
    setOrderByStatus((current) => syncOrderByStatus(current, applications));
  }, [applications]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const filteredApplications = useMemo(() => {
    const now = new Date();

    return applications.filter((application) => {
      if (!matchesTextQuery(application, searchQuery)) {
        return false;
      }

      if (roleFilter.trim() && !normalizeText(application.role).includes(normalizeText(roleFilter))) {
        return false;
      }

      if (!matchesDateFilter(application, dateFrom, dateTo)) {
        return false;
      }

      if (!matchesSalaryFilter(application, stipendMin, stipendMax)) {
        return false;
      }

      if (showFollowUpsOnly) {
        if (!isFollowUpDue(application, now)) {
          return false;
        }
      }

      return true;
    });
  }, [applications, dateFrom, dateTo, roleFilter, searchQuery, showFollowUpsOnly, stipendMax, stipendMin]);

  const grouped = useMemo(() => {
    const now = new Date();

    return STATUSES.reduce<Record<(typeof STATUSES)[number], Application[]>>((acc, status) => {
      const statusItems = filteredApplications.filter((item) => item.status === status);
      const rankById = new Map(orderByStatus[status].map((id, index) => [id, index]));

      acc[status] = [...statusItems].sort((a, b) => {
        const aPinned = Boolean(a.isPinned);
        const bPinned = Boolean(b.isPinned);

        if (aPinned !== bPinned) {
          return aPinned ? -1 : 1;
        }

        const aOverdueFollowUp = isOverdueFollowUpCard(a, now);
        const bOverdueFollowUp = isOverdueFollowUpCard(b, now);

        if (aOverdueFollowUp !== bOverdueFollowUp) {
          return aOverdueFollowUp ? -1 : 1;
        }

        if (sortOption === "dateLatest") {
          const dateDiff = getDateSortValue(b) - getDateSortValue(a);

          if (dateDiff !== 0) {
            return dateDiff;
          }
        }

        if (sortOption === "dateOldest") {
          const dateDiff = getDateSortValue(a) - getDateSortValue(b);

          if (dateDiff !== 0) {
            return dateDiff;
          }
        }

        if (sortOption === "stipendMax") {
          const stipendDiff = getStipendSortValue(b, "stipendMax") - getStipendSortValue(a, "stipendMax");

          if (stipendDiff !== 0) {
            return stipendDiff;
          }
        }

        if (sortOption === "stipendMin") {
          const stipendDiff = getStipendSortValue(a, "stipendMin") - getStipendSortValue(b, "stipendMin");

          if (stipendDiff !== 0) {
            return stipendDiff;
          }
        }

        const aRank = rankById.get(a._id) ?? Number.MAX_SAFE_INTEGER;
        const bRank = rankById.get(b._id) ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      });

      return acc;
    }, {} as Record<(typeof STATUSES)[number], Application[]>);
  }, [filteredApplications, orderByStatus, sortOption]);

  const orderedMatches = useMemo(() => STATUSES.flatMap((status) => grouped[status]), [grouped]);

  const followUpsDueCount = useMemo(() => {
    const now = new Date();
    return applications.filter((application) => isFollowUpDue(application, now)).length;
  }, [applications]);

  const followUpDueApplications = useMemo(() => {
    const now = new Date();
    return sortFollowUpApplications(applications.filter((application) => isFollowUpDue(application, now)));
  }, [applications]);

  const upcomingFollowUpApplications = useMemo(() => {
    const now = new Date();
    return sortFollowUpApplications(applications.filter((application) => isUpcomingFollowUp(application, now)));
  }, [applications]);

  const pastFollowUpApplications = useMemo(() => {
    return [...applications]
      .filter((application) => isPastFollowUp(application))
      .sort((left, right) => {
        const leftTime = left.followUpCompletedAt ? new Date(left.followUpCompletedAt).getTime() : 0;
        const rightTime = right.followUpCompletedAt ? new Date(right.followUpCompletedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [applications]);

  const followUpTabMeta: Record<"live" | "upcoming" | "past", { label: string; helper: string; count: number; badgeClass: string }> = {
    live: {
      label: "Live",
      helper: "Needs attention now",
      count: followUpDueApplications.length,
      badgeClass: "bg-rose-100 text-rose-700"
    },
    upcoming: {
      label: "Upcoming",
      helper: "Scheduled follow-ups",
      count: upcomingFollowUpApplications.length,
      badgeClass: "bg-sky-100 text-sky-700"
    },
    past: {
      label: "Past",
      helper: "Completed follow-ups",
      count: pastFollowUpApplications.length,
      badgeClass: "bg-slate-200 text-slate-700"
    }
  };

  const followUpTabs = ["live", "upcoming", "past"] as const;
  const activeFollowUpTabIndex = followUpTabs.indexOf(activeFollowUpTab);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || roleFilter.trim() || dateFrom || dateTo || stipendMin.trim() || stipendMax.trim() || showFollowUpsOnly
  );

  useEffect(() => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }

    if (!hasActiveFilters || orderedMatches.length === 0) {
      setFocusedCardId(null);
      return;
    }

    const nextFocusedCardId = orderedMatches[0]._id;
    setFocusedCardId(nextFocusedCardId);

    highlightTimerRef.current = window.setTimeout(() => {
      setFocusedCardId((current) => (current === nextFocusedCardId ? null : current));
      highlightTimerRef.current = null;
    }, 2600);
  }, [hasActiveFilters, orderedMatches]);

  useEffect(() => {
    if (!focusedCardId) {
      return;
    }

    const element = cardRefs.current[focusedCardId];
    element?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  }, [focusedCardId]);

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("");
    setDateFrom("");
    setDateTo("");
    setStipendMin("");
    setStipendMax("");
    setShowFollowUpsOnly(false);
  };

  const toggleFilters = () => {
    setShowFilters((value) => {
      const nextValue = !value;

      if (nextValue) {
        setShowSortMenu(false);
      }

      return nextValue;
    });
  };

  const toggleSortMenu = () => {
    setShowSortMenu((value) => {
      const nextValue = !value;

      if (nextValue) {
        setShowFilters(false);
      }

      return nextValue;
    });
  };

  const clearFollowUpFields = {
    nextFollowUpDate: null,
    followUpNote: "",
    followUpCompletedAt: null
  } satisfies Pick<ApplicationInput, "nextFollowUpDate" | "followUpNote" | "followUpCompletedAt">;

  const handleSnoozeFollowUp = async (application: Application, daysToAdd: number) => {
    const baseDate = application.nextFollowUpDate ? toDateInputValue(application.nextFollowUpDate) : getTodayDateInputValue();

    await updateMutation.mutateAsync({
      id: application._id,
      payload: {
        nextFollowUpDate: toIsoUtcStartOfDay(addDaysToDateInputValue(baseDate, daysToAdd)),
        followUpCompletedAt: null
      }
    });
  };

  const handleClearFollowUp = async (application: Application) => {
    await updateMutation.mutateAsync({
      id: application._id,
      payload: clearFollowUpFields
    });
  };

  const handleMarkFollowUpCompleted = async (application: Application) => {
    await updateMutation.mutateAsync({
      id: application._id,
      payload: {
        followUpCompletedAt: new Date().toISOString()
      }
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    try {
      if (!event.over) {
        return;
      }

      const applicationId = String(event.active.id);
      const overId = String(event.over.id);
      const current = applications.find((item) => item._id === applicationId);

      if (!current || applicationId === overId) {
        return;
      }

      let nextStatus: ApplicationStatus | null = parseColumnStatus(overId);
      let insertionIndex = -1;

      if (!nextStatus) {
        const overCard = applications.find((item) => item._id === overId);

        if (!overCard) {
          return;
        }

        nextStatus = overCard.status;
        insertionIndex = grouped[nextStatus].findIndex((item) => item._id === overCard._id);
      }

      if (!nextStatus) {
        return;
      }

      const nextColumnIds = grouped[nextStatus].map((item) => item._id);

      if (insertionIndex < 0) {
        insertionIndex = nextColumnIds.length;
      }

      setOrderByStatus((currentOrder) => {
        const nextOrder = STATUSES.reduce<Record<ApplicationStatus, string[]>>((acc, status) => {
          acc[status] = currentOrder[status].filter((id) => id !== applicationId);
          return acc;
        }, {} as Record<ApplicationStatus, string[]>);

        const destinationIds = nextOrder[nextStatus];
        const clampedIndex = Math.min(Math.max(insertionIndex, 0), destinationIds.length);
        destinationIds.splice(clampedIndex, 0, applicationId);

        return nextOrder;
      });

      if (sortOption !== "random") {
        setSortOption("random");
      }

      if (current.status === nextStatus) {
        return;
      }

      const { _id, createdAt, updatedAt, ...rest } = current;
      await updateMutation.mutateAsync({ 
        id: applicationId, 
        payload: { 
          ...rest,
          status: nextStatus
        } 
      });
    } finally {
      setActiveCard(null);
      setActiveCardWidth(null);
      setIsDragSelectionAnimated(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-hidden overscroll-y-none bg-gradient-to-b from-[#f6e8f4] to-[#edf2ff] px-2 pb-2 pt-1 sm:p-4 md:p-6">
      <div className="mx-auto flex h-full w-full flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-[#f8f9ff] shadow-2xl">
        {/* ─── Top header ─────────────────────────────────────────── */}
        <header className="flex items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2 sm:gap-4 sm:px-6 sm:py-4 backdrop-blur">
          <Link className="flex shrink-0 items-center gap-3" to="/" aria-label="careerflow home">
            <div className="lp-logo-mark" aria-hidden>
              <span />
            </div>
            <p className="text-base font-semibold text-stone-900">careerflow</p>
          </Link>

          {/* Search — inline in header on ALL screen sizes now */}
          <div className="relative flex-1 max-w-xs sm:max-w-md">
            <input
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-10 pr-3 text-xs sm:py-2 sm:pl-12 sm:pr-4 sm:text-sm text-slate-600 outline-none transition focus:border-cyan-400 focus:bg-white"
              placeholder="Search…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:left-4" aria-hidden>
              <svg
                className="h-4 w-4 sm:h-5 sm:w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
          </div>

          <div className="hidden flex-1 justify-center px-3 lg:flex">
            <p className="max-w-[38rem] text-center text-[11px] font-medium leading-snug text-slate-400 xl:text-xs">
              Small steps daily turn into big career moves.
            </p>
          </div>

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

          <NavLink
            className={({ isActive }) =>
              `shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm md:hidden ${
                isActive
                  ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`
            }
            to="/dashboard"
          >
            Dashboard
          </NavLink>

          <DarkModeToggle />

        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-6">
            {applicationsQuery.isPending ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <LoadingSpinner size="lg" />
                  <p className="text-slate-500">Loading your applications...</p>
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
                description="Start by adding your first job application to track your progress"
                icon="📝"
                action={{
                  label: "+ Add Your First Application",
                  onClick: () => setShowAddModal(true)
                }}
              />
            ) : (
              <>
                {/* Greeting row — compact on mobile */}
                <div className="mb-2 flex items-center justify-between gap-2 sm:mb-4">
                  <p className="min-w-0 text-base font-semibold tracking-tight text-slate-800 sm:text-2xl md:text-4xl">
                    <span className="block">Good to see you,</span>
                    <span className="block">{user?.name || user?.email.split("@")[0] || "Friend"}</span>
                  </p>

                  {/* ── Compact icon toolbar (mobile) / full toolbar (sm+) ── */}
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    {/* Filter — icon-only on mobile, full pill on sm+ */}
                    <div className="relative">
                      <button
                        className={`grid h-10 w-10 place-items-center rounded-xl border bg-white/90 shadow-sm transition sm:hidden ${
                          showFilters ? "border-cyan-400 text-cyan-600" : "border-slate-200/80 text-slate-500 hover:border-cyan-300 hover:text-cyan-600"
                        }`}
                        type="button"
                        aria-label="Filter"
                        aria-expanded={showFilters}
                        onClick={toggleFilters}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                          <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5a1.5 1.5 0 0 1-.44 1.06L14 13.12V18a1 1 0 0 1-1.45.89l-3-1.5A1 1 0 0 1 9 16.5v-3.38L3.44 6.56A1.5 1.5 0 0 1 3 5.5Z" />
                        </svg>
                        {hasActiveFilters && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-cyan-500" />
                        )}
                      </button>

                      {/* Full pill — sm+ */}
                      <button
                        className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-cyan-300 hover:text-cyan-700"
                        type="button"
                        aria-expanded={showFilters}
                        onClick={toggleFilters}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-cyan-600" aria-hidden="true">
                            <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5a1.5 1.5 0 0 1-.44 1.06L14 13.12V18a1 1 0 0 1-1.45.89l-3-1.5A1 1 0 0 1 9 16.5v-3.38L3.44 6.56A1.5 1.5 0 0 1 3 5.5Z" />
                          </svg>
                          Filter
                        </span>
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                          {hasActiveFilters ? (
                            <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">
                              {filteredApplications.length} match{filteredApplications.length === 1 ? "" : "es"}
                            </span>
                          ) : null}
                          <span className="text-slate-400">{showFilters ? "Hide" : "Show"}</span>
                          <svg viewBox="0 0 24 24" className={`h-4 w-4 fill-current transition-transform ${showFilters ? "rotate-180 text-cyan-600" : "text-slate-400"}`} aria-hidden="true">
                            <path d="M12 15.5a1 1 0 0 1-.71-.29l-5-5a1 1 0 1 1 1.42-1.42L12 13.09l4.29-4.3a1 1 0 0 1 1.42 1.42l-5 5a1 1 0 0 1-.71.29Z" />
                          </svg>
                        </span>
                      </button>

                      {/* Filter dropdown panel — shared for both button variants */}
                      {showFilters ? (
                        <div className="fixed left-1/2 top-24 z-40 w-[min(calc(100vw-1.5rem),34rem)] -translate-x-1/2 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-2xl backdrop-blur sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(calc(100vw-3rem),34rem)] sm:translate-x-0">
                          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                            <input
                              className="col-span-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white lg:col-span-1"
                              placeholder="Role"
                              value={roleFilter}
                              onChange={(event) => setRoleFilter(event.target.value)}
                            />
                            <div className="relative">
                              <input
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                aria-label="Date from"
                              />
                              {!dateFrom ? (
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                  Date from
                                </span>
                              ) : null}
                            </div>
                            <div className="relative">
                              <input
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                aria-label="Date to"
                              />
                              {!dateTo ? (
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                  Date to
                                </span>
                              ) : null}
                            </div>
                            <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white" inputMode="numeric" placeholder="Min stipend" value={stipendMin} onChange={(e) => setStipendMin(e.target.value)} />
                            <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white" inputMode="numeric" placeholder="Max stipend" value={stipendMax} onChange={(e) => setStipendMax(e.target.value)} />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Showing {filteredApplications.length} of {applications.length}</span>
                            {hasActiveFilters ? (
                              <button className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700" type="button" onClick={clearFilters}>Clear</button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Sort — icon-only on mobile, full pill on sm+ */}
                    <div className="relative">
                      <button
                        className={`grid h-10 w-10 place-items-center rounded-xl border bg-white/90 shadow-sm transition sm:hidden ${
                          showSortMenu ? "border-cyan-400 text-cyan-600" : "border-slate-200/80 text-slate-500 hover:border-cyan-300 hover:text-cyan-600"
                        }`}
                        type="button"
                        aria-label="Sort"
                        aria-expanded={showSortMenu}
                        onClick={toggleSortMenu}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                          <path d="M6 5a1 1 0 0 1 1 1v9.59l1.3-1.3a1 1 0 1 1 1.4 1.42l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.42L5 15.59V6a1 1 0 0 1 1-1Zm12 1.59L16.7 7.9a1 1 0 0 1-1.4-1.42l3-3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1-1.4 1.42L20 6.59V18a1 1 0 1 1-2 0V6.59Z" />
                        </svg>
                      </button>

                      {/* Full pill — sm+ */}
                      <button
                        className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-cyan-300 hover:text-cyan-700"
                        type="button"
                        aria-expanded={showSortMenu}
                        onClick={toggleSortMenu}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-cyan-600" aria-hidden="true">
                            <path d="M6 5a1 1 0 0 1 1 1v9.59l1.3-1.3a1 1 0 1 1 1.4 1.42l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.42L5 15.59V6a1 1 0 0 1 1-1Zm12 1.59L16.7 7.9a1 1 0 0 1-1.4-1.42l3-3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1-1.4 1.42L20 6.59V18a1 1 0 1 1-2 0V6.59Z" />
                          </svg>
                          Sort
                        </span>
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                          <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">{sortOptionLabels[sortOption]}</span>
                          <svg viewBox="0 0 24 24" className={`h-4 w-4 fill-current transition-transform ${showSortMenu ? "rotate-180 text-cyan-600" : "text-slate-400"}`} aria-hidden="true">
                            <path d="M12 15.5a1 1 0 0 1-.71-.29l-5-5a1 1 0 1 1 1.42-1.42L12 13.09l4.29-4.3a1 1 0 0 1 1.42 1.42l-5 5a1 1 0 0 1-.71.29Z" />
                          </svg>
                        </span>
                      </button>

                      {/* Sort dropdown */}
                      {showSortMenu ? (
                        <div className="absolute right-0 top-full z-40 mt-2 min-w-44 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl backdrop-blur">
                          {(Object.keys(sortOptionLabels) as SortOption[]).map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                                sortOption === option ? "bg-cyan-50 font-semibold text-cyan-700" : "text-slate-600 hover:bg-slate-100"
                              }`}
                              onClick={() => { setSortOption(option); setShowSortMenu(false); }}
                            >
                              {sortOptionLabels[option]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* Follow-ups — icon+badge on mobile, full pill on sm+ */}
                    {!showFollowUpsOnly ? (
                      <button
                        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-500 shadow-sm transition hover:border-rose-300 hover:text-rose-600 sm:hidden"
                        type="button"
                        aria-label="Follow-ups due"
                        onClick={() => setShowFollowUpsOnly(true)}
                      >
                        {/* Bell icon */}
                        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                          <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                        {followUpsDueCount > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[10px] font-bold text-white">
                            {followUpsDueCount}
                          </span>
                        )}
                      </button>
                    ) : null}

                    {showFollowUpsOnly ? (
                      <button
                        className="inline-flex items-center rounded-xl border border-blue-500 bg-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600 sm:hidden"
                        type="button"
                        onClick={() => setShowFollowUpsOnly(false)}
                      >
                        Back to Board
                      </button>
                    ) : null}

                    <button
                      className={`hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        showFollowUpsOnly
                          ? "border border-blue-500 bg-blue-500 text-white hover:bg-blue-600"
                          : "border border-slate-200/80 bg-white/90 text-slate-700 hover:border-rose-300 hover:text-rose-700"
                      }`}
                      type="button"
                      onClick={() => setShowFollowUpsOnly((value) => !value)}
                    >
                      {showFollowUpsOnly ? "Back to Board" : "Follow-ups due"}
                      {!showFollowUpsOnly ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{followUpsDueCount}</span>
                      ) : null}
                    </button>

                    {/* + Add — icon on mobile, full button on sm+ */}
                    {!showFollowUpsOnly ? (
                      <>
                        <button
                          className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-white shadow-sm transition hover:bg-indigo-600 sm:hidden"
                          type="button"
                          aria-label="Add application"
                          onClick={() => setShowAddModal(true)}
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                            <path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1Z" />
                          </svg>
                        </button>
                        <button
                          className="hidden rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white sm:block"
                          type="button"
                          onClick={() => setShowAddModal(true)}
                        >
                          + Add Application
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

            {mutationError && (
              <div className="mb-4">
                <ErrorDisplay
                  message={mutationError}
                  onDismiss={() => setMutationError(null)}
                />
              </div>
            )}

            {showFollowUpsOnly ? (
              <div className="min-h-0 flex-1 overflow-hidden pb-2">
                <div className="flex h-full min-h-0 flex-col gap-4 pr-1">
                  <section className="rounded-[26px] bg-[#2f6cdf] p-2.5 shadow-[0_12px_34px_rgba(37,99,235,0.35)]">
                    <div className="relative grid grid-cols-3 rounded-[20px] p-1">
                      <span
                        className="pointer-events-none absolute inset-y-0.5 z-0 w-1/3 rounded-[16px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.2)] transition-all duration-300"
                        style={{ left: `${activeFollowUpTabIndex * 33.3333}%` }}
                      />

                      {followUpTabs.map((tab) => {
                        const meta = followUpTabMeta[tab];
                        const isActive = activeFollowUpTab === tab;

                        return (
                          <button
                            key={tab}
                            type="button"
                            className={`relative z-10 min-w-0 rounded-[16px] px-2.5 py-3.5 text-left transition sm:px-3 ${
                              isActive ? "text-[#1f2a44]" : "text-white/95 hover:bg-white/10"
                            }`}
                            onClick={() => setActiveFollowUpTab(tab)}
                          >
                            <div className="flex min-w-0 items-center justify-between gap-1.5">
                              <span className="truncate text-xs font-semibold sm:text-sm">{meta.label}</span>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-[11px] ${
                                  isActive ? meta.badgeClass : "bg-white/20 text-white"
                                }`}
                              >
                                {meta.count}
                              </span>
                            </div>
                            <p className={`mt-1 text-[10px] leading-3.5 sm:text-[11px] sm:leading-4 ${isActive ? "text-slate-500" : "text-white/75"}`}>{meta.helper}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="min-h-0 overflow-x-hidden overflow-y-auto rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm transition-all duration-300">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-800">
                          {activeFollowUpTab === "live"
                            ? "Due follow-ups"
                            : activeFollowUpTab === "upcoming"
                              ? "Upcoming follow-ups"
                              : "Past follow-ups"}
                        </h2>
                        <p className="text-sm text-slate-500">
                          {activeFollowUpTab === "live"
                            ? "Applications that need attention now."
                            : activeFollowUpTab === "upcoming"
                              ? "Future follow-ups you can review, edit, or delete."
                              : "Completed follow-ups, kept for quick history."}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          followUpTabMeta[activeFollowUpTab].badgeClass
                        }`}
                      >
                        {followUpTabMeta[activeFollowUpTab].count}
                      </span>
                    </div>

                    {activeFollowUpTab === "live" ? (
                      followUpDueApplications.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No due follow-ups right now.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                          {followUpDueApplications.map((application) => {
                            const now = new Date();
                            const isStale = !application.nextFollowUpDate && isApplicationOlderThanDays(application, FOLLOW_UP_STALE_DAYS, now);

                            return (
                              <FollowUpCard
                                key={application._id}
                                application={application}
                                mode="due"
                                isHighlighted={focusedCardId === application._id}
                                isStale={isStale}
                                onEdit={setSelectedApplication}
                                onDelete={async (item) => {
                                  const shouldDelete = window.confirm(`Delete ${item.company} - ${item.role}?`);

                                  if (!shouldDelete) {
                                    return;
                                  }

                                  await deleteMutation.mutateAsync(item._id);
                                }}
                                onSnooze={handleSnoozeFollowUp}
                                onClearFollowUp={handleClearFollowUp}
                                onMarkCompleted={handleMarkFollowUpCompleted}
                              />
                            );
                          })}
                        </div>
                      )
                    ) : null}

                    {activeFollowUpTab === "upcoming" ? (
                      upcomingFollowUpApplications.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No upcoming follow-ups scheduled.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                          {upcomingFollowUpApplications.map((application) => (
                            <FollowUpCard
                              key={application._id}
                              application={application}
                              mode="upcoming"
                              onEdit={setSelectedApplication}
                              onDelete={async (item) => {
                                const shouldDelete = window.confirm(`Delete ${item.company} - ${item.role}?`);

                                if (!shouldDelete) {
                                  return;
                                }

                                await deleteMutation.mutateAsync(item._id);
                              }}
                            />
                          ))}
                        </div>
                      )
                    ) : null}

                    {activeFollowUpTab === "past" ? (
                      pastFollowUpApplications.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No completed follow-ups yet.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                          {pastFollowUpApplications.map((application) => (
                            <FollowUpCard
                              key={application._id}
                              application={application}
                              mode="past"
                              onClearFollowUp={handleClearFollowUp}
                            />
                          ))}
                        </div>
                      )
                    ) : null}
                  </section>
                </div>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                autoScroll={false}
                onDragStart={(event) => {
                  const current = applications.find((item) => item._id === event.active.id);
                  const currentId = String(event.active.id);
                  const currentElement = cardRefs.current[currentId];
                  const measuredWidth = currentElement?.getBoundingClientRect().width;
                  setActiveCardWidth(
                    typeof measuredWidth === "number" && Number.isFinite(measuredWidth) ? measuredWidth : null
                  );
                  setActiveCard(current ?? null);
                  setIsDragSelectionAnimated(false);
                  window.requestAnimationFrame(() => {
                    setIsDragSelectionAnimated(true);
                  });
                }}
                onDragCancel={() => {
                  setActiveCard(null);
                  setActiveCardWidth(null);
                  setIsDragSelectionAnimated(false);
                }}
                onDragEnd={handleDragEnd}
              >
                {/* ── MOBILE: tier-list rows (hidden on xl+) ──────────────── */}
                {/* 5 detached rows, colored label slab left, cards scroll right */}
                {!isDesktopLayout ? (
                <div
                  className={`min-h-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 ${activeCard ? "overflow-hidden" : "overflow-y-auto"}`}
                  style={{ touchAction: activeCard ? "none" : "pan-y", overscrollBehavior: "none" }}
                >
                  <div className="flex flex-col gap-1.5 pb-1">
                    {STATUSES.map((column) => {
                      const tier = statusTierThemes[column];
                      const cards = grouped[column];

                      return (
                        <div key={column} className="flex min-h-[70px] items-stretch rounded-2xl border border-slate-200/80 bg-white/60 shadow-sm">
                          {/* Left label slab */}
                          <div className={`${tier.slab} flex w-7 shrink-0 flex-col items-center justify-center gap-1 rounded-l-2xl`}>
                            {column === "Phone Screen" ? (
                              <span className="flex items-center gap-0.5 text-[8px] font-black uppercase leading-none tracking-[0.06em] text-white">
                                <span className="[writing-mode:vertical-rl] rotate-180">Phone</span>
                                <span className="[writing-mode:vertical-rl] rotate-180">Screen</span>
                              </span>
                            ) : (
                              <span className="max-h-[54px] overflow-hidden whitespace-nowrap text-center text-[10px] font-black uppercase leading-none tracking-[0.08em] text-white [writing-mode:vertical-rl] rotate-180">
                                {column}
                              </span>
                            )}
                            <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-white/25 px-1 text-[10px] font-bold text-white">
                              {cards.length}
                            </span>
                          </div>

                          {/* Right: card strip wrapped in droppable column */}
                          <StatusColumn status={column} className="flex min-w-0 flex-1 overflow-visible">
                            {/* Keep horizontal swipe enabled so users can reach all cards.
                                Drag now starts only after a 1s touch hold via TouchSensor. */}
                            <div
                              className={`no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-visible px-1.5 py-0.5 ${tier.bg}`}
                              style={{ touchAction: "pan-x" }}
                            >
                              <SortableContext
                                items={cards.map((c) => c._id)}
                                strategy={horizontalListSortingStrategy}
                              >
                                {cards.length === 0 ? (
                                  <p className="w-full shrink-0 text-center text-xs text-slate-400 italic">
                                    {statusQuotes[column]}
                                  </p>
                                ) : (
                                  cards.map((card) => {
                                    const now = new Date();
                                    const reminderState = getReminderState(card, now);
                                    return (
                                      <div key={card._id} className="w-[205px] shrink-0">
                                        <DraggableBoardCard
                                          card={card}
                                          draggable={true}
                                          compact={true}
                                          isPinned={Boolean(card.isPinned)}
                                          isHighlighted={focusedCardId === card._id}
                                          reminderState={reminderState}
                                          isStaleFollowUp={!reminderState && isApplicationOlderThanDays(card, FOLLOW_UP_STALE_DAYS, now) && !isFinalStatus(card.status)}
                                          registerRef={(element) => { cardRefs.current[card._id] = element; }}
                                          onMobileMenuOpen={(application, anchorRect) => setMobileMenuState({ application, anchorRect })}
                                          onView={setSelectedApplication}
                                          onEdit={setSelectedApplication}
                                          onFollowUp={setFollowUpModalApplication}
                                          onTogglePin={(application) => {
                                            const nextPinned = !Boolean(application.isPinned);
                                            if (nextPinned) {
                                              setOrderByStatus((currentOrder) => {
                                                const nextOrder = { ...currentOrder, [application.status]: currentOrder[application.status].filter((id) => id !== application._id) };
                                                nextOrder[application.status] = [application._id, ...nextOrder[application.status]];
                                                return nextOrder;
                                              });
                                            }
                                            if (sortOption !== "random") setSortOption("random");
                                            void updateMutation.mutateAsync({ id: application._id, payload: { isPinned: nextPinned } });
                                          }}
                                          onDelete={async (application) => {
                                            const shouldDelete = window.confirm(`Delete ${application.company} - ${application.role}?`);
                                            if (!shouldDelete) return;
                                            await deleteMutation.mutateAsync(application._id);
                                          }}
                                        />
                                      </div>
                                    );
                                  })
                                )}
                              </SortableContext>
                              {/* Add card button always visible at end of strip */}
                              <button
                                type="button"
                                className="flex h-full min-h-[56px] w-9 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 text-slate-400 transition hover:border-cyan-300 hover:text-cyan-600"
                                onClick={() => setShowAddModal(true)}
                                aria-label="Add application"
                              >
                                <span className="text-lg leading-none">+</span>
                              </button>
                            </div>
                          </StatusColumn>
                        </div>
                      );
                    })}
                  </div>
                </div>
                ) : null}

                {/* ── DESKTOP: 5-column grid (xl+) ───────────────────────────── */}
                {isDesktopLayout ? (
                <div className="no-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
                  <div className="grid h-full grid-cols-5 gap-4">
                    {STATUSES.map((column) => (
                      <div
                        key={column}
                        className="min-w-[min(260px,78vw)] h-full min-h-0 flex-shrink-0 snap-start xl:min-w-0 xl:flex-1"
                      >
                        <StatusColumn status={column}>
                          <div className="mb-3 flex items-center justify-between px-1">
                            <h2 className="text-sm font-semibold text-slate-700">{column}</h2>
                            <span className="text-slate-400">•••</span>
                          </div>

                          <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pt-3">
                            <SortableContext
                              items={grouped[column].map((card) => card._id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {grouped[column].length === 0 ? (
                                <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-4 text-center text-xs text-slate-400">
                                  {hasActiveFilters ? "No matches in this column" : statusQuotes[column]}
                                </p>
                              ) : (
                                grouped[column].map((card) => {
                                  const now = new Date();
                                  const reminderState = getReminderState(card, now);

                                  return (
                                    <DraggableBoardCard
                                      key={card._id}
                                      card={card}
                                      draggable
                                      isPinned={Boolean(card.isPinned)}
                                      isHighlighted={focusedCardId === card._id}
                                      reminderState={reminderState}
                                      isStaleFollowUp={!reminderState && isApplicationOlderThanDays(card, FOLLOW_UP_STALE_DAYS, now) && !isFinalStatus(card.status)}
                                      registerRef={(element) => {
                                        cardRefs.current[card._id] = element;
                                      }}
                                      onView={setSelectedApplication}
                                      onEdit={setSelectedApplication}
                                      onFollowUp={setFollowUpModalApplication}
                                      onTogglePin={(application) => {
                                        const nextPinned = !Boolean(application.isPinned);

                                        if (nextPinned) {
                                          setOrderByStatus((currentOrder) => {
                                            const nextOrder = {
                                              ...currentOrder,
                                              [application.status]: currentOrder[application.status].filter(
                                                (id) => id !== application._id
                                              )
                                            };

                                            nextOrder[application.status] = [application._id, ...nextOrder[application.status]];
                                            return nextOrder;
                                          });
                                        }

                                        if (sortOption !== "random") {
                                          setSortOption("random");
                                        }

                                        void updateMutation.mutateAsync({
                                          id: application._id,
                                          payload: { isPinned: nextPinned }
                                        });
                                      }}
                                      onDelete={async (application) => {
                                        const shouldDelete = window.confirm(
                                          `Delete ${application.company} - ${application.role}?`
                                        );

                                        if (!shouldDelete) {
                                          return;
                                        }

                                        await deleteMutation.mutateAsync(application._id);
                                      }}
                                    />
                                  );
                                })
                              )}
                            </SortableContext>

                            <button
                              className="block w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm text-slate-400 transition hover:border-cyan-300 hover:text-cyan-600"
                              type="button"
                              onClick={() => setShowAddModal(true)}
                            >
                              + Add Card
                            </button>
                          </div>
                        </StatusColumn>
                      </div>
                    ))}
                  </div>
                </div>
                ) : null}

                {createPortal(
                  <DragOverlay dropAnimation={null}>
                    {activeCard ? (
                      <div
                        className={`pointer-events-none origin-center shadow-2xl opacity-95 transition-transform duration-200 ${
                          isDragSelectionAnimated ? "scale-[1.08]" : "scale-100"
                        }`}
                        style={{ width: activeCardWidth ?? 220 }}
                      >
                        <DraggableBoardCard
                          card={activeCard}
                          draggable={false}
                          showActions={false}
                          compact={true}
                          isPinned={Boolean(activeCard.isPinned)}
                          reminderState={getReminderState(activeCard, new Date())}
                        />
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body
                )}
              </DndContext>
            )}
              </>
            )}
          </section>
        </div>
      </div>

      {showAddModal ? (
        <AddApplicationModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (payload) => {
            await createMutation.mutateAsync(payload);
            setShowAddModal(false);
          }}
        />
      ) : null}

      {selectedApplication ? (
        <ApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
          onUpdate={async (id, payload) => {
            await updateMutation.mutateAsync({ id, payload });
          }}
          onDelete={async (id) => {
            await deleteMutation.mutateAsync(id);
          }}
        />
      ) : null}

      {followUpModalApplication ? (
        <FollowUpModal
          application={followUpModalApplication}
          onClose={() => setFollowUpModalApplication(null)}
          onSave={async (id, payload) => {
            await updateMutation.mutateAsync({ id, payload });
          }}
        />
      ) : null}

      {/* Mobile Action Menu (Fixed Dropdown) */}
      {mobileMenuState
        ? createPortal(
            <div
              className="fixed inset-0 z-[220]"
              onPointerDown={() => setMobileMenuState(null)}
            >
              <div
                className="absolute z-[230] w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                style={(() => {
                  const menuWidth = 160;
                  const menuHeight = 244;
                  const viewportPadding = 8;
                  const { anchorRect } = mobileMenuState;

                  const left = Math.min(
                    window.innerWidth - menuWidth - viewportPadding,
                    Math.max(viewportPadding, anchorRect.right - menuWidth)
                  );
                  const top = Math.min(
                    window.innerHeight - menuHeight - viewportPadding,
                    Math.max(viewportPadding, anchorRect.bottom + 6)
                  );

                  return { top, left };
                })()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
            <button
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              onClick={() => {
                setSelectedApplication(mobileMenuState.application);
                setMobileMenuState(null);
              }}
            >
              View Details
            </button>
            <button
              type="button"
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              onClick={() => {
                setSelectedApplication(mobileMenuState.application);
                setMobileMenuState(null);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              onClick={() => {
                setFollowUpModalApplication(mobileMenuState.application);
                setMobileMenuState(null);
              }}
            >
              Follow-Up
            </button>
            <button
              type="button"
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              onClick={() => {
                const application = mobileMenuState.application;
                const nextPinned = !Boolean(application.isPinned);
                if (nextPinned) {
                  setOrderByStatus((currentOrder) => {
                    const nextOrder = { ...currentOrder, [application.status]: currentOrder[application.status].filter((id) => id !== application._id) };
                    nextOrder[application.status] = [application._id, ...nextOrder[application.status]];
                    return nextOrder;
                  });
                }
                if (sortOption !== "random") setSortOption("random");
                void updateMutation.mutateAsync({ id: application._id, payload: { isPinned: nextPinned } });
                setMobileMenuState(null);
              }}
            >
              {mobileMenuState.application.isPinned ? "Unpin card" : "Pin card"}
            </button>
            <button
              type="button"
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 active:bg-rose-100"
              onClick={async () => {
                const app = mobileMenuState.application;
                const shouldDelete = window.confirm(`Delete ${app.company} - ${app.role}?`);
                if (shouldDelete) {
                  await deleteMutation.mutateAsync(app._id);
                  setMobileMenuState(null);
                }
              }}
            >
              Delete
            </button>
              </div>
            </div>,
            document.body
          )
        : null}

    </div>
  );
};