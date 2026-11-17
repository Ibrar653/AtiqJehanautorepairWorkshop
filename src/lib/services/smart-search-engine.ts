/**
 * Smart Search Engine for Workshop ERP
 * Supports:
 * - Normalized separator-insensitive matching (GSS23456 <-> GSS-23456 <-> GSS 23456)
 * - Short-query exact/substring priority (no noisy fuzzy matches on "2" or "23")
 * - Damerau-Levenshtein edit distance + Trigram similarity for typo tolerance (Toyta -> Toyota, Ahmd -> Ahmed)
 * - 4-tier result ranking: exact > prefix > substring > fuzzy ("Similar match")
 */

export type SearchMatchTier = "exact" | "prefix" | "substring" | "fuzzy" | "none";

export interface MatchScore {
  tier: SearchMatchTier;
  score: number; // Higher is better
}

const TIER_RANK: Record<SearchMatchTier, number> = {
  exact: 4,
  prefix: 3,
  substring: 2,
  fuzzy: 1,
  none: 0,
};

export function sanitizePostgrestValue(raw: string): string {
  return raw.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

export function stripSeparators(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).toLowerCase().replace(/[\s\-_./]+/g, "");
}

/**
 * Checks if a query is a short purely-numeric string (<= 3 digits),
 * where fuzzy digit-swapping would produce unrelated noise.
 */
export function isShortNumericQuery(raw: string): boolean {
  const stripped = stripSeparators(raw);
  return /^\d{1,3}$/.test(stripped);
}

/**
 * Inserts `%` at letter<->digit boundaries and spaces/hyphens so that
 * `GSS23456` produces `%GSS%23456%`, matching `GSS-23456`, `GSS 23456`, and `GSS23456` in PostgreSQL ILIKE.
 */
export function buildSeparatorTolerantPattern(raw: string): string {
  const clean = sanitizePostgrestValue(raw);
  if (!clean) return "%";
  const withBoundaries = clean
    .replace(/([a-zA-Z])(\d)/g, "$1%$2")
    .replace(/(\d)([a-zA-Z])/g, "$1%$2")
    .replace(/[\s\-_]+/g, "%")
    .replace(/%+/g, "%");
  return `%${withBoundaries}%`;
}

/**
 * Generates safe PostgREST wildcard patterns for typo-tolerant candidate fetching.
 * Only used for queries with length >= 3 that are NOT short numeric queries.
 */
export function buildFuzzyWildcardPatterns(raw: string): string[] {
  const stripped = stripSeparators(sanitizePostgrestValue(raw));
  if (stripped.length < 3 || isShortNumericQuery(stripped)) {
    return [];
  }

  const patterns = new Set<string>();
  // 1. First 3 chars & last 3 chars
  patterns.add(`%${stripped.slice(0, 3)}%`);
  if (stripped.length >= 4) {
    patterns.add(`%${stripped.slice(-3)}%`);
  }
  // 2. First 2 + last 2 with wildcard in middle (catches missing middle char like Ahmd -> Ah%md -> Ahmed, Toyta -> To%ta -> Toyota)
  if (stripped.length >= 4) {
    patterns.add(`%${stripped.slice(0, 2)}%${stripped.slice(-2)}%`);
  } else {
    // length === 3: first 1 + last 1
    patterns.add(`%${stripped[0]}%${stripped.slice(-1)}%`);
  }
  // 3. Sliding 3-char chunks for longer strings (catches 1 wrong digit in plates like GSS23457 -> %234%, %345%)
  if (stripped.length >= 6) {
    const mid = Math.floor(stripped.length / 2) - 1;
    patterns.add(`%${stripped.slice(mid, mid + 3)}%`);
  }

  return Array.from(patterns).slice(0, 5);
}

/**
 * Optimal string alignment / Damerau-Levenshtein distance.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost); // transposition
      }
    }
  }
  return dp[lenA][lenB];
}

function getTrigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = getTrigrams(a);
  const tb = getTrigrams(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Scores a single field value against a search query.
 */
