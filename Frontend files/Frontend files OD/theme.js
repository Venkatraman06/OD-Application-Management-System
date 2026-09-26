// ── theme.js — shared light/dark theme toggle (loaded by all pages) ──
(function () {
    const STORAGE_KEY = 'od-theme';
    const LIGHT = 'light';
    const DARK  = 'dark';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.setAttribute('aria-label', theme === DARK ? 'Switch to light mode' : 'Switch to dark mode');
            const sun = btn.querySelector('.theme-icon-sun');
            const moon = btn.querySelector('.theme-icon-moon');
            if (sun) sun.style.display = theme === DARK ? 'block' : 'none';
            if (moon) moon.style.display = theme === LIGHT ? 'block' : 'none';
        });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || DARK;
        applyTheme(current === DARK ? LIGHT : DARK);
    }

    // Apply saved theme immediately (before paint)
    const saved = localStorage.getItem(STORAGE_KEY) || DARK;
    document.documentElement.setAttribute('data-theme', saved);

    // Expose globally so inline onclick can call it too
    window.__odToggleTheme = toggleTheme;

    // Wire up buttons once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(localStorage.getItem(STORAGE_KEY) || DARK);
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.addEventListener('click', toggleTheme);
        });
    });

    // ── Global Register Number Tooltip & Name Lookup (Requirement 7) ──
    window.__regNameLookup = window.__regNameLookup || {};

    window.setStudentNameLookup = function(lookupMap) {
        if (!lookupMap) return;
        for (const [k, v] of Object.entries(lookupMap)) {
            if (k) {
                const name = typeof v === 'object' ? (v.name || v.Name || '') : String(v);
                window.__regNameLookup[k.trim().toLowerCase()] = name;
            }
        }
    };

    window.lookupStudentName = function(regNo) {
        if (!regNo) return '';
        const key = String(regNo).trim().toLowerCase();
        if (window.__regNameLookup[key]) return window.__regNameLookup[key];
        if (window.studentLookup && window.studentLookup[key]) {
            const item = window.studentLookup[key];
            return typeof item === 'object' ? (item.name || item.Name || '') : String(item);
        }
        if (window.studentNameLookup && window.studentNameLookup[key]) {
            const item = window.studentNameLookup[key];
            return typeof item === 'object' ? (item.name || item.Name || '') : String(item);
        }
        return '';
    };

    window.renderRegHover = function(regNo, name) {
        if (!regNo) return '';
        const regClean = String(regNo).trim();
        const resolvedName = name || window.lookupStudentName(regClean);
        if (resolvedName) {
            window.__regNameLookup[regClean.toLowerCase()] = resolvedName;
        }
        const escName = (resolvedName || '').replace(/"/g, '&quot;');
        return `<span class="reg-hoverable" data-reg="${regClean}" data-name="${escName}">${regClean}</span>`;
    };

    let tooltipEl = null;
    function getTooltipEl() {
        if (!tooltipEl) {
            tooltipEl = document.getElementById('regNameTooltip');
            if (!tooltipEl) {
                tooltipEl = document.createElement('div');
                tooltipEl.id = 'regNameTooltip';
                tooltipEl.className = 'reg-name-tooltip';
                document.body.appendChild(tooltipEl);
            }
        }
        return tooltipEl;
    }

    function showRegTooltip(targetEl) {
        const reg = targetEl.getAttribute('data-reg') || targetEl.textContent.trim();
        let name = targetEl.getAttribute('data-name');
        if (!name) {
            name = window.lookupStudentName(reg);
            if (name) targetEl.setAttribute('data-name', name);
        }
        if (!name) return;

        const tip = getTooltipEl();
        tip.textContent = name;

        const rect = targetEl.getBoundingClientRect();
        const left = Math.max(60, Math.min(window.innerWidth - 60, rect.left + rect.width / 2));
        const top = rect.top;

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.classList.add('active');
    }

    function hideRegTooltip() {
        if (tooltipEl) {
            tooltipEl.classList.remove('active');
        }
    }

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.reg-hoverable, [data-reg]');
        if (target) {
            showRegTooltip(target);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('.reg-hoverable, [data-reg]');
        if (target) {
            hideRegTooltip();
        }
    });

    document.addEventListener('touchstart', (e) => {
        const target = e.target.closest('.reg-hoverable, [data-reg]');
        if (target) {
            showRegTooltip(target);
        } else {
            hideRegTooltip();
        }
    }, { passive: true });

    window.renderMissingCertWarningHtml = function(missingCerts, isGroup = false, totalGroupMembersCount = 0) {
        if (!missingCerts || !Array.isArray(missingCerts) || missingCerts.length === 0) return '';

        function fmtD(dStr) {
            if (!dStr) return '';
            try {
                const d = new Date(dStr);
                return isNaN(d.getTime()) ? dStr : d.toLocaleDateString('en-GB');
            } catch { return dStr; }
        }

        const distinctMissingMembers = new Set();
        missingCerts.forEach(c => {
            const reg = (c.registerNumber || c.RegisterNumber || '').trim().toUpperCase();
            if (reg) distinctMissingMembers.add(reg);
        });

        const isAllGroupMissing = isGroup && totalGroupMembersCount > 0 && distinctMissingMembers.size >= totalGroupMembersCount;

        let titleText = '⚠ Missing Previous Certificate Warning';
        if (isGroup) {
            if (isAllGroupMissing) {
                titleText = '⚠ All group members have not submitted their previous certificates.';
            } else {
                titleText = `⚠ Missing Previous Certificate Warning (${distinctMissingMembers.size} member${distinctMissingMembers.size > 1 ? 's' : ''} with unsubmitted certificates)`;
            }
        } else {
            titleText = `⚠ Missing Previous Certificate Warning (${missingCerts.length} completed OD${missingCerts.length > 1 ? 's' : ''} pending certificate submission)`;
        }

        let itemsHtml = '';
        missingCerts.forEach(c => {
            const reg = (c.registerNumber || c.RegisterNumber || '').trim().toUpperCase();
            const name = c.studentName || c.StudentName || (window.lookupStudentName ? window.lookupStudentName(reg) : '');
            const evName = c.eventName || c.EventName || 'Event';
            const colName = c.collegeName || c.CollegeName || '';
            const fDate = fmtD(c.fromDate || c.FromDate);
            const tDate = fmtD(c.toDate || c.ToDate);
            const dateSpan = fDate ? ` (${fDate}${tDate && tDate !== fDate ? ' to ' + tDate : ''})` : '';

            if (isGroup) {
                const regHtml = window.renderRegHover ? window.renderRegHover(reg, name) : reg;
                itemsHtml += `<li class="od-cert-warning-item">Register No: <strong>${regHtml}</strong>${name ? ' (' + name + ')' : ''} — <em>${evName}</em>${colName ? ' @ ' + colName : ''}${dateSpan}</li>`;
            } else {
                itemsHtml += `<li class="od-cert-warning-item"><strong>${evName}</strong>${colName ? ' at <em>' + colName + '</em>' : ''}${dateSpan}</li>`;
            }
        });

        return `
        <div class="od-cert-warning">
            <div class="od-cert-warning-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex-shrink:0;">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>${titleText}</span>
            </div>
            <ul class="od-cert-warning-list">
                ${itemsHtml}
            </ul>
        </div>`;
    };
})();