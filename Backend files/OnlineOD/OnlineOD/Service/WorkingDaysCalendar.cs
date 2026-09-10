using System;
using System.Collections.Generic;
using System.Linq;

namespace OnlineOD.Service
{
    /// <summary>
    /// College working-days calendar. Seeded dynamically for the current
    /// year: every Mon–Sat date from today through Dec 31 is enabled as a
    /// working day (Sundays excluded). OD applications are only permitted
    /// on the dates that appear here — this is the server-side twin of the
    /// working-days.js used on the student apply forms, so the rule is
    /// enforced even for requests that bypass the browser UI.
    ///
    /// HOD-made edits/removals (via the calendar UI) are layered on top of
    /// this seed via ApplyOverride() / LoadOverrides().
    /// </summary>
    public static class WorkingDaysCalendar
    {
        // Seed list: every Mon–Sat from today through Dec 31 of the current year.
        private static readonly HashSet<string> SeedWorkingDays = GenerateSeedWorkingDays();

        private static HashSet<string> GenerateSeedWorkingDays()
        {
            var set = new HashSet<string>();
            var start = DateTime.Today;
            var end = new DateTime(DateTime.Today.Year, 12, 31);

            for (var d = start; d <= end; d = d.AddDays(1))
            {
                if (d.DayOfWeek != DayOfWeek.Sunday)
                    set.Add(d.ToString("yyyy-MM-dd"));
            }
            return set;
        }

        private static readonly string SeedMinDate = SeedWorkingDays.Min();
        private static readonly string SeedMaxDate = SeedWorkingDays.Max();

        // Live, mutable set — starts as a copy of the seed and is adjusted
        // at startup (from DB overrides) and at runtime (when the HOD edits
        // or removes a day from the calendar).
        public static HashSet<string> WorkingDays { get; private set; } = new HashSet<string>(SeedWorkingDays);

        public static string MinDate => WorkingDays.Count > 0 ? WorkingDays.Min() : SeedMinDate;
        public static string MaxDate => WorkingDays.Count > 0 ? WorkingDays.Max() : SeedMaxDate;

        /// <summary>Applies a batch of HOD-made overrides on top of the seed list — called once at app startup.</summary>
        public static void LoadOverrides(IEnumerable<(string Date, bool IsWorking)> overrides)
        {
            foreach (var o in overrides)
                ApplyOverride(o.Date, o.IsWorking);
        }

        /// <summary>
        /// HOD edits a single date: true = mark/keep it a working day
        /// (add to calendar), false = remove it from the calendar (holiday).
        /// </summary>
        public static bool ApplyOverride(string dateStr, bool isWorking)
        {
            var normalized = Normalize(dateStr);
            if (normalized == null) return false;

            if (isWorking) WorkingDays.Add(normalized);
            else WorkingDays.Remove(normalized);

            return true;
        }

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