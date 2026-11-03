/** The category CALIBRE files every market that is neither a known sports league nor politics under. */
export const OTHER = "other";

/**
 * Slug prefixes of sports and esports leagues on Polymarket (the first word of a game market's slug, e.g.
 * `nba-okc-cle-2026-11-02`), curated from the wallets in the index. Anything else (weather, crypto price ladders,
 * social-media counts, "will ..." questions) is filed as `other`, so a first word like `highest` never becomes a league.
 */
const SPORTS_LEAGUES = new Set([
  // US
  "nba", "wnba", "nfl", "cfb", "cbb", "cwbb", "mlb", "nhl", "ahl", "mls", "nwsl", "canpl", "uslc", "usl1", "cfl", "lpga", "f1", "ufc", "boxing", "wbc",
  // Football: international and cups
  "epl", "ucl", "uel", "uecl", "conl", "unl", "uwcl", "uwec", "wsl", "fifwc", "afcq", "cafcl", "u20wwc", "dfb", "cdr", "efl", "elc", "el1", "el2", "enl", "nlc",
  // Football: domestic leagues
  "lal", "es2", "es3", "sea", "itsb", "isp", "serc", "bun", "bl2", "bl3", "fl1", "fr2", "por", "pt2", "tur", "tur2", "ere", "ned2", "scop", "spl", "bel1", "bel2",
  "mex", "mex2", "arg", "argpn", "bra", "bra2", "bra3", "brco", "col1", "col2", "chi1", "chi2", "ecu1", "uru1", "par1", "per1", "bol1", "ven1", "clf",
  "ja2", "ja3", "kor2", "acle", "acl2", "idn1", "idn2", "tha1", "qat1", "egy1", "mar1", "uzb1", "kaz1", "aze1", "aze2", "ukr1", "rou1", "gre1", "cze1",
  "fin1", "svk1", "est1", "irl1", "hr1", "srb", "swe2", "nor2", "lva1", "ltu1", "blr1", "fpd", "gtm", "ecs", "tpe1", "nirl1", "sclc", "saf1", "isl1",
  // Tennis, cricket, baseball, hockey and other leagues
  "atp", "wta", "itf", "wtt", "daviscup", "crint", "cricnpl", "cricipl", "cricwbbl", "cricwncl", "cricshield", "crichksixes", "kbo", "npb", "cpbl", "afl", "khl", "shl", "liiga", "cehl", "dehl", "snhl", "hockeychl",
  // Basketball outside the US
  "euroleague", "bkcba", "bkkbl", "bknbl", "bkjpn", "bkseriea", "bkeurocup", "bkbsl", "bkbbl", "bkligend", "bkaba", "bkfr1", "bkarg", "bklkl", "bkcl", "bknbb", "bkisrsl", "bklnbp", "bkkls", "bkplk", "bkvtb", "bkfibaw", "bkfibaqas", "bkligarg",
  // Esports
  "cs2", "lol", "lec", "val", "dota2", "hok", "mlbb", "r6siege", "azec",
]);

/**
 * Prefixes that are also ordinary words or country names at the start of non-sports slugs (`chi`, `col`, `aus`, `pol`, `lib`,
 * `rus`, `den`, `fif`, `ow`, ...): they count as a league only when the slug carries a game date (`...-yyyy-mm-dd`).
 */
const NEEDS_GAME_DATE = new Set([
  "chi", "col", "aus", "pol", "lib", "rus", "isr", "bul", "sud", "hun", "slo", "den", "nor", "sui", "aut", "swe", "kor", "jap", "fif", "ow", "atc", "meta",
]);

const GAME_DATE = /-\d{4}-\d{2}-\d{2}(-|$)/;

/** League code from a market or event slug: its first segment when that is a known league, otherwise `other`. */
export function leagueOf(slug: string): string {
  const s = slug.trim().toLowerCase();
  const prefix = s.split("-")[0] ?? "";
  if (SPORTS_LEAGUES.has(prefix)) return prefix;
  return NEEDS_GAME_DATE.has(prefix) && GAME_DATE.test(s) ? prefix : OTHER;
}

export const KNOWN_LEAGUES: readonly string[] = [...SPORTS_LEAGUES, ...NEEDS_GAME_DATE];
