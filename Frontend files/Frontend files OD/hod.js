const API_BASE = 'http://localhost:5088';
document.addEventListener('DOMContentLoaded', async () => {
    const hodId = localStorage.getItem('hodId');
    const dept  = localStorage.getItem('userDept');
    if (!hodId || !dept) { window.location.href = 'index.html'; return; }

    const name = localStorage.getItem('userName') || 'HOD';

    // ── Set HOD details ──
    setEl('hodName', name);
    setEl('hodDept', dept);
    setEl('hodID',   'HOD' + hodId);
    const avatar = document.getElementById('hodAvatar');
    if (avatar) { const sp = avatar.querySelector('span'); if (sp) sp.textContent = name.charAt(0).toUpperCase(); }

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
                    section: s.section || s.Section || '',
                    year: s.year || s.Year || ''
                };
            });
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
            title: 'Pending HOD Approval',
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
            emptyTitle: 'No Certificates Here',
            emptyText: 'Once an approved OD\'s dates are finished, it will appear here.',
            icon: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>'
        }
    };

    async function loadODs() {
        try {
            const res = await fetch(`${API_BASE}/api/Hod/ApprovedByFaculty/${encodeURIComponent(dept)}?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { console.error('Load ODs failed:', res.status); return; }
            allODs = await res.json();
            updateCounts(allODs);
            if (currentFilter !== 'certificates') applyFilter(currentFilter);
        } catch (err) { console.error(err); showToast('error', 'Failed to load ODs'); }
    }

    // ── Load certificates (view-only) — HOD-approved ODs whose dates have finished ──
    async function loadCertificates() {
        try {
            // Cache-bust: avoids a stale cached response masking a certificate
            // the student just uploaded.
            const res = await fetch(`${API_BASE}/api/Hod/ApprovedByFaculty/${encodeURIComponent(dept)}?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { console.error('Load certificates failed:', res.status); return; }
            const data = await res.json();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            allCerts = data.filter(o => {
                if (o.hodStatus !== 'Approved') return false;
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
        const pending  = ods.filter(o => o.hodStatus === 'Pending').length;
        const approved = ods.filter(o => o.hodStatus === 'Approved').length;
        const rejected = ods.filter(o => o.hodStatus === 'Rejected').length;

        setEl('statTotal',    ods.length);
        setEl('statPending',  pending);
        setEl('statApproved', approved);
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
     * is true when faculty rejected that member and HOD hasn't overridden it.
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
        const titleEl = document.querySelector('#sectionTitle h2');
        if (titleEl) {
            const svg = titleEl.querySelector('svg');
            titleEl.innerHTML = '';
            if (svg) {
                svg.innerHTML = meta.icon;
                titleEl.appendChild(svg);
            } else {
                const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                newSvg.setAttribute('viewBox', '0 0 24 24');
                newSvg.setAttribute('fill', 'none');
                newSvg.setAttribute('stroke', 'currentColor');
                newSvg.setAttribute('stroke-width', '2');
                newSvg.innerHTML = meta.icon;
                titleEl.appendChild(newSvg);
            }
            const span = document.createElement('span');
            span.textContent = ' ' + meta.title;
            titleEl.appendChild(document.createTextNode(' '));
            titleEl.appendChild(span);
        }
        const emptyTitleEl = document.querySelector('#emptyState h3');
        const emptyTextEl  = document.querySelector('#emptyState p');
        if (emptyTitleEl) emptyTitleEl.textContent = meta.emptyTitle;
        if (emptyTextEl)  emptyTextEl.textContent  = meta.emptyText;
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
                const c = document.getElementById('requestsContainer');
                if (c) c.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading certificates...</div>';
                loadCertificates();
            }
            return;
        }

        if (searchBox) searchBox.style.display = (filter === 'approved' || filter === 'rejected') ? 'block' : 'none';

        let filtered;
        if      (filter === 'pending')  filtered = allODs.filter(o => o.hodStatus === 'Pending');
        else if (filter === 'approved') filtered = allODs.filter(o => o.hodStatus === 'Approved');
        else if (filter === 'rejected') filtered = allODs.filter(o => o.hodStatus === 'Rejected');
        else filtered = allODs;

        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(o => (o.registerNumber||'').toLowerCase().includes(q));
        }

        // Pending requests are sorted by soonest-starting OD first, so the
        // most time-sensitive requests bubble to the top.
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
                        <h3>${od.studentName || ''} ${od.isGroupOd ? `<span class="status-badge" style="font-size:10px;padding:2px 8px;margin-left:6px;background:rgba(14,165,233,0.15);color:#7dd3fc;border:1px solid rgba(14,165,233,0.3)">GROUP: ${od.groupName || ''}</span>` : ''}</h3>
                        <p>${od.registerNumber || ''} &bull; ${od.department || ''} &bull; Year ${od.year || ''}</p>
                    </div>
                    <span class="status-badge approved">Faculty ✓</span>
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
                    ${od.isGroupOd ? renderMemberChipsHod(od) : ''}
                </div>
                <div class="card-actions">
                    <button type="button" class="view-details-btn" data-odid="${od.odId}">View Details</button>
                    ${od.hodStatus === 'Pending'
                        ? (countdown.cls === 'od-countdown-ongoing'
                            ? `<p class="od-ongoing-lock-note">This OD is already ongoing — it can no longer be approved or rejected.</p>`
                            : `<button class="btn-approve" onclick="approveOD(${od.odId},'${esc(od.studentName)}')">✓ Final Approve</button>
                    <button class="btn-reject"  onclick="rejectOD(${od.odId},'${esc(od.studentName)}')">✕ Reject</button>`)
                        : ''}
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

    // ── Render certificate cards (view-only — HOD/staff cannot upload/verify) ──
    // ONE card per OD. Solo ODs show a single certificate row. Group ODs show
    // a summary ("2/4 uploaded") with a "View Member Details" toggle that
    // expands a table listing every member's register number, name, and
    // upload status.
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
            const rows = getMemberCertRows(od);

            if (!od.isGroupOd) {
                // ── Solo OD: same single-member layout as before ──
                const { cert } = rows[0];
                const rawUrl = cert ? (cert.certificatePhotoUrl ?? cert.CertificatePhotoUrl ?? '') : '';
                const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
                const certUrl = resolvedUrl ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
                const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(rawUrl);
                const isVerified = !!(cert && (cert.certificateVerified ?? cert.CertificateVerified));
                const badgeText = !rawUrl ? 'Not Uploaded' : isVerified ? 'Verified ✓' : 'Pending Staff Verification';
                const badgeClass = !rawUrl ? 'cert-badge' : isVerified ? 'cert-badge cert-badge-verified' : 'cert-badge';

                return `
                <div class="request-card cert-card">
                    <div class="card-header">
                        <div class="student-avatar">${(od.studentName||'S').charAt(0).toUpperCase()}</div>
                        <div class="student-info">
                            <h3>${od.studentName || ''}</h3>
                            <p>${od.registerNumber || ''} &bull; ${od.department || ''}</p>
                        </div>
                        <span class="status-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="card-body">
                        <p><strong>Event:</strong> ${od.event || ''}</p>
                        <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                        <p><strong>OD Finished:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)}</p>
                    </div>
                    ${certUrl && isVerified ? `
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
                        <a href="#" onclick="event.preventDefault(); openCertPreview('${certUrl}','${esc(od.studentName)}')" class="cert-view-link">View Full Certificate ↗</a>
                    </div>` : certUrl && !isVerified
                        ? `<p class="cert-none-text">Student uploaded a certificate — awaiting staff verification. It will appear here once staff verifies it.</p>`
                        : `<p class="cert-none-text">OD finished — student has not uploaded a certificate yet.</p>`}
                </div>`;
            }

            // ── Group OD: one summary card + expandable member table ──
            // Rejected members (faculty rejected, not overridden by HOD) are
            // excluded from the counts — they never actually attended the OD.
            const activeRows = rows.filter(r => !r.isRejected);
            const uploadedCount = activeRows.filter(r => r.cert && (r.cert.certificatePhotoUrl ?? r.cert.CertificatePhotoUrl)).length;
            const verifiedCount = activeRows.filter(r => r.cert && (r.cert.certificateVerified ?? r.cert.CertificateVerified)).length;

            const memberRows = rows.map(({ registerNumber, cert, isRejected }) => {
                const rawUrl = cert ? (cert.certificatePhotoUrl ?? cert.CertificatePhotoUrl ?? '') : '';
                const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
                const certUrl = resolvedUrl ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
                const isVerified = !!(cert && (cert.certificateVerified ?? cert.CertificateVerified));
                const known = registerNumber === od.registerNumber
                    ? { name: od.studentName, department: od.department, section: od.section || od.Section || '' }
                    : lookupStudent(registerNumber);
                const displayName = known?.name || '';
                const className = known
                    ? [known.department, known.section ? `Sec ${known.section}` : '', known.year ? `Year ${known.year}` : ''].filter(Boolean).join(' • ')
                    : '';

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

                const statusText = !rawUrl ? 'Not Uploaded' : isVerified ? 'Verified ✓' : 'Awaiting Staff Verification';
                const statusClass = !rawUrl ? 'cert-mrow-status' : isVerified ? 'cert-mrow-status cert-mrow-verified' : 'cert-mrow-status cert-mrow-uploaded';
                // HOD only gets to actually view a member's certificate once
                // staff has verified it — before that, just show the status.
                const actionHtml = rawUrl && isVerified
                    ? `<a href="#" onclick="event.preventDefault(); openCertPreview('${certUrl}','${esc(displayName || registerNumber)}')" class="cert-mrow-view">View</a>`
                    : rawUrl
                        ? `<span class="cert-mrow-none">Not yet verified</span>`
                        : `<span class="cert-mrow-none">—</span>`;

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

    // ── Render group member chips for HOD (view faculty rejections, allow override) ──
    function renderMemberChipsHod(od) {
        const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const rejected = (od.facultyRejectedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const overridden = (od.hodApprovedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);

        if (members.length === 0) return '';

        const chips = members.map(reg => {
            const wasRejected = rejected.some(r => r.toLowerCase() === reg.toLowerCase());
            const isOverridden = overridden.some(r => r.toLowerCase() === reg.toLowerCase());
            const showAsRejected = wasRejected && !isOverridden;
            const known = reg.toLowerCase() === (od.registerNumber || '').toLowerCase()
                ? { name: od.studentName, section: od.section || od.Section || '' }
                : lookupStudent(reg);
            const memberSection = known?.section || '';
            const label = `${reg}${known?.name ? ' — ' + known.name : ''}${memberSection ? ` (Sec ${memberSection})` : ''}`;

            return `
                <div class="member-chip-wrap" style="display:inline-block;position:relative;margin:4px 6px 4px 0">
                    <button class="member-chip" ${showAsRejected ? `onclick="toggleMemberMenuHod(this, ${od.odId}, '${esc(reg)}')"` : ''}
                        style="padding:6px 14px;border-radius:100px;font-size:12px;font-weight:600;
                               cursor:${showAsRejected ? 'pointer' : 'default'};
                               border:1px solid ${showAsRejected ? 'rgba(239,68,68,0.4)' : isOverridden ? 'rgba(16,185,129,0.4)' : 'rgba(14,165,233,0.3)'};
                               background:${showAsRejected ? 'rgba(239,68,68,0.15)' : isOverridden ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.1)'};
                               color:${showAsRejected ? '#ef4444' : isOverridden ? '#10b981' : '#7dd3fc'}">
                        ${showAsRejected ? '✕ ' : isOverridden ? '✓ ' : ''}${escHtml(label)}
                    </button>
                    ${showAsRejected ? `
                    <div class="member-menu" style="display:none;position:absolute;bottom:110%;left:0;z-index:10;
                         background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px;
                         box-shadow:0 8px 20px rgba(0,0,0,0.4);white-space:nowrap">
                        <button onclick="hodOverrideMember(${od.odId}, '${esc(reg)}')" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Approve Anyway</button>
                    </div>` : ''}
                </div>`;
        }).join('');

        return `<div style="margin-top:10px"><strong style="font-size:12px;color:#94a3b8">Group Members:</strong><div style="margin-top:6px">${chips}</div></div>`;
    }

    // ── Nav filters ──
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clearSearch');
            if (clearBtn) clearBtn.style.display = 'none';
            applyFilter(btn.dataset.filter);
        });
    });

    // ── Search ──
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

    window.approveOD = async (odId, name) => {
        if (!confirm(`Grant final HOD approval for ${name}?`)) return;
        await updateStatus(odId, 'Approved');
    };
    window.rejectOD = async (odId, name) => {
        if (!confirm(`Reject OD for ${name}?`)) return;
        await updateStatus(odId, 'Rejected');
    };

    async function updateStatus(odId, status) {
        try {
            const res = await fetch(`${API_BASE}/api/Hod/FinalApprove/${odId}?status=${status}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showToast('success', `OD ${status.toLowerCase()} by HOD!`);
                if (status === 'Approved') {
                    const overlay = document.getElementById('successOverlay');
                    if (overlay) {
                        overlay.style.display = 'flex';
                        document.getElementById('successClose')?.addEventListener('click', () => {
                            overlay.style.display = 'none'; loadODs();
                        }, { once: true });
                    } else loadODs();
                } else loadODs();
            } else showToast('error', 'Failed to update');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    }

    window.toggleMemberMenuHod = (btn, odId, reg) => {
        document.querySelectorAll('.member-menu').forEach(m => {
            if (m !== btn.nextElementSibling) m.style.display = 'none';
        });
        const menu = btn.nextElementSibling;
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };

    window.hodOverrideMember = async (odId, reg) => {
        if (!confirm(`Approve ${reg} despite faculty rejection?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/HodOverrideMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} approved by HOD override`); loadODs(); }
            else showToast('error', 'Failed to override');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.member-chip-wrap')) {
            document.querySelectorAll('.member-menu').forEach(m => m.style.display = 'none');
        }
    });

    // ── Auto-refresh so newly finished ODs / uploaded certs reflect without manual refresh ──
    setInterval(() => {
        loadODs();
        if (certsLoaded) loadCertificates();
    }, 15000);

    function bdg(s) { return s === 'Approved' ? 'approved' : s === 'Rejected' ? 'rejected' : 'pending'; }
    function fmtDate(d) { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB'); } catch { return d; } }
    function fmtDT(d)   { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); } catch { return d; } }

    // ── Human-readable "how many days until/since this OD" label ──
    // Shown at the top of every OD card so HOD can immediately see which
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
    // Load certificate badge count in background so it's ready before the tab is clicked
    loadCertificates();
    loadStudentLookup();
});