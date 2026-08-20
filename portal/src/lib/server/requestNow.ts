import "server-only";
import { cache } from "react";

// A per-request-stable timestamp. React `cache()` dedupes the no-arg call
// within a single render, so every server component in one request (layout +
// page + nested engines) shares ONE "now". That's what lets the cache()-wrapped
// per-request derivations below (keyed on agencyId) collapse to a single
// computation instead of one-per-caller — without changing the underlying
// functions' signatures (their default `now = Date.now()` stays intact for
// API routes, tests and any non-render caller).
export const getRequestNow = cache((): number => Date.now());
