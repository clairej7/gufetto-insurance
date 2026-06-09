"use client";

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";

export function formatGestionnaire(email: string): string {
  const prenom = email.split(".")[0];
  const nom = email.split(".")[1]?.split("@")[0];
  return prenom && nom
    ? `${prenom.charAt(0).toUpperCase() + prenom.slice(1)} ${nom.charAt(0).toUpperCase() + nom.slice(1)}`
    : email.split("@")[0];
}

export function MultiSelectFilter({
  placeholder,
  options,
  value,
  onChange,
  renderOption,
  width = 160,
}: {
  placeholder: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  renderOption?: (v: string) => string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const render = renderOption ?? ((v: string) => v);
  const filteredOpts = options.filter((o) =>
    render(o).toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  const buttonLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
      ? render(value[0])
      : `${value.length} sélectionnés`;

  const hasSelection = value.length > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 32,
          padding: "0 8px",
          border: `1px solid ${hasSelection ? "#4E49FC" : "#E8E8EC"}`,
          borderRadius: 4,
          background: hasSelection ? "#F5F5FF" : "#fff",
          color: hasSelection ? "#4E49FC" : "#656576",
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
          minWidth: width,
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            textAlign: "left",
          }}
        >
          {buttonLabel}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexShrink: 0,
          }}
        >
          {hasSelection && (
            <span
              onMouseDown={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                color: "#4E49FC",
                opacity: 0.7,
                cursor: "pointer",
              }}
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={12} style={{ opacity: 0.5 }} />
        </div>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "100%",
            marginTop: 2,
            left: 0,
            minWidth: Math.max(width, 180),
            background: "#fff",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(13,22,63,.12)",
            border: "1px solid #E8E8EC",
            padding: "4px 0",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {options.length > 6 && (
            <div
              style={{
                padding: "6px 8px 4px",
                borderBottom: "1px solid #F3F3F5",
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                style={{
                  width: "100%",
                  fontSize: 12,
                  padding: "4px 8px",
                  border: "1px solid #E8E8EC",
                  borderRadius: 4,
                  outline: "none",
                  color: "#26262C",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
          {filteredOpts.map((opt) => (
            <label
              key={opt}
              onMouseDown={(e) => {
                e.preventDefault();
                toggle(opt);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                fontSize: 13,
                color: value.includes(opt) ? "#4E49FC" : "#26262C",
                background: value.includes(opt) ? "#F5F5FF" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                style={{
                  accentColor: "#4E49FC",
                  width: 13,
                  height: 13,
                  flexShrink: 0,
                }}
              />
              {render(opt)}
            </label>
          ))}
          {filteredOpts.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "#A2A1AF" }}>
              Aucun résultat
            </div>
          )}
        </div>
      )}
    </div>
  );
}
