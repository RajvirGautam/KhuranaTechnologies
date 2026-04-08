import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import type { Application } from "../types";

interface ApplicationCardProps {
  application: Application;
  onClick: (application: Application) => void;
  onEdit: (application: Application) => void;
  onDelete: (application: Application) => Promise<void>;
  showActions?: boolean;
  draggable?: boolean;
}

export const ApplicationCard = ({
  application,
  onClick,
  onEdit,
  onDelete,
  showActions = true,
  draggable = true
}: ApplicationCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application._id,
    data: { status: application.status },
    disabled: !draggable
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    willChange: isDragging ? "transform" : "auto",
    zIndex: isDragging ? 1000 : "auto",
    touchAction: draggable ? "none" : "auto"
  };

  const closeMenu = () => setMenuOpen(false);

  const handleDelete = async () => {
    const shouldDelete = window.confirm(`Delete ${application.company} - ${application.role}?`);
    if (!shouldDelete) {
      return;
    }

    await onDelete(application);
    closeMenu();
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`relative w-full rounded-xl border border-white/10 bg-slate-900/80 p-4 text-left shadow transition-all ${
        isDragging ? "shadow-2xl shadow-amber-500/50 ring-2 ring-amber-300/50" : ""
      } hover:border-amber-300/60 active:cursor-grabbing ${draggable ? "cursor-grab" : ""}`}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-100">{application.company}</p>
          <p className="text-sm text-slate-300">{application.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-200">{application.status}</span>
          {showActions ? (
            <div className="relative">
              <button
                type="button"
                className="rounded-md border border-white/15 p-2 text-slate-200 hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((value) => !value);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Application actions"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>

              {menuOpen ? (
                <div
                  className="absolute right-0 z-20 mt-2 w-36 rounded-lg border border-white/10 bg-slate-950 p-1 shadow-xl"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                    onClick={() => {
                      onClick(application);
                      closeMenu();
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                    onClick={() => {
                      onEdit(application);
                      closeMenu();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-rose-300 hover:bg-slate-800"
                    onClick={() => {
                      void handleDelete();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <button type="button" className="mt-3 block w-full text-left" onClick={() => onClick(application)}>
        <p className="text-xs text-slate-400">Applied: {new Date(application.dateApplied).toLocaleDateString()}</p>
      </button>
    </article>
  );
};
