"use client";

import * as React from "react";
import { PROJECTS } from "@/lib/mock-data/projects";
import { STORAGE_KEYS } from "@/lib/constants";
import type { Project } from "@/types/domain";

const DEFAULT_PROJECT_ID = PROJECTS[0].id;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readStoredProjectId(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.projectId);
    if (stored && PROJECTS.some((project) => project.id === stored)) return stored;
  } catch {
    /* storage unavailable in this context */
  }
  return DEFAULT_PROJECT_ID;
}

export function writeStoredProjectId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.projectId, id);
  } catch {
    /* storage unavailable in this context */
  }
  for (const listener of listeners) listener();
}

export function useProject() {
  const projectId = React.useSyncExternalStore(subscribe, readStoredProjectId, () => DEFAULT_PROJECT_ID);
  const setProject = React.useCallback((id: string) => writeStoredProjectId(id), []);
  const project: Project = PROJECTS.find((entry) => entry.id === projectId) ?? PROJECTS[0];

  return { project, projectId, setProject, projects: PROJECTS };
}
