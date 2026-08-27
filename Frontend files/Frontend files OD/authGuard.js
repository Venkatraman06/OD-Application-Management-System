/* authGuard.js
   Guards each page. Call requireStudent() / requireFaculty() / requireHod()
   at the top of the respective page's <head> after this script loads.

   NOTE: If your backend uses a self-signed certificate on https://localhost:7113,
   visit https://localhost:7113 directly in your browser once and accept the cert —
   otherwise all fetch() calls will fail silently and login will not work.

   NOTE: These keys/redirect target match what script.js (the actual login
   page) stores and where it lives — index.html, not login.html. This file
   isn't currently wired into any dashboard page, but was previously checking
   the wrong keys (facultyName/facultyDepartment instead of the real
   userName/userDept) and redirecting to a login.html that doesn't exist in
   this project, which would have silently broken any page that called it.
*/

function requireStudent() {
    if (!localStorage.getItem('studentId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('registerNumber')) {
        window.location.href = 'index.html';
    }
}

function requireFaculty() {
    if (!localStorage.getItem('facultyId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('userDept')) {
        window.location.href = 'index.html';
    }
}

function requireHod() {
    if (!localStorage.getItem('hodId') ||
        !localStorage.getItem('userName') ||
        !localStorage.getItem('userDept')) {
        window.location.href = 'index.html';
    }
}