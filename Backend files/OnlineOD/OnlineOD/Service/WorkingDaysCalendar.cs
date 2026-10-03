using System;
using System.Collections.Generic;
using System.Linq;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    /// <summary>
    /// College working-days calendar. Seeded dynamically for the current
    /// year: every Mon�Sat date from today through Dec 31 is enabled as a
    /// working day (Sundays excluded). OD applications are only permitted
    /// on the dates that appear here � this is the server-side twin of the
    /// working-days.js used on the student apply forms, so the rule is
    /// enforced even for requests that bypass the browser UI.
    ///
    /// HOD/Staff-made edits (via the calendar UI) are layered on top of
    /// this seed via ApplyOverride() / LoadOverrides().
    /// </summary>
    public static class WorkingDaysCalendar
    {
        private static readonly object _lock = new object();

        // Seed list: every Mon�Sat from today through Dec 31 of the current year.
        private static readonly HashSet<string> SeedWorkingDays = GenerateSeedWorkingDays();

        private static HashSet<string> GenerateSeedWorkingDays()
        {
            var set = new HashSet<string>();
            var currentYear = DateTime.Today.Year;
            var start = new DateTime(currentYear - 10, 1, 1);
            var end = new DateTime(currentYear + 10, 12, 31);

            for (var d = start; d <= end; d = d.AddDays(1))
            {
                if (d.DayOfWeek != DayOfWeek.Sunday)
                    set.Add(d.ToString("yyyy-MM-dd"));
            }
            return set;
        }

        private static readonly string SeedMinDate = SeedWorkingDays.Min();
        private static readonly string SeedMaxDate = SeedWorkingDays.Max();

        public static HashSet<string> WorkingDays { get; private set; } = new HashSet<string>(SeedWorkingDays);

        // Special days list (Holiday / Examination) with department, year, section scoping
        private static readonly List<SpecialDayItem> _specialDaysList = new List<SpecialDayItem>();

        public static IReadOnlyList<SpecialDayItem> AllSpecialDays
        {
            get
            {
                lock (_lock)
                {
                    return _specialDaysList.ToList();
                }
            }
        }

        public static string MinDate => WorkingDays.Count > 0 ? WorkingDays.Min() : SeedMinDate;
        public static string MaxDate => WorkingDays.Count > 0 ? WorkingDays.Max() : SeedMaxDate;

        /// <summary>Applies a batch of calendar overrides on top of the seed list � called once at app startup.</summary>
        public static void LoadOverrides(IEnumerable<WorkingDayOverride> overrides)
        {
            lock (_lock)
            {
                WorkingDays = new HashSet<string>(SeedWorkingDays);
                _specialDaysList.Clear();

                foreach (var o in overrides)
                {
                    ApplyOverrideInternal(o.Date, o.IsWorking, o.DayType, o.Name, o.Department, o.Course, o.Year, o.Section, o.Id);
                }
            }
        }

        public static void LoadOverrides(IEnumerable<(string Date, bool IsWorking, string? DayType, string? Name)> overrides)
        {
            lock (_lock)
            {
                WorkingDays = new HashSet<string>(SeedWorkingDays);
                _specialDaysList.Clear();

                foreach (var o in overrides)
                {
                    ApplyOverrideInternal(o.Date, o.IsWorking, o.DayType, o.Name, null, null, null, null, 0);
                }
            }
        }

        public static bool ApplyOverride(string dateStr, bool isWorking, string? dayType = null, string? name = null,
            string? department = null, string? course = null, int? year = null, string? section = null, int id = 0, string? addedBy = null)
        {
            lock (_lock)
            {
                return ApplyOverrideInternal(dateStr, isWorking, dayType, name, department, course, year, section, id, addedBy);
            }
        }

        private static bool ApplyOverrideInternal(string dateStr, bool isWorking, string? dayType = null, string? name = null,
            string? department = null, string? course = null, int? year = null, string? section = null, int id = 0, string? addedBy = null)
        {
            var normalized = Normalize(dateStr);
            if (normalized == null) return false;

            var cleanDept = string.IsNullOrWhiteSpace(department) ? null : department.Trim();
            var cleanCourse = string.IsNullOrWhiteSpace(course) ? null : course.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : section.Trim();
            var cleanYear = (year.HasValue && year.Value > 0) ? year.Value : (int?)null;
            var cleanName = name?.Trim() ?? string.Empty;
            var cleanType = dayType?.Trim();

            // Baseline WorkingDays (HashSet) only reflects true institution-wide/global overrides.
            // Scoped overrides (for specific department, category/course, year, or section) MUST NOT
            // mutate the global WorkingDays set, or they leak to all other departments/classes.
            bool isGlobalScope = string.IsNullOrWhiteSpace(cleanDept) &&
                                 !cleanYear.HasValue &&
                                 string.IsNullOrWhiteSpace(cleanSec) &&
                                 (string.IsNullOrWhiteSpace(cleanCourse) || cleanCourse.Equals("All", StringComparison.OrdinalIgnoreCase));

            if (isGlobalScope)
            {
                if (isWorking) WorkingDays.Add(normalized);
                else WorkingDays.Remove(normalized);
            }

            if (!string.IsNullOrWhiteSpace(cleanType))
            {
                // Check if matching item already in list to update or add
                var existing = _specialDaysList.FirstOrDefault(s =>
                    (id > 0 && s.Id == id) ||
                    (s.Date == normalized &&
                     string.Equals(s.Department ?? "", cleanDept ?? "", StringComparison.OrdinalIgnoreCase) &&
                     string.Equals(s.Course ?? "", cleanCourse ?? "", StringComparison.OrdinalIgnoreCase) &&
                     s.Year == cleanYear &&
                     string.Equals(s.Section ?? "", cleanSec ?? "", StringComparison.OrdinalIgnoreCase) &&
                     string.Equals(s.Name, cleanName, StringComparison.OrdinalIgnoreCase)));

                if (existing != null)
                {
                    existing.DayType = cleanType;
                    existing.Name = cleanName;
                    existing.Department = cleanDept;
                    existing.Course = cleanCourse;
                    existing.Year = cleanYear;
                    existing.Section = cleanSec;
                    if (!string.IsNullOrWhiteSpace(addedBy)) existing.AddedBy = addedBy;
                    if (id > 0) existing.Id = id;
                }
                else
                {
                    _specialDaysList.Add(new SpecialDayItem
                    {
                        Id = id,
                        Date = normalized,
                        DayType = cleanType,
                        Name = cleanName,
                        Department = cleanDept,
                        Course = cleanCourse,
                        Year = cleanYear,
                        Section = cleanSec,
                        AddedBy = addedBy
                    });
                }
            }
            else
            {
                _specialDaysList.RemoveAll(s => s.Date == normalized && (id == 0 || s.Id == id));
            }

            return true;
        }

        private static bool MatchesScope(SpecialDayItem item, string? dept, int? year, string? section, string? category = null)
        {
            // 1. Department matching
            if (!string.IsNullOrWhiteSpace(item.Department))
            {
                if (string.IsNullOrWhiteSpace(dept))
                    return false;

                var itemDept = item.Department.Trim().ToLower();
                var queryDept = dept.Trim().ToLower();
                if (itemDept != queryDept && !itemDept.Contains(queryDept) && !queryDept.Contains(itemDept))
                    return false;
            }

            // 2. Category / Course matching (UG / PG)
            if (!string.IsNullOrWhiteSpace(item.Course) && !item.Course.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(category))
                    return false;

                var itemCourse = item.Course.Trim().ToLower();
                var queryCourse = category.Trim().ToLower();
                if (itemCourse != queryCourse && !itemCourse.Contains(queryCourse) && !queryCourse.Contains(itemCourse))
                    return false;
            }

            // 3. Year matching
            if (item.Year.HasValue && item.Year.Value > 0)
            {
                if (!year.HasValue || year.Value <= 0 || item.Year.Value != year.Value)
                    return false;
            }

            // 4. Section matching
            if (!string.IsNullOrWhiteSpace(item.Section) && !item.Section.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ||
                    !string.Equals(item.Section.Trim(), section.Trim(), StringComparison.OrdinalIgnoreCase))
                    return false;
            }

            return true;
        }

        public static List<SpecialDayItem> GetSpecialDays(string? dept = null, int? year = null, string? section = null, string? category = null)
        {
            lock (_lock)
            {
                return _specialDaysList
                    .Where(s => MatchesScope(s, dept, year, section, category))
                    .OrderBy(s => s.Date)
                    .ToList();
            }
        }

        public static List<SpecialDayItem> GetSpecialDaysInRange(string? fromStr, string? toStr, string? dept = null, int? year = null, string? section = null, string? category = null)
        {
            var from = Normalize(fromStr);
            var to = Normalize(toStr);
            if (from == null || to == null || string.Compare(from, to, StringComparison.Ordinal) > 0)
                return new List<SpecialDayItem>();

            lock (_lock)
            {
                return _specialDaysList
                    .Where(s => string.Compare(s.Date, from, StringComparison.Ordinal) >= 0 &&
                                string.Compare(s.Date, to, StringComparison.Ordinal) <= 0 &&
                                MatchesScope(s, dept, year, section, category))
                    .OrderBy(s => s.Date)
                    .ToList();
            }
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

            if (DateTime.TryParse(from, out var dtFrom) && dtFrom.DayOfWeek == DayOfWeek.Sunday)
                return "FromDate cannot be Sunday.";
            if (DateTime.TryParse(to, out var dtTo) && dtTo.DayOfWeek == DayOfWeek.Sunday)
                return "ToDate cannot be Sunday.";

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

    public class SpecialDayItem
    {
        public int Id { get; set; }
        public string Date { get; set; } = string.Empty;
        public string DayType { get; set; } = "Holiday"; // "Holiday" | "Examination"
        public string Name { get; set; } = string.Empty;
        public string? Department { get; set; }
        public string? Course { get; set; }
        public int? Year { get; set; }
        public string? Section { get; set; }
        public string? AddedBy { get; set; }
    }
}
