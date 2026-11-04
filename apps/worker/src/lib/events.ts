import type { EventSort, PredictionClient, PredictionEvent } from "../../../../packages/chain/src/index.js";
import { WORKER_DIR, readJson, writeJson } from "./config.js";

/**
 * Active events of a category from Tatum, kept on disk for `maxAgeMs` so that a polling loop lists events a few times
 * an hour instead of on every pass (each listing costs a Tatum credit). With `cacheOnly` it never calls Tatum and returns
 * whatever listing is on disk, however old.
 */
export async function activeEvents(
  api: PredictionClient, category: "SPORTS" | "POLITICS", sort: EventSort, maxAgeMs: number, cacheOnly = false,
): Promise<PredictionEvent[]> {
  const file = `${WORKER_DIR}/events-${category.toLowerCase()}-${sort}.json`;
  const kept = await readJson<{ at: number; events: PredictionEvent[] } | null>(file, null);
  if (kept && (cacheOnly || Date.now() - kept.at < maxAgeMs)) return kept.events;
  // Out of Tatum calls for this hour: an old listing is better than none, and no listing is better than an uncapped call.
  if (cacheOnly) return [];
  const events = (await api.events({ platform: "polymarket", status: "active", category, sort, limit: 100 })).data;
  await writeJson(file, { at: Date.now(), events });
  return events;
}
