import { 
  DndContext, 
  DragOverlay, 
  type DragEndEvent, 
  type DragStartEvent,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter
} from "@dnd-kit/core";
import { useMemo, useState, useRef, type ReactNode } from "react";
import type { Application, ApplicationStatus } from "../types";
import { STATUSES } from "../types";
import { ApplicationCard } from "./ApplicationCard";

interface KanbanBoardProps {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => Promise<void>;
  onCardClick: (application: Application) => void;
  onCardEdit: (application: Application) => void;
  onCardDelete: (application: Application) => Promise<void>;
}

const Column = ({
  status,
  count,
  children
}: {
  status: ApplicationStatus;
  count: number;
  children: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`min-h-[260px] h-full rounded-2xl border p-3 ${
        isOver ? "border-cyan-300 bg-cyan-950/30" : "border-white/10 bg-slate-950/50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-100 text-sm sm:text-base">{status}</h3>
        <span className="rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-200">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
};

export const KanbanBoard = ({
  applications,
  onStatusChange,
  onCardClick,
  onCardEdit,
  onCardDelete
}: KanbanBoardProps) => {
  const [activeCard, setActiveCard] = useState<Application | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Configure sensors for mobile touch and desktop pointer
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 5
    }
  });

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
      delay: 0
    }
  });

  const sensors = useSensors(touchSensor, pointerSensor);

  const grouped = useMemo(() => {
    return STATUSES.reduce<Record<ApplicationStatus, Application[]>>((acc, status) => {
      acc[status] = applications.filter((app) => app.status === status);
      return acc;
    }, {} as Record<ApplicationStatus, Application[]>);
  }, [applications]);

  const handleDragStart = (event: DragStartEvent) => {
    const current = applications.find((app) => app._id === event.active.id);
    setActiveCard(current ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);

    if (!event.over) {
      return;
    }

    const applicationId = String(event.active.id);
    const nextStatus = event.over.id as ApplicationStatus;
    const current = applications.find((app) => app._id === applicationId);

    if (!current || current.status === nextStatus) {
      return;
    }

    await onStatusChange(applicationId, nextStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => {
        setActiveCard(null);
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Mobile: horizontal snap-scroll strip; xl: multi-column grid */}
      <div 
        ref={containerRef}
        className="no-scrollbar flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory xl:grid xl:grid-cols-5 xl:overflow-x-visible xl:pb-0 xl:gap-4"
      >
        {STATUSES.map((status) => (
          <div
            key={status}
            className="min-w-[min(272px,80vw)] flex-shrink-0 snap-start xl:min-w-0 xl:flex-1"
          >
            <Column status={status} count={grouped[status].length}>
              {grouped[status].length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                  Drop cards here
                </p>
              ) : (
                grouped[status].map((application) => (
                  <ApplicationCard
                    key={application._id}
                    application={application}
                    onClick={onCardClick}
                    onEdit={onCardEdit}
                    onDelete={onCardDelete}
                  />
                ))
              )}
            </Column>
          </div>
        ))}
      </div>

      <DragOverlay 
        dropAnimation={null}
        modifiers={[]}
      >
        {activeCard ? (
          <div className="w-[272px] pointer-events-none">
            <ApplicationCard
              application={activeCard}
              onClick={() => undefined}
              onEdit={() => undefined}
              onDelete={async () => undefined}
              showActions={false}
              draggable={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
