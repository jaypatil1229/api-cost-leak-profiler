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

  const matching = path && state?.key === path ? state : null;
  const current = matching && matching.revision === revision ? matching : null;
  return {
    data: current?.data ?? matching?.data ?? null,
    error: current?.error ?? matching?.error ?? null,
    loading: Boolean(path && !matching),
    reload,
  };
}
