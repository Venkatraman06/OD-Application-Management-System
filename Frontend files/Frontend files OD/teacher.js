const API_BASE = 'http://localhost:5088';

document.addEventListener('DOMContentLoaded', async () => {
    const facultyId = localStorage.getItem('facultyId');
    const dept      = localStorage.getItem('userDept');
    const section   = localStorage.getItem('userSection') || '';
    if (!facultyId || !dept) { window.location.href = 'index.html'; return; }

    const name = localStorage.getItem('userName') || 'Faculty';

    // ── Set faculty details ──
    setEl('teacherName', name);
    setEl('teacherDept', section ? `${dept} • Section ${section}` : dept);
    setEl('teacherID',   'FAC' + facultyId);
    const avatar = document.getElementById('teacherAvatar');
    if (avatar) { const sp = avatar.querySelector('span'); if (sp) sp.textContent = name.charAt(0).toUpperCase(); }

    // ── Stat pills: set correct IDs ──
    const statTotalEl   = document.querySelector('#statTotal .stat-number') || document.getElementById('statTotal');
    const statPendingEl = document.querySelector('#statPending .stat-number') || document.getElementById('statPending');

    let allODs = [];
    let allCerts = [];
    let certsLoaded = false;
    let currentFilter = 'pending';

    // ── Register number → student lookup (name, department, year) ──
    // Group OD data only carries register numbers for non-applicant members,
    // so we fetch the full student list once and use it to resolve each
    // member's name/class for the certificate details table.
    let studentLookup = {};
    async function loadStudentLookup() {
        try {
            const res = await fetch(`${API_BASE}/api/Student?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const students = await res.json();
            studentLookup = {};
            students.forEach(s => {
                const reg = (s.registerNumber || s.RegisterNumber || '').trim().toLowerCase();
                if (reg) studentLookup[reg] = {
                    name: s.name || s.Name || '',
                    department: s.department || s.Department || '',
                    year: s.year || s.Year || ''
                };
            });
            // Re-render if the certificates tab is already showing, so member
            // names fill in even if this lookup finished after the first paint.
            if (currentFilter === 'certificates' && certsLoaded) {
                renderCertificates(searchFilterCerts(allCerts));
            }
        } catch (err) { console.error('Student lookup load error:', err); }
    }
    function lookupStudent(reg) {
        return studentLookup[(reg || '').trim().toLowerCase()] || null;
    }

    const sectionMeta = {
        pending: {
            title: 'Pending OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
        },
        approved: {
            title: 'Accepted OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
        },
        rejected: {
            title: 'Rejected OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        },
        certificates: {
            title: 'Finished OD Certificates',
            emptyTitle: 'No Finished ODs Yet',
            emptyText: 'Once an approved OD\'s dates are finished, it will appear here.',
            icon: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>'
        }
    };

    // ── Load OD requests (pending/approved/rejected) ──
    // Restricted to this staff member's own Department + Section, so a
    // Section-B student's request is only ever visible to Section-B staff.
    async function loadODs() {
        try {
            const url = `${API_BASE}/api/Faculty/PendingODs/${encodeURIComponent(dept)}` +
                        `${section ? `?section=${encodeURIComponent(section)}&` : '?'}_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) { console.error('Load ODs failed:', res.status); return; }
            allODs = await res.json();
            updateCounts(allODs);
            if (currentFilter !== 'certificates') applyFilter(currentFilter);
        } catch (err) { console.error(err); showToast('error', 'Failed to load ODs'); }
    }

    // ── Load certificates (view-only) — faculty-approved ODs whose dates have finished ──
    // Shows BOTH uploaded and not-yet-uploaded, same as HOD page. Also
    // restricted to this staff member's own Department + Section.
    async function loadCertificates() {
        try {
            // Cache-bust: avoids a stale cached response masking a certificate
            // the student just uploaded.
            const url = `${API_BASE}/api/Faculty/PendingODs/${encodeURIComponent(dept)}` +
                        `${section ? `?section=${encodeURIComponent(section)}&` : '?'}_=${Date.now()}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) { console.error('Load certificates failed:', res.status); return; }
            const data = await res.json();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            allCerts = data.filter(o => {
                if (o.facultyStatus !== 'Approved') return false;
                const to = o.toDate ? new Date(o.toDate) : null;
                if (!to || isNaN(to.getTime())) return false;
                to.setHours(0, 0, 0, 0);
                return to < today;
            });
            certsLoaded = true;
            setEl('certificatesCount', allCerts.length);
            if (currentFilter === 'certificates') renderCertificates(searchFilterCerts(allCerts));
        } catch (err) { console.error(err); showToast('error', 'Failed to load certificates'); }
    }

    function updateCounts(ods) {
        const total    = ods.length;
        const pending  = ods.filter(o => o.facultyStatus === 'Pending').length;
        const approved = ods.filter(o => o.facultyStatus === 'Approved').length;
        const rejected = ods.filter(o => o.facultyStatus === 'Rejected').length;

        if (statTotalEl)   statTotalEl.textContent   = total;
        if (statPendingEl) statPendingEl.textContent = pending;
        setEl('pendingCount',  pending);
        setEl('approvedCount', approved);
        setEl('rejectedCount', rejected);
    }

    function searchFilterCerts(certs) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            return certs.filter(o => {
                if ((o.registerNumber || '').toLowerCase().includes(q)) return true;
                const members = (o.registerNumbers || '').split(',').map(r => r.trim().toLowerCase());
                return members.some(m => m.includes(q));
            });
        }
        return certs;
    }

    /**
     * Returns [{ registerNumber, cert, isRejected }] for one OD — the member
     * list for a group OD, or a single-entry list for a solo OD. isRejected
     * is true when faculty rejected that member and HOD has not overridden
     * it back — such members don't need a certificate since they aren't
     * actually attending the OD.
     */
    function getMemberCertRows(od) {
        const certList = od.certificates ?? od.Certificates ?? [];
        const findCert = (reg) => certList.find(c =>
            ((c.registerNumber ?? c.RegisterNumber ?? '').trim().toLowerCase()) === reg.trim().toLowerCase()
        ) || null;

        const rejectedList = (od.facultyRejectedRegisterNumbers ?? od.FacultyRejectedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const overriddenList = (od.hodApprovedRegisterNumbers ?? od.HodApprovedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const isRejected = (reg) => {
            const r = reg.trim().toLowerCase();
            return rejectedList.includes(r) && !overriddenList.includes(r);
        };

        if (od.isGroupOd) {
            const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
            return members.map(reg => ({ registerNumber: reg, cert: findCert(reg), isRejected: isRejected(reg) }));
        }
        const reg = od.registerNumber || '';
        return [{ registerNumber: reg, cert: findCert(reg), isRejected: isRejected(reg) }];
    }

    function applySectionMeta(filter) {
        const meta = sectionMeta[filter] || sectionMeta.pending;
        setEl('sectionTitleText', meta.title);
        setEl('emptyStateTitle', meta.emptyTitle);
        setEl('emptyStateText', meta.emptyText);
        const iconEl = document.getElementById('sectionTitleIcon');
        if (iconEl) iconEl.innerHTML = meta.icon;
    }

    function applyFilter(filter) {
        currentFilter = filter;
        const searchBox = document.getElementById('searchBox');
        applySectionMeta(filter);

        if (filter === 'certificates') {
            if (searchBox) searchBox.style.display = 'block';
            if (certsLoaded) {
                renderCertificates(searchFilterCerts(allCerts));
            } else {
                if (document.getElementById('requestsContainer')) {
                    document.getElementById('requestsContainer').innerHTML =
                        '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading certificates...</div>';
                }
                loadCertificates();
            }
            return;
        }

        // show search only for approved/rejected
        if (searchBox) searchBox.style.display = (filter === 'approved' || filter === 'rejected') ? 'block' : 'none';

        let filtered;
        if      (filter === 'pending')  filtered = allODs.filter(o => o.facultyStatus === 'Pending');
        else if (filter === 'approved') filtered = allODs.filter(o => o.facultyStatus === 'Approved');
        else if (filter === 'rejected') filtered = allODs.filter(o => o.facultyStatus === 'Rejected');
        else filtered = allODs;

        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(o => (o.registerNumber||'').toLowerCase().includes(q));
        }

        // Pending requests are sorted by soonest-starting OD first, so the
        // most time-sensitive requests bubble to the top and staff can react
        // before the OD date arrives instead of scrolling to find them.
        if (filter === 'pending') {
            filtered = [...filtered].sort((a, b) => {
                const da = a.fromDate ? new Date(a.fromDate).getTime() : Infinity;
                const db = b.fromDate ? new Date(b.fromDate).getTime() : Infinity;
                return da - db;
            });
        }

        renderODs(filtered, filter);
    }

    // Keeps full OD objects addressable by id so the "View Details" modal can
    // look up complete data (including group members) without stuffing it all
    // into onclick attributes.
    let odsById = {};

    function renderODs(ods, filter) {
        const container = document.getElementById('requestsContainer');
        const empty     = document.getElementById('emptyState');
        setEl('sectionCount', `${ods.length} request${ods.length !== 1 ? 's' : ''}`);

        if (!ods || ods.length === 0) {
            if (container) container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';
        ods.forEach(od => { odsById[od.odId] = od; });
        if (container) container.innerHTML = ods.map(od => {
            const countdown = odDateCountdownLabel(od.fromDate, od.toDate);
            return `
            <div class="request-card" data-odid="${od.odId}">
                ${countdown.text ? `<div class="od-countdown-banner ${countdown.cls}">${countdown.text}</div>` : ''}
                <div class="card-header">
                    <div class="student-avatar">${(od.studentName||'S').charAt(0).toUpperCase()}</div>
                    <div class="student-info">
                        <h3>${od.studentName || ''} ${od.isGroupOd ? `<span class="status-badge" style="font-size:10px;padding:2px 8px;margin-left:6px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3)">GROUP: ${od.groupName || ''}</span>` : ''}</h3>
                        <p>${od.registerNumber || ''} &bull; ${od.department || ''} &bull; Year ${od.year || ''}</p>
                    </div>
                    <span class="status-badge ${bdg(od.facultyStatus)}">${od.facultyStatus || 'Pending'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Event:</strong> ${od.event || ''}</p>
                    <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                    <p><strong>Dates:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)} &nbsp;|&nbsp; <strong>Days:</strong> ${od.numberOfDays || ''}</p>
                    <p><strong>Applied On:</strong> ${fmtDT(od.appliedDate)}</p>
                    <p><strong>Reason:</strong> ${od.reason || ''}</p>
                    <p style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">
                        <strong>HOD Status:</strong>
                        <span class="status-badge ${bdg(od.hodStatus)}" style="font-size:11px;padding:2px 10px;margin-left:6px">${od.hodStatus || 'Pending'}</span>
                    </p>
                    ${od.isGroupOd ? renderMemberChips(od) : ''}
                </div>
                <div class="card-actions">
                    <button type="button" class="view-details-btn" data-odid="${od.odId}">View Details</button>
                    ${od.facultyStatus === 'Pending' ? `
                    <button class="btn-approve" onclick="approveOD(${od.odId},'${esc(od.studentName)}')">✓ Approve</button>
                    <button class="btn-reject"  onclick="rejectOD(${od.odId},'${esc(od.studentName)}')">✕ Reject</button>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    // ── OD Full Details modal (view-only, mirrors the student page's modal) ──
    const odDetailOverlay = document.getElementById('odDetailOverlay');
    function openOdDetailModal(od) {
        if (!od) return;
        const overall = od.hodStatus === 'Approved' ? 'approved'
            : (od.hodStatus === 'Rejected' || od.facultyStatus === 'Rejected') ? 'rejected'
            : 'pending';
        const overallLabel = od.hodStatus === 'Approved' ? 'Fully Approved ✓'
            : od.hodStatus === 'Rejected' ? 'Rejected by HOD'
            : od.facultyStatus === 'Rejected' ? 'Rejected by Faculty'
            : od.facultyStatus === 'Approved' ? 'Awaiting HOD'
            : 'Pending';

        setEl('odDetailEvent', od.event || '');
        const overallBadge = document.getElementById('odDetailOverallBadge');
        if (overallBadge) { overallBadge.className = `badge-${bdg(overall === 'approved' ? 'Approved' : overall === 'rejected' ? 'Rejected' : 'Pending')}`; overallBadge.textContent = overallLabel; }

        setEl('odDetailStudent', od.studentName || '');
        setEl('odDetailRegNo', od.registerNumber || '');
        setEl('odDetailDeptSection', [od.department, od.section ? `Section ${od.section}` : ''].filter(Boolean).join(' • '));
        setEl('odDetailYear', od.year || '-');
        setEl('odDetailCollege', od.collegeIndustry || '');
        setEl('odDetailFromDate', fmtDate(od.fromDate));
        setEl('odDetailToDate', fmtDate(od.toDate));
        const countdown = odDateCountdownLabel(od.fromDate, od.toDate);
        setEl('odDetailDays', od.numberOfDays ? `${od.numberOfDays}${countdown.text ? ' (' + countdown.text + ')' : ''}` : '-');
        setEl('odDetailApplied', fmtDT(od.appliedDate));
        setEl('odDetailReason', od.reason || 'No reason provided');

        const facBadge = document.getElementById('odDetailFacultyStatus');
        if (facBadge) { facBadge.className = `badge-${bdg(od.facultyStatus)}`; facBadge.textContent = od.facultyStatus || 'Pending'; }
        const hodBadge = document.getElementById('odDetailHodStatus');
        if (hodBadge) { hodBadge.className = `badge-${bdg(od.hodStatus)}`; hodBadge.textContent = od.hodStatus || 'Pending'; }

        const groupSection = document.getElementById('odDetailGroupSection');
        if (od.isGroupOd) {
            setEl('odDetailGroupName', od.groupName || '-');
            const membersDiv = document.getElementById('odDetailMembers');
            if (membersDiv) {
                const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
                membersDiv.innerHTML = members.length
                    ? members.map(m => {
                        const known = m.toLowerCase() === (od.registerNumber || '').toLowerCase()
                            ? { name: od.studentName }
                            : lookupStudent(m);
                        const label = known?.name ? `${m} — ${known.name}` : m;
                        return `<span>${escHtml(label)}</span>`;
                    }).join('')
                    : '<span>No members listed</span>';
            }
            if (groupSection) groupSection.style.display = 'flex';
        } else if (groupSection) {
            groupSection.style.display = 'none';
        }

        odDetailOverlay?.classList.add('active');
    }
    function closeOdDetailModal() { odDetailOverlay?.classList.remove('active'); }
    document.getElementById('odDetailCloseBtn')?.addEventListener('click', closeOdDetailModal);
    odDetailOverlay?.addEventListener('click', (e) => { if (e.target === odDetailOverlay) closeOdDetailModal(); });

    document.getElementById('requestsContainer')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-details-btn');
        if (btn) {
            const odId = parseInt(btn.dataset.odid, 10);
            openOdDetailModal(odsById[odId]);
        }
    });

    // ── Render certificate cards ──
    // ONE card per OD (not per member). Solo ODs show their single
    // certificate row directly. Group ODs show a summary ("2/4 uploaded")
    // and a "View Member Details" toggle that expands a table listing every
    // member's register number, name, upload status, and verify action —
    // so staff see the whole group at a glance instead of scrolling through
    // one card per student.
    function renderCertificates(certs) {
        const container = document.getElementById('requestsContainer');
        const empty     = document.getElementById('emptyState');
        setEl('sectionCount', `${certs.length} finished OD${certs.length !== 1 ? 's' : ''}`);

        if (!certs || certs.length === 0) {
            if (container) container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        if (container) container.innerHTML = certs.map(od => {
            const odId = od.odId ?? od.OdId;
            const rows = getMemberCertRows(od);

            if (!od.isGroupOd) {
                // ── Solo OD: same single-member layout as before ──
                const { cert } = rows[0];
                const rawUrl = cert ? (cert.certificatePhotoUrl ?? cert.CertificatePhotoUrl ?? '') : '';
                const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
                const certUrl = resolvedUrl ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
                const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(rawUrl);
                const isVerified = !!(cert && (cert.certificateVerified ?? cert.CertificateVerified));
                const uploadedBadge = !rawUrl ? 'Not Uploaded' : isVerified ? 'Verified ✓' : 'Certificate Uploaded';
                const badgeClass = !rawUrl ? 'cert-badge' : isVerified ? 'cert-badge cert-badge-verified' : 'cert-badge';

                return `
                <div class="request-card cert-card">
                    <div class="card-header">
                        <div class="student-avatar">${(od.studentName||'S').charAt(0).toUpperCase()}</div>
                        <div class="student-info">
                            <h3>${od.studentName || ''}</h3>
                            <p>${od.registerNumber || ''} &bull; ${od.department || ''}</p>
                        </div>
                        <span class="status-badge ${badgeClass}">${uploadedBadge}</span>
                    </div>
                    <div class="card-body">
                        <p><strong>Event:</strong> ${od.event || ''}</p>
                        <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                        <p><strong>OD Finished:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)}</p>
                    </div>
                    ${certUrl ? `
                    <div class="cert-preview-row">
                        ${isImage
                            ? `<img src="${certUrl}" alt="Certificate" class="cert-thumb" onclick="openCertPreview('${certUrl}','${esc(od.studentName)}')">`
                            : `<div class="cert-file-icon" onclick="openCertPreview('${certUrl}','${esc(od.studentName)}')">
                                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
                                       <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                       <polyline points="14 2 14 8 20 8"/>
                                   </svg>
                               </div>`
                        }
                        <a href="${certUrl}" target="_blank" rel="noopener" class="cert-view-link">View Full Certificate ↗</a>
                    </div>
                    <div class="cert-verify-row">
                        ${isVerified
                            ? `<span class="cert-verified-note">✓ Verified — student can no longer change this certificate</span>`
                            : `<button type="button" class="cert-verify-btn" onclick="verifyCertificate(${odId}, '${esc(od.registerNumber)}', '${esc(od.studentName)}')">
                                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                       <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                       <polyline points="22 4 12 14.01 9 11.01"/>
                                   </svg>
                                   Verify Certificate
                               </button>`
                        }
                    </div>` : `<p class="cert-none-text">OD finished — student has not uploaded a certificate yet.</p>`}
                </div>`;
            }

            // ── Group OD: one summary card + expandable member table ──
            // Rejected members (faculty rejected, not overridden by HOD) are
            // excluded from the counts and don't need a certificate — they
            // never actually attended the OD.
            const activeRows = rows.filter(r => !r.isRejected);
            const uploadedCount = activeRows.filter(r => r.cert && (r.cert.certificatePhotoUrl ?? r.cert.CertificatePhotoUrl)).length;
            const verifiedCount = activeRows.filter(r => r.cert && (r.cert.certificateVerified ?? r.cert.CertificateVerified)).length;

            const memberRows = rows.map(({ registerNumber, cert, isRejected }) => {
                const rawUrl = cert ? (cert.certificatePhotoUrl ?? cert.CertificatePhotoUrl ?? '') : '';
                const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
                const certUrl = resolvedUrl ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
                const isVerified = !!(cert && (cert.certificateVerified ?? cert.CertificateVerified));
                const known = registerNumber === od.registerNumber
                    ? { name: od.studentName, department: od.department }
                    : lookupStudent(registerNumber);
                const displayName = known?.name || '';
                const className = known ? [known.department, known.year ? `Year ${known.year}` : ''].filter(Boolean).join(' • ') : '';

                if (isRejected) {
                    return `
                        <div class="cert-member-row cert-member-row-rejected">
                            <div class="cert-mrow-name">
                                <span class="cert-mrow-reg">${registerNumber}${displayName ? ` — ${escHtml(displayName)}` : ''}</span>
                                <span class="cert-mrow-fullname">${className ? escHtml(className) : ''}</span>
                            </div>
                            <span class="cert-mrow-status cert-mrow-rejected">Rejected — Not Attending</span>
                            <div class="cert-mrow-actions"><span class="cert-mrow-none">No certificate needed</span></div>
                        </div>`;
                }

                const statusText = !rawUrl ? 'Not Uploaded' : isVerified ? 'Verified ✓' : 'Uploaded';
                const statusClass = !rawUrl ? 'cert-mrow-status' : isVerified ? 'cert-mrow-status cert-mrow-verified' : 'cert-mrow-status cert-mrow-uploaded';

                const actionHtml = !rawUrl
                    ? `<span class="cert-mrow-none">—</span>`
                    : `<a href="#" onclick="event.preventDefault(); openCertPreview('${certUrl}','${esc(displayName || registerNumber)}')" class="cert-mrow-view">View</a>` +
                      (isVerified
                        ? `<span class="cert-mrow-verified-tag">✓ Verified</span>`
                        : `<button type="button" class="cert-mrow-verify-btn" onclick="verifyCertificate(${odId}, '${esc(registerNumber)}', '${esc(displayName || registerNumber)}')">Verify</button>`);

                return `
                    <div class="cert-member-row">
                        <div class="cert-mrow-name">
                            <span class="cert-mrow-reg">${registerNumber}${displayName ? ` — ${escHtml(displayName)}` : ''}</span>
                            <span class="cert-mrow-fullname">${className ? escHtml(className) : ''}</span>
                        </div>
                        <span class="${statusClass}">${statusText}</span>
                        <div class="cert-mrow-actions">${actionHtml}</div>
                    </div>`;
            }).join('');

            return `
            <div class="request-card cert-card cert-card-group">
                <div class="card-header">
                    <div class="student-avatar">G</div>
                    <div class="student-info">
                        <h3>Group: ${od.groupName || ''}</h3>
                        <p>${activeRows.length} member${activeRows.length !== 1 ? 's' : ''} &bull; ${od.department || ''}</p>
                    </div>
                    <span class="status-badge cert-badge">${uploadedCount}/${activeRows.length} uploaded${verifiedCount ? `, ${verifiedCount} verified` : ''}</span>
                </div>
                <div class="card-body">
                    <p><strong>Event:</strong> ${od.event || ''}</p>
                    <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                    <p><strong>OD Finished:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)}</p>
                </div>
                <button type="button" class="cert-expand-btn" onclick="toggleGroupCertDetails(this)">
                    <span>View Member Details</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="cert-expand-icon">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <div class="cert-group-details" style="display:none">
                    <div class="cert-member-row cert-member-row-head">
                        <div class="cert-mrow-name">Register Number / Name</div>
                        <span class="cert-mrow-status">Certificate</span>
                        <div class="cert-mrow-actions">Action</div>
                    </div>
                    ${memberRows}
                </div>
            </div>`;
        }).join('');
    }

    // ── Toggle the expandable member-details table on a group cert card ──
    window.toggleGroupCertDetails = (btn) => {
        const card = btn.closest('.cert-card-group');
        const details = card?.querySelector('.cert-group-details');
        if (!details) return;
        const opening = details.style.display === 'none';
        details.style.display = opening ? 'block' : 'none';
        btn.classList.toggle('expanded', opening);
        const label = btn.querySelector('span');
        if (label) label.textContent = opening ? 'Hide Member Details' : 'View Member Details';
    };

    // ── Certificate preview modal (view-only, no download/upload controls) ──
    const certPreviewOverlay = document.getElementById('certPreviewOverlay');
    window.openCertPreview = (url, studentName) => {
        setEl('certPreviewTitle', `${studentName || 'Student'}'s Certificate`);
        const img = document.getElementById('certPreviewImage');
        const openLink = document.getElementById('certPreviewOpenLink');
        const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);

        if (openLink) { openLink.href = url; openLink.style.display = 'inline-block'; }

        if (img) {
            if (isImage) {
                img.style.display = 'block';
                img.src = url;
                // If the image URL turns out not to actually load (wrong path,
                // deleted file, etc.), fall back to the "open in new tab" link
                // instead of leaving a blank box in the modal.
                img.onerror = () => { img.style.display = 'none'; };
            } else {
                img.style.display = 'none';
            }
        }
        if (certPreviewOverlay) certPreviewOverlay.classList.add('active');
    };
    document.getElementById('certPreviewCloseBtn')?.addEventListener('click', () => {
        certPreviewOverlay?.classList.remove('active');
    });
    certPreviewOverlay?.addEventListener('click', (e) => {
        if (e.target === certPreviewOverlay) certPreviewOverlay.classList.remove('active');
    });

    // ── Render group member chips with per-member reject/unreject ──
    function renderMemberChips(od) {
        const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const rejected = (od.facultyRejectedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);

        if (members.length === 0) return '';

        const chips = members.map(reg => {
            const isRejected = rejected.some(r => r.toLowerCase() === reg.toLowerCase());
            const known = reg.toLowerCase() === (od.registerNumber || '').toLowerCase()
                ? { name: od.studentName }
                : lookupStudent(reg);
            const label = known?.name ? `${reg} — ${known.name}` : reg;
            return `
                <div class="member-chip-wrap" style="display:inline-block;position:relative;margin:4px 6px 4px 0">
                    <button class="member-chip ${isRejected ? 'rejected' : ''}"
                        onclick="toggleMemberMenu(this, ${od.odId}, '${esc(reg)}')"
                        style="padding:6px 14px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;
                               border:1px solid ${isRejected ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.3)'};
                               background:${isRejected ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.1)'};
                               color:${isRejected ? '#ef4444' : '#a5b4fc'}">
                        ${isRejected ? '✕ ' : ''}${escHtml(label)}
                    </button>
                    <div class="member-menu" style="display:none;position:absolute;bottom:110%;left:0;z-index:10;
                         background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px;
                         box-shadow:0 8px 20px rgba(0,0,0,0.4);white-space:nowrap">
                        ${isRejected
                            ? `<button onclick="unrejectMember(${od.odId}, '${esc(reg)}')" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Undo Reject</button>`
                            : `<button onclick="rejectMember(${od.odId}, '${esc(reg)}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Reject This Member</button>`
                        }
                    </div>
                </div>`;
        }).join('');

        return `<div style="margin-top:10px"><strong style="font-size:12px;color:#94a3b8">Group Members:</strong><div style="margin-top:6px">${chips}</div></div>`;
    }

    // ── Nav filters (Pending / Accepted / Rejected / Certificates) ──
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const f = btn.dataset.filter;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clearSearch');
            if (clearBtn) clearBtn.style.display = 'none';
            applyFilter(f);
        });
    });

    // ── Search (works for OD requests and for certificates) ──
    const searchInput = document.getElementById('searchInput');
    const clearBtn    = document.getElementById('clearSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (clearBtn) clearBtn.style.display = searchInput.value ? 'block' : 'none';
            applyFilter(currentFilter);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            clearBtn.style.display = 'none';
            applyFilter(currentFilter);
        });
    }

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        if (currentFilter === 'certificates') loadCertificates();
        else loadODs();
    });

    // ── Auto-refresh so HOD/email-approved changes reflect without manual refresh ──
    setInterval(() => {
        loadODs();
        if (certsLoaded) loadCertificates();
    }, 15000);

    window.approveOD = async (odId, name) => { if (confirm(`Approve OD for ${name}?`)) await updateStatus(odId, 'Approved'); };
    window.rejectOD  = async (odId, name) => { if (confirm(`Reject OD for ${name}?`))  await updateStatus(odId, 'Rejected'); };

    // ── Verify certificate — once verified, that specific member can no longer
    // replace THEIR certificate. Tied to registerNumber so verifying one group
    // member's certificate never locks or affects another member's.
    window.verifyCertificate = async (odId, registerNumber, studentName) => {
        if (!confirm(`Mark ${studentName}'s certificate as verified?\n\nOnce verified, this student will no longer be able to replace this certificate.`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/VerifyCertificate?registerNumber=${encodeURIComponent(registerNumber)}`, { method: 'PUT' });
            if (res.ok) {
                showToast('success', 'Certificate marked as verified');
                loadCertificates();
            } else {
                showToast('error', 'Failed to verify certificate');
            }
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    async function updateStatus(odId, status) {
        try {
            const res = await fetch(`${API_BASE}/api/Faculty/Approve/${odId}?status=${status}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                showToast('success', `OD ${status.toLowerCase()}!`);
                // Surface HOD email failures instead of hiding them — the OD
                // status itself still updated fine, but the HOD was never
                // notified, so staff should know to follow up manually.
                if (data && data.emailStatus === 'failed') {
                    showToast('error', `Warning: HOD was not emailed — ${data.emailDetail || 'unknown error'}`);
                }
                loadODs();
            }
            else showToast('error', 'Failed to update');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    }

    // ── Group member menu toggle ──
    window.toggleMemberMenu = (btn, odId, reg) => {
        document.querySelectorAll('.member-menu').forEach(m => {
            if (m !== btn.nextElementSibling) m.style.display = 'none';
        });
        const menu = btn.nextElementSibling;
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };

    window.rejectMember = async (odId, reg) => {
        if (!confirm(`Reject register number ${reg} from this group OD?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/RejectMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} rejected`); loadODs(); }
            else showToast('error', 'Failed to reject member');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    window.unrejectMember = async (odId, reg) => {
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/UnrejectMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} rejection undone`); loadODs(); }
            else showToast('error', 'Failed to undo rejection');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    // Close member menus when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.member-chip-wrap')) {
            document.querySelectorAll('.member-menu').forEach(m => m.style.display = 'none');
        }
    });

    function bdg(s) { return s === 'Approved' ? 'approved' : s === 'Rejected' ? 'rejected' : 'pending'; }
    function fmtDate(d) { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB'); } catch { return d; } }
    function fmtDT(d)   { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); } catch { return d; } }

    // ── Human-readable "how many days until/since this OD" label ──
    // Shown at the top of every OD card so staff can immediately see which
    // requests are urgent (starting soon) without opening each one.
    function odDateCountdownLabel(fromDateRaw, toDateRaw) {
        const from = fromDateRaw ? new Date(fromDateRaw) : null;
        const to   = toDateRaw   ? new Date(toDateRaw)   : null;
        if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) return { text: '', cls: '' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        from.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);

        const msPerDay = 24 * 60 * 60 * 1000;

        if (today < from) {
            const daysUntilStart = Math.round((from - today) / msPerDay);
            const text = daysUntilStart === 1 ? 'Starts tomorrow' : `Starts in ${daysUntilStart} days`;
            // Urgency coloring: red if starting today/tomorrow, amber if within a week, else neutral.
            const cls = daysUntilStart <= 1 ? 'od-countdown-urgent' : daysUntilStart <= 7 ? 'od-countdown-soon' : 'od-countdown-normal';
            return { text, cls };
        }
        if (today >= from && today <= to) {
            return { text: 'Ongoing', cls: 'od-countdown-ongoing' };
        }
        const daysSinceEnd = Math.round((today - to) / msPerDay);
        const text = daysSinceEnd === 1 ? 'Completed yesterday' : `Completed ${daysSinceEnd} days ago`;
        return { text, cls: 'od-countdown-done' };
    }

    function esc(s) { return (s||'').replace(/'/g, "\\'"); }
    function escHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
    function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
    function showToast(type, msg) {
        const c = document.getElementById('toastContainer'); if (!c) return;
        const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
        c.appendChild(t); setTimeout(() => t.remove(), 3500);
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.clear(); window.location.href = 'index.html'; });

    loadODs();
    // Load the certificates badge count in the background too, so it's ready before the tab is clicked
    loadCertificates();
    loadStudentLookup();
});