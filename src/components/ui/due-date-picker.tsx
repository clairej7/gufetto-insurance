"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Clock, X, CalendarDays } from "lucide-react";
import { updateTaskDueDate } from "@/lib/actions";

interface DueDatePickerProps {
  taskId: string;
  dueDate: Date | null;
  isDone?: boolean;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function toInputValue(d: Date | null) {
  if (!d) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function DueDatePicker({ taskId, dueDate: initialDueDate, isDone = false }: DueDatePickerProps) {
  const [dueDate, setDueDate] = useState<Date | null>(initialDueDate ? new Date(initialDueDate) : null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const isOverdue = !isDone && dueDate && dueDate < new Date();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleChange(value: string) {
    const newDate = value ? new Date(value + "T12:00:00") : null;
    setDueDate(newDate);
    setOpen(false);
    startTransition(() => updateTaskDueDate(taskId, newDate));
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setDueDate(null);
    startTransition(() => updateTaskDueDate(taskId, null));
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => !isDone && setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors"
        style={{
          backgroundColor: isDone ? "#F7F7F8" : dueDate ? (isOverdue ? "#FFF5F5" : "#F5F5FF") : "#F7F7F8",
          color: isDone ? "#A2A1AF" : dueDate ? (isOverdue ? "#CA1E12" : "#4E49FC") : "#A2A1AF",
          cursor: isDone ? "default" : "pointer",
        }}
      >
        {dueDate ? (
          <>
            <Clock className="h-3 w-3" />
            {formatDate(dueDate)}
            {!isDone && (
              <span onClick={clear} className="ml-0.5 hover:opacity-70">
                <X className="h-2.5 w-2.5" />
              </span>
            )}
          </>
        ) : (
          <>
            <CalendarDays className="h-3 w-3" />
            <span>Ajouter date</span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute z-30 mt-7 bg-white rounded-xl border shadow-lg p-3 min-w-[200px]"
          style={{ borderColor: "#E8E8EC", top: 0, right: 0 }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: "#656576" }}>Date d&apos;échéance</p>
          <input
            type="date"
            defaultValue={toInputValue(dueDate)}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full text-sm border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2"
            style={{ borderColor: "#E8E8EC", color: "#26262C", accentColor: "#4E49FC" }}
            autoFocus
          />
          <div className="mt-2 flex gap-1.5">
            {[1, 3, 7].map((days) => {
              const d = new Date(); d.setDate(d.getDate() + days);
              return (
                <button
                  key={days}
                  onClick={() => handleChange(d.toISOString().slice(0, 10))}
                  className="flex-1 text-xs py-1 rounded-lg border transition-colors hover:bg-[#F5F5FF] hover:border-[#4E49FC] hover:text-[#4E49FC]"
                  style={{ borderColor: "#E8E8EC", color: "#656576" }}
                >
                  J+{days}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
