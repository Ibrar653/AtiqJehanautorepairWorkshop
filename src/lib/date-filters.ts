export type HistoryDateFilterPreset =
  | "all"
  | "today"
  | "yesterday"
  | "7days"
  | "30days"
  | "this_month"
  | "last_month"
  | "custom";

export interface DateRangeBounds {
  start: Date | null;
  end: Date | null;
}

export interface DateFilterPresetOption {
  key: HistoryDateFilterPreset;
  label: string;
}

export const HISTORY_DATE_FILTER_OPTIONS: DateFilterPresetOption[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7days", label: "Last 7 Days" },
  { key: "30days", label: "Last 30 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "custom", label: "Custom Range" },
];

/**
 * Calculates start (00:00:00.000) and end (23:59:59.999) Date objects for a given preset
 */
export function getDateRangeBounds(
  preset: HistoryDateFilterPreset,
  customFrom?: string | null,
  customTo?: string | null
): DateRangeBounds {
  const now = new Date();

  switch (preset) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    case "yesterday": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { start, end };
    }
    case "7days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    case "30days": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "custom": {
      let start: Date | null = null;
      let end: Date | null = null;

      if (customFrom) {
        const [y, m, d] = customFrom.split("-").map(Number);
        if (y && m && d) {
          start = new Date(y, m - 1, d, 0, 0, 0, 0);
        }
      }

      if (customTo) {
        const [y, m, d] = customTo.split("-").map(Number);
        if (y && m && d) {
          end = new Date(y, m - 1, d, 23, 59, 59, 999);
        }
      }

      return { start, end };
    }
    case "all":
    default:
      return { start: null, end: null };
  }
}

/**
 * Checks whether a given timestamp string or Date falls within the specified bounds (inclusive)
 */
export function isDateWithinBounds(
  dateValue: string | Date | null | undefined,
  bounds: DateRangeBounds
): boolean {
  if (!dateValue) return false;
  const time = typeof dateValue === "string" ? new Date(dateValue).getTime() : dateValue.getTime();
  if (isNaN(time)) return false;

  if (bounds.start && time < bounds.start.getTime()) return false;
  if (bounds.end && time > bounds.end.getTime()) return false;

  return true;
}
