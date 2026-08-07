"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { completeTask, reopenTask } from "@/lib/actions";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { DueDatePicker } from "@/components/ui/due-date-picker";

type Task = {
  id: string;
  name: string;
  body: string | null;
  status: string;
  assigneeEmail: string;
  dueDate: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  createdAt: Date;
  pipeline: {
    id: string;
    copro: { nom: string };
  } | null;
};

export function TasksList({ tasks }: { tasks: Task[] }) {
  const [tab, setTab] = useState<"todo" | "done">("todo");

  const todo = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  const shown = tab === "todo" ? todo : done;

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: "#E8E8EC" }}>
        <button
          onClick={() => setTab("todo")}
          className="px-4 py-2 text-sm font-medium transition-colors relative"
          style={{
            color: tab === "todo" ? "#4E49FC" : "#656576",
            borderBottom: tab === "todo" ? "2px solid #4E49FC" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          À faire
          {todo.length > 0 && (
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: tab === "todo" ? "#F5F5FF" : "#F7F7F8", color: tab === "todo" ? "#4E49FC" : "#A2A1AF" }}
            >
              {todo.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("done")}
          className="px-4 py-2 text-sm font-medium transition-colors"
          style={{
            color: tab === "done" ? "#4E49FC" : "#656576",
            borderBottom: tab === "done" ? "2px solid #4E49FC" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Terminées
          {done.length > 0 && (
            <span
              className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: tab === "done" ? "#F5F5FF" : "#F7F7F8", color: tab === "done" ? "#4E49FC" : "#A2A1AF" }}
            >
              {done.length}
            </span>
          )}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-16" style={{ color: "#A2A1AF" }}>
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {tab === "todo" ? "Aucune tâche à faire" : "Aucune tâche terminée"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();
  const isDone = task.status === "done";
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate) < new Date();

  function toggle() {
    startTransition(async () => {
      if (isDone) await reopenTask(task.id);
      else await completeTask(task.id);
    });
  }

  return (
    <div
      className="bg-white rounded-xl border px-4 py-3 flex items-start gap-3"
      style={{ borderColor: isOverdue ? "#FECACA" : "#E8E8EC" }}
    >
      <button
        onClick={toggle}
        disabled={pending}
        className="mt-0.5 shrink-0 transition-opacity"
        style={{ opacity: pending ? 0.5 : 1 }}
      >
        {isDone
          ? <CheckCircle2 className="h-5 w-5" style={{ color: "#4E49FC" }} />
          : <Circle className="h-5 w-5" style={{ color: "#A2A1AF" }} />
        }
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-sm font-medium"
            style={{ color: isDone ? "#A2A1AF" : "#26262C", textDecoration: isDone ? "line-through" : "none" }}
          >
            {task.name}
          </p>
          <DueDatePicker taskId={task.id} dueDate={task.dueDate} isDone={isDone} />
        </div>
        {task.body && (
          <p className="text-xs mt-0.5" style={{ color: "#656576" }}>{task.body}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {task.pipeline ? (
            <Link
              href={`/pipeline/${task.pipeline.id}`}
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: "#4E49FC" }}
            >
              <ExternalLink className="h-3 w-3" />
              {task.pipeline.copro.nom}
            </Link>
          ) : (
            <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: "#656576", background: "#F1F1F4" }}>
              Général
            </span>
          )}
          {isDone && task.completedAt && (
            <span className="text-xs" style={{ color: "#A2A1AF" }}>
              Terminée le {new Date(task.completedAt).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