export function scoreFieldMatch(query: string, fieldValue: string | number | null | undefined): MatchScore {
  if (fieldValue === null || fieldValue === undefined) {
    return { tier: "none", score: 0 };
  }

  const rawField = String(fieldValue);
  const qNorm = normalizeText(query);
  const fNorm = normalizeText(rawField);
  const qStrip = stripSeparators(query);
  const fStrip = stripSeparators(rawField);

  if (!qNorm || !fNorm) return { tier: "none", score: 0 };

  // 1. Exact match (with or without separators)
  if (fNorm === qNorm || (qStrip.length > 0 && fStrip === qStrip)) {
    return { tier: "exact", score: 1000 };
  }

  // 2. Prefix match
  if (fNorm.startsWith(qNorm) || (qStrip.length > 0 && fStrip.startsWith(qStrip))) {
    return { tier: "prefix", score: 800 - Math.min(100, fStrip.length - qStrip.length) };
  }

  // 3. Substring match
  if (fNorm.includes(qNorm) || (qStrip.length > 0 && fStrip.includes(qStrip))) {
    return { tier: "substring", score: 600 - Math.min(100, fStrip.indexOf(qStrip)) };
  }

  // Multi-word token match (e.g. "Toyota Land Cruiser" vs "Toyota Land Cruiser")
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => fNorm.includes(t) || fStrip.includes(stripSeparators(t)))) {
    return { tier: "substring", score: 580 };
  }

  // 4. Fuzzy match (only for queries >= 3 chars and NOT short numeric queries)
  if (qStrip.length < 3 || isShortNumericQuery(qStrip)) {
    return { tier: "none", score: 0 };
  }

  // Compare against whole stripped field and individual words in field
  const words = fNorm.split(/[\s\-_]+/).filter(Boolean);
  const candidates = [fStrip, ...words.map(stripSeparators)];

  let bestScore = 0;
  for (const cand of candidates) {
    if (!cand || cand.length < 3) continue;
    // Skip wildly different lengths
    if (Math.abs(cand.length - qStrip.length) > 3) continue;

    const dist = damerauLevenshtein(qStrip, cand);
    const maxDist = qStrip.length <= 4 ? 1 : 2;
    const sim = trigramSimilarity(qStrip, cand);

    if (dist <= maxDist || sim >= 0.42) {
      const candidateScore = Math.round(sim * 300) + Math.max(0, 100 - dist * 40);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
      }
    }
  }

  if (bestScore > 0) {
    return { tier: "fuzzy", score: bestScore };
  }

  return { tier: "none", score: 0 };
}

/**
 * Scores a record across multiple weighted fields and attaches `_matchType` & `_isSimilarMatch`.
 * Also checks combined fields (e.g. `${make} ${model}`) for multi-word vehicle queries.
 */
export function rankAndFilterRecords<T extends Record<string, any>>(
  records: T[],
  query: string,
  getFieldValues: (item: T) => Array<{ value: string | number | null | undefined; weight?: number }>,
  options: { filterNonMatching?: boolean } = {}
): Array<T & { _matchType?: SearchMatchTier; _isSimilarMatch?: boolean; _matchScore?: number }> {
  const clean = query.trim();
  if (!clean) return records;

  const scored = records.map((item) => {
    const fields = getFieldValues(item);
    let bestTier: SearchMatchTier = "none";
    let bestScore = 0;

    for (const f of fields) {
      const res = scoreFieldMatch(clean, f.value);
      if (res.tier === "none") continue;
      const weightedScore = res.score + (f.weight || 0);
      if (
        TIER_RANK[res.tier] > TIER_RANK[bestTier] ||
        (TIER_RANK[res.tier] === TIER_RANK[bestTier] && weightedScore > bestScore)
      ) {
        bestTier = res.tier;
        bestScore = weightedScore;
      }
    }

    return {
      ...item,
      _matchType: bestTier,
      _isSimilarMatch: bestTier === "fuzzy",
      _matchScore: bestScore,
    };
  });

  const filtered = options.filterNonMatching
    ? scored.filter((r) => r._matchType !== "none")
    : scored;

  return filtered.sort((a, b) => {
    const rankDiff = TIER_RANK[b._matchType || "none"] - TIER_RANK[a._matchType || "none"];
    if (rankDiff !== 0) return rankDiff;
    return (b._matchScore || 0) - (a._matchScore || 0);
  });
}
