"use client";

import { useState } from "react";
import { GROUPS, GROUPS_BY_KEY, type GroupKey } from "@/lib/groups";
import { ChSheet } from "./past-chats-sheet";
import "./chrome.css";

interface GroupLabelProps {
  groupKey: GroupKey;
  onChange: (key: GroupKey) => void;
}

// "money talk · picked for your question · change". Change opens a small
// sheet listing the six groups.
export default function GroupLabel({ groupKey, onChange }: GroupLabelProps) {
  const [open, setOpen] = useState(false);
  const group = GROUPS_BY_KEY[groupKey] ?? GROUPS_BY_KEY.advice;

  return (
    <>
      <div className="ch-group-label">
        <span className="ch-group-name">{group.name}</span>
        <span className="ch-group-why">· picked for your question ·</span>
        <button
          type="button"
          className="ch-group-change"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`change group, now ${group.name}`}
        >
          change
        </button>
      </div>

      <ChSheet open={open} onClose={() => setOpen(false)} labelledBy="ch-group-title">
        <h2 id="ch-group-title" className="ch-sheet-title">who should answer?</h2>
        <ul className="ch-list">
          {GROUPS.map((g) => {
            const active = g.key === group.key;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  className={`ch-row ch-row--stack${active ? " ch-row--active" : ""}`}
                  aria-pressed={active}
                  data-autofocus={active ? "" : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onChange(g.key);
                  }}
                >
                  <span className="ch-row-title">{g.name}</span>
                  <span className="ch-row-meta">{g.blurb}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </ChSheet>
    </>
  );
}
