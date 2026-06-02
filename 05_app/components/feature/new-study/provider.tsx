"use client";

import { useCallback, useState, type ReactNode } from "react";

import { NewStudyContext } from "./context";
import { NewStudyModal } from "./new-study-modal";

/**
 * Shared open/close state for the New study modal, so both the TopBar button
 * and the empty-state CTA (different parts of the tree) drive one modal.
 * Mounted once in the (app) layout.
 */
export function NewStudyProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <NewStudyContext.Provider value={{ isOpen, open, close }}>
      {children}
      <NewStudyModal />
    </NewStudyContext.Provider>
  );
}
