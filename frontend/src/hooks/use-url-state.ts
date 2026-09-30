"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ParamValue = string | string[] | null | undefined;

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const setParams = React.useCallback(
    (updates: Record<string, ParamValue>, options: { resetPage?: boolean; replace?: boolean } = {}) => {
      const next = new URLSearchParams(queryString);
      for (const [key, value] of Object.entries(updates)) {
        next.delete(key);
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry) next.append(key, entry);
          }
        } else if (value !== null && value !== undefined && value !== "") {
          next.set(key, value);
        }
      }
      if (options.resetPage) next.delete("page");
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (options.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, queryString, router],
  );

  const get = React.useCallback((key: string) => searchParams.get(key) ?? undefined, [searchParams]);
  const getAll = React.useCallback((key: string) => searchParams.getAll(key), [searchParams]);

  return { params: searchParams, get, getAll, setParams, queryString, pathname };
}
