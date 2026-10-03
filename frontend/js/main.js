// Shared utilities across all pages
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---- TOAST ----
export function toast(message, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---- HEADER AUTH STATE ----
onAuthStateChanged(auth, async (user) => {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const profile = snap.exists() ? snap.data() : {};
    const dash = profile.role === 'ADMIN' ? '/admin-dashboard.html' : '/vle-dashboard.html';
    authArea.innerHTML = `
      <a href="${dash}" class="btn btn-primary btn-sm">Dashboard</a>
      <button class="btn btn-outline btn-sm" id="logout-btn">Logout</button>
    `;
    document.getElementById('logout-btn').onclick = async () => {
      await signOut(auth);
      toast('Logged out', 'success');
      setTimeout(() => window.location.href = '/index.html', 500);
    };
  } else {
    authArea.innerHTML = `
      <a href="/login.html">Login</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
    `;
  }
});

// ---- MOBILE MENU ----
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.mobile-nav');
  if (toggle && nav) {
    toggle.onclick = () => nav.classList.toggle('open');
  }
});

// ---- PROTECT ROUTES ----
export function requireAuth(callback, requiredRole = null) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    const snap = await getDoc(doc(db, 'users', user.uid));
    const profile = snap.exists() ? snap.data() : { role: 'VLE' };
    if (requiredRole && profile.role !== requiredRole) {
      toast('Unauthorized access', 'error');
      window.location.href = '/';
      return;
    }
    callback(user, profile);
  });
}
