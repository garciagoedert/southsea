import { findUser } from './auth.js';

// This script handles the login functionality.

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    const foundUser = await findUser(email, password);

    if (foundUser) {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('currentUser', JSON.stringify(foundUser));
        sessionStorage.setItem('userName', foundUser.name);
        sessionStorage.setItem('userRole', foundUser.role);
        // generalLog might not be available or might need to be adapted for async
        // generalLog.add(foundUser.name, 'Login', 'User logged in successfully');
        errorEl.classList.add('hidden');
        if (foundUser.role === 'producao') {
            window.location.href = 'producao.html';
        } else {
            window.location.href = 'index.html';
        }
    } else {
        errorEl.textContent = 'Email ou senha inválidos.';
        errorEl.classList.remove('hidden');
    }
}

// --- UI LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});
