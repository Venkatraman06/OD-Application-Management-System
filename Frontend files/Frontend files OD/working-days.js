/**
 * College Working-Days Calendar
 * ------------------------------
 * Source: college_working_days.xlsx (Period: 01-12-2025 to 30-04-2026)
 * Generated list of every date that is an actual college WORKING day
 * (holidays, weekends, and non-working Saturdays are already excluded).
 *
 * OD (On-Duty) applications must only be raised on dates that appear
 * in this list. Update this file (or regenerate it from a fresh
 * working-days sheet) whenever the college publishes a new calendar.
 */

const COLLEGE_WORKING_DAYS = [
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
];

const CollegeWorkingDays = (() => {
    const workingSet = new Set(COLLEGE_WORKING_DAYS);
    const sorted = [...COLLEGE_WORKING_DAYS].sort();
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    /** true if dateStr (YYYY-MM-DD) is a published college working day */
    function isWorkingDay(dateStr) {
        if (!dateStr) return false;
        return workingSet.has(dateStr);
    }

    /** true if dateStr falls before the calendar's first day or after its last day */
    function isOutsideCalendar(dateStr) {
        if (!dateStr) return true;
        return dateStr < minDate || dateStr > maxDate;
    }

    /** counts only published working days (inclusive) between two YYYY-MM-DD strings */
    function countWorkingDays(fromStr, toStr) {
        if (!fromStr || !toStr || fromStr > toStr) return 0;
        let count = 0;
        for (const d of workingSet) {
            if (d >= fromStr && d <= toStr) count++;
        }
        return count;
    }

    return {
        list: COLLEGE_WORKING_DAYS,
        minDate,
        maxDate,
        isWorkingDay,
        isOutsideCalendar,
        countWorkingDays
    };
})();