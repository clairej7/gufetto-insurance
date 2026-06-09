"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, X, User } from "lucide-react";

function shortName(email: string) {
  const local = email.split("@")[0];
  return local
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AssigneeFilter({ assignees, current, currentUserEmail }: { assignees: string[]; current?: string; currentUserEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(email: string | null) {
    setOpen(false);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (email) params.set("assignee", email);
      else params.delete("assignee");
      router.push(`/tasks?${params.toString()}`);
    });
  }

  // No param = my tasks (default) ; "all" = everyone ; email = specific person
  const isMine = !current || current === currentUserEmail;
  const isFiltered = !!current;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
        style={{
          borderColor: isFiltered ? "#4E49FC" : "#E8E8EC",
          backgroundColor: isFiltered ? "#F5F5FF" : "white",
          color: isFiltered ? "#4E49FC" : "#656576",
        }}
      >
        <User className="h-3.5 w-3.5" />
        {current === "all" ? "Tous les gestionnaires" : isMine ? "Mes tâches" : shortName(current!)}
        {isFiltered && current !== "all" ? (
          <span
            onClick={(e) => { e.stopPropagation(); select(null); }}
            className="ml-0.5 hover:opacity-70"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-56 bg-white rounded-xl border shadow-lg z-20 py-1 overflow-hidden"
          style={{ borderColor: "#E8E8EC" }}
        >
          {/* Mes tâches */}
          <button
            onClick={() => select(null)}
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F7F7F8] transition-colors"
            style={{ color: isMine ? "#4E49FC" : "#26262C", fontWeight: isMine ? 500 : 400 }}
          >
            <span className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#F5F5FF", color: "#4E49FC" }}>
              {currentUserEmail ? shortName(currentUserEmail)[0] : "M"}
            </span>
            Mes tâches
            {isMine && <span className="ml-auto text-xs" style={{ color: "#4E49FC" }}>✓</span>}
          </button>
          {/* Tous les gestionnaires */}
          <button
            onClick={() => select("all")}
            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F7F7F8] transition-colors"
            style={{ color: current === "all" ? "#4E49FC" : "#26262C", fontWeight: current === "all" ? 500 : 400 }}
          >
            <span className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#F7F7F8", color: "#656576" }}>
              T
            </span>
            Tous les gestionnaires
            {current === "all" && <span className="ml-auto text-xs" style={{ color: "#4E49FC" }}>✓</span>}
          </button>
          <div className="my-1 border-t" style={{ borderColor: "#F0F0F2" }} />
          {assignees.map((email) => {
            const name = shortName(email);
            const initials = email.split("@")[0].split(".").map((p: string) => p[0].toUpperCase()).join("").slice(0, 2);
            const isSelected = current === email;
            return (
              <button
                key={email}
                onClick={() => select(email)}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F7F7F8] transition-colors"
                style={{ color: isSelected ? "#4E49FC" : "#26262C", fontWeight: isSelected ? 500 : 400 }}
              >
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#F5F5FF", color: "#4E49FC" }}
                >
                  {initials}
                </span>
                <span className="flex-1 truncate">{name}</span>
                {isSelected && <span className="text-xs" style={{ color: "#4E49FC" }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
