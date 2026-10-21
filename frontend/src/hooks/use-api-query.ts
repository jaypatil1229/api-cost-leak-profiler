"use client";

import * as React from "react";
import { apiRequest } from "@/lib/api/client";

interface QueryState<T> {
  key: string;
  revision: number;
  data: T | null;
  error: string | null;
}

export function useApiQuery<T>(path: string | null) {
  const [state, setState] = React.useState<QueryState<T> | null>(null);
  const [revision, setRevision] = React.useState(0);
  const reload = React.useCallback(() => setRevision((value) => value + 1), []);

  React.useEffect(() => {
    if (!path) return;
    let active = true;
    void apiRequest<T>(path).then((data) => {
      if (active) setState({ key: path, revision, data, error: null });
    }).catch((cause: unknown) => {
      if (active) setState({ key: path, revision, data: null, error: cause instanceof Error ? cause.message : "Unable to load data." });
    });
    return () => { active = false; };
  }, [path, revision]);

  const current = path && state?.key === path && state.revision === revision ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: Boolean(path && !current), reload };
}
