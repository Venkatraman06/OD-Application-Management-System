/* authGuard.js
   Shared authentication and authorization helper for Student, Staff/Faculty, and HOD dashboards.
*/

function getAuthToken() {
    return localStorage.getItem('userToken') || '';
}

function logoutStudent() {
    const seenEntries = Object.keys(localStorage)
        .filter(k => k.startsWith('od_rejection_') || k.startsWith('od_hod_rejection_') || k.startsWith('odReject') || k.startsWith('odHodReject'))
        .map(k => [k, localStorage.getItem(k)]);
    localStorage.clear();
    seenEntries.forEach(([k, v]) => localStorage.setItem(k, v));
    window.location.href = 'index.html';
}

function logoutFaculty() {
    const seenEntries = Object.keys(localStorage)
        .filter(k => k.startsWith('od_rejection_') || k.startsWith('odReject') || k.startsWith('odHodReject'))
        .map(k => [k, localStorage.getItem(k)]);
    localStorage.clear();
    seenEntries.forEach(([k, v]) => localStorage.setItem(k, v));
    window.location.href = 'index.html';
}

function logoutHod() {
    const seenEntries = Object.keys(localStorage)
        .filter(k => k.startsWith('od_rejection_') || k.startsWith('odReject') || k.startsWith('odHodReject'))
        .map(k => [k, localStorage.getItem(k)]);
    localStorage.clear();
    seenEntries.forEach(([k, v]) => localStorage.setItem(k, v));
    window.location.href = 'index.html';
}

function handleAuth401() {
    if (localStorage.getItem('studentId')) {
        logoutStudent();
    } else if (localStorage.getItem('facultyId')) {
        logoutFaculty();
    } else if (localStorage.getItem('hodId')) {
        logoutHod();
    } else {
        localStorage.removeItem('userToken');
        window.location.href = 'index.html';
    }
}

async function authFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = { ...options.headers };
    if (token) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        console.warn('Session expired or unauthorized (401). Redirecting to login...');
        handleAuth401();
        return response;
    }
    return response;
}

function requireStudent() {
    if (!getAuthToken() ||
        !localStorage.getItem('studentId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('registerNumber')) {
        window.location.href = 'index.html';
    }
}

function requireFaculty() {
    if (!getAuthToken() ||
        !localStorage.getItem('facultyId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('userDept')) {
        window.location.href = 'index.html';
    }
}

function requireHod() {
    if (!getAuthToken() ||
        !localStorage.getItem('hodId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('userDept')) {
        window.location.href = 'index.html';
    }
}

if (typeof window !== 'undefined') {
    window.getAuthToken = getAuthToken;
    window.authFetch = authFetch;
    window.logoutStudent = logoutStudent;
    window.logoutFaculty = logoutFaculty;
    window.logoutHod = logoutHod;
    window.requireStudent = requireStudent;
    window.requireFaculty = requireFaculty;
    window.requireHod = requireHod;
}
