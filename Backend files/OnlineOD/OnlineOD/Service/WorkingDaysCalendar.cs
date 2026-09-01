using System;
using System.Collections.Generic;
using System.Linq;

namespace OnlineOD.Service
{
    /// <summary>
    /// College working-days calendar (source: college_working_days.xlsx,
    /// period 01-12-2025 to 30-04-2026). Holidays and weekends are already
    /// excluded from this list. OD applications are only permitted on the
    /// dates that appear here — this is the server-side twin of the
    /// working-days.js used on the student apply forms, so the rule is
    /// enforced even for requests that bypass the browser UI.
    ///
    /// Regenerate this list whenever the college publishes a new calendar.
    /// </summary>
    public static class WorkingDaysCalendar
    {
        public static readonly HashSet<string> WorkingDays = new HashSet<string>
        {
            "2025-12-01", "2025-12-02", "2025-12-03", "2025-12-04", "2025-12-05", "2025-12-06", "2025-12-08", "2025-12-09", "2025-12-10", "2025-12-11",
            "2025-12-12", "2025-12-15", "2025-12-16", "2025-12-17", "2025-12-18", "2025-12-19", "2025-12-20", "2025-12-22", "2025-12-23", "2025-12-24",
            "2025-12-26", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-02", "2026-01-03", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08",
            "2026-01-09", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-19", "2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-27",
            "2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06", "2026-02-07",
            "2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
            "2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05",
            "2026-03-06", "2026-03-07", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-16", "2026-03-17", "2026-03-18",
            "2026-03-20", "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-30", "2026-04-01", "2026-04-02",
            "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10", "2026-04-13", "2026-04-15", "2026-04-16", "2026-04-17", "2026-04-18",
            "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24", "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"
        };

        public static readonly string MinDate = WorkingDays.Min();
        public static readonly string MaxDate = WorkingDays.Max();

        /// <summary>True if the given date string (any parseable format, compared as yyyy-MM-dd) is a published working day.</summary>
        public static bool IsWorkingDay(string? dateStr)
        {
            if (string.IsNullOrWhiteSpace(dateStr)) return false;
            var normalized = Normalize(dateStr);
            return normalized != null && WorkingDays.Contains(normalized);
        }

        /// <summary>Counts how many published working days fall within [fromStr, toStr], inclusive.</summary>
        public static int CountWorkingDays(string? fromStr, string? toStr)
        {
            var from = Normalize(fromStr);
            var to = Normalize(toStr);
            if (from == null || to == null || string.Compare(from, to, StringComparison.Ordinal) > 0)
                return 0;

            return WorkingDays.Count(d =>
                string.Compare(d, from, StringComparison.Ordinal) >= 0 &&
                string.Compare(d, to, StringComparison.Ordinal) <= 0);
        }

        /// <summary>Validates a From/To OD date range against the working-days calendar.
        /// Returns null when valid, or an error message describing the problem.</summary>
        public static string? ValidateRange(string? fromStr, string? toStr)
        {
            var from = Normalize(fromStr);
            var to = Normalize(toStr);

            if (from == null || to == null)
                return "FromDate and ToDate must be valid dates.";
            if (string.Compare(from, to, StringComparison.Ordinal) > 0)
                return "ToDate must be on or after FromDate.";
            if (string.Compare(from, MinDate, StringComparison.Ordinal) < 0 || string.Compare(from, MaxDate, StringComparison.Ordinal) > 0)
                return $"FromDate is outside the published college working-days calendar ({MinDate} to {MaxDate}).";
            if (string.Compare(to, MinDate, StringComparison.Ordinal) < 0 || string.Compare(to, MaxDate, StringComparison.Ordinal) > 0)
                return $"ToDate is outside the published college working-days calendar ({MinDate} to {MaxDate}).";
            if (!IsWorkingDay(from))
                return "FromDate is not a college working day (holiday/weekend).";
            if (!IsWorkingDay(to))
                return "ToDate is not a college working day (holiday/weekend).";

            return null;
        }

        private static string? Normalize(string? dateStr)
        {
            if (string.IsNullOrWhiteSpace(dateStr)) return null;
            if (DateTime.TryParse(dateStr, out var dt))
                return dt.ToString("yyyy-MM-dd");
            return null;
        }
    }
}