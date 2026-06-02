"use client";

import { createContext, useContext } from "react";

export type NewStudyContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const NewStudyContext = createContext<NewStudyContextValue | undefined>(
  undefined,
);

export function useNewStudy(): NewStudyContextValue {
  const ctx = useContext(NewStudyContext);
  if (!ctx) throw new Error("useNewStudy must be used inside <NewStudyProvider>");
  return ctx;
}
