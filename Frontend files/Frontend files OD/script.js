const API_BASE = 'http://localhost:5088';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const rollNumberInput = document.getElementById('rollNumber');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const loginButton = document.getElementById('loginButton');

    togglePasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
        const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
    });

    rollNumberInput.addEventListener('input', () => clearError('rollno'));
    passwordInput.addEventListener('input', () => clearError('password'));

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError('rollno');
        clearError('password');

        const rollNumber = rollNumberInput.value.trim();
        const password = passwordInput.value.trim();

        if (!rollNumber) {
            showError('rollno', 'Register number required');
            return;
        }
        if (!password) {
            showError('password', 'Password required');
            return;
        }

        setLoading(true);
        await loginChain(rollNumber, password);
    });

    async function loginChain(username, password) {
        const studentResult = await tryLogin(`${API_BASE}/api/Student/login`, {
            registerNumber: username,
            password: password
        });

        if (studentResult.success) {
            localStorage.setItem('userType', 'student');
            localStorage.setItem('studentId', studentResult.data.studentId);
            localStorage.setItem('userName', studentResult.data.name);
            localStorage.setItem('userDept', studentResult.data.department);
            localStorage.setItem('registerNumber', studentResult.data.registerNumber);
            showToast('success', 'Student login successful!');
            setTimeout(() => window.location.href = 'student.html', 1200);
            return;
        }

        const facultyResult = await tryLogin(`${API_BASE}/api/Faculty/Login`, {
            name: username,
            password: password
        });

        if (facultyResult.success) {
            localStorage.setItem('userType', 'faculty');
            localStorage.setItem('facultyId', facultyResult.data.facultyId);
            localStorage.setItem('userName', facultyResult.data.name);
            localStorage.setItem('userDept', facultyResult.data.department);
            showToast('success', 'Faculty login successful!');
            setTimeout(() => window.location.href = 'teacher.html', 1200);
            return;
        }

        const hodResult = await tryLogin(`${API_BASE}/api/Hod/Login`, {
            name: username,
            password: password
        });

        if (hodResult.success) {
            localStorage.setItem('userType', 'hod');
            localStorage.setItem('hodId', hodResult.data.hodId);
            localStorage.setItem('userName', hodResult.data.name);
            localStorage.setItem('userDept', hodResult.data.department);
            showToast('success', 'HOD login successful!');
            setTimeout(() => window.location.href = 'hod.html', 1200);
            return;
        }

        showToast('error', 'Invalid credentials');
        setLoading(false);
    }

    async function tryLogin(url, body) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            }
            return { success: false, data: null };
        } catch (err) {
            console.error('Login error:', err);
            return { success: false, data: null };
        }
    }

    function showError(field, message) {
        const group = document.getElementById(`${field}-group`);
        const err = document.getElementById(`${field}-error`);
        if (group) group.classList.add('error');
        if (err) err.textContent = message;
    }

    function clearError(field) {
        const group = document.getElementById(`${field}-group`);
        const err = document.getElementById(`${field}-error`);
        if (group) group.classList.remove('error');
        if (err) err.textContent = '';
    }

    function setLoading(on) {
        const btnText = loginButton.querySelector('.btn-text');
        const btnLoader = loginButton.querySelector('.btn-loader');
        if (btnText) btnText.style.display = on ? 'none' : 'block';
        if (btnLoader) btnLoader.style.display = on ? 'block' : 'none';
        loginButton.disabled = on;
    }

    function showToast(type, message) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        };
        toast.innerHTML = `${icons[type] || icons.error}
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
        container.appendChild(toast);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        setTimeout(() => toast.remove(), 4000);
    }
});
