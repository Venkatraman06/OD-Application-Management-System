/* authGuard.js
   Guards each page. Call requireStudent() / requireFaculty() / requireHod()
   at the top of the respective page's <head> after this script loads.

   NOTE: If your backend uses a self-signed certificate on https://localhost:7113,
   visit https://localhost:7113 directly in your browser once and accept the cert —
   otherwise all fetch() calls will fail silently and login will not work.
*/

function requireStudent() {
    if (!localStorage.getItem('studentId') ||
        !localStorage.getItem('studentName') ||
        !localStorage.getItem('registerNumber')) {
        window.location.href = 'login.html';
    }
}

function requireFaculty() {
    if (!localStorage.getItem('facultyId') ||
        !localStorage.getItem('facultyName') ||
        !localStorage.getItem('facultyDepartment')) {
        window.location.href = 'login.html';
    }
}

function requireHod() {
    if (!localStorage.getItem('hodId') ||
        !localStorage.getItem('hodName') ||
        !localStorage.getItem('hodDepartment')) {
        window.location.href = 'login.html';
    }
}
