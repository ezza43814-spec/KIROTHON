// ============================================================
// auth.js — MyGPT Login / Signup logic
// ============================================================

// ── Check if already logged in — validate token with server ──
(async function checkAuth() {
  const token = localStorage.getItem("mygpt_token");
  if (!token) return; // No token — stay on auth page, no redirect

  // Validate the token before redirecting
  try {
    const res = await fetch("/api/auth/me", {
      headers: { "Authorization": "Bearer " + token }
    });
    if (res.ok) {
      // Token valid — user is already logged in, go to chat
      window.location.href = "/";
    } else {
      // Token invalid — clear it, stay on auth page
      localStorage.removeItem("mygpt_token");
      localStorage.removeItem("mygpt_user");
    }
  } catch (e) {
    // Network error — clear and stay
    localStorage.removeItem("mygpt_token");
    localStorage.removeItem("mygpt_user");
  }
})();

const API_BASE = "/api/auth";

// ── Tab switching ────────────────────────────────────────────
function showTab(tab) {
  const loginForm  = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const tabLogin   = document.getElementById("tabLogin");
  const tabSignup  = document.getElementById("tabSignup");
  const subtitle   = document.getElementById("authSubtitle");

  if (tab === "login") {
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    subtitle.textContent = "Sign in to your account";
  } else {
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    subtitle.textContent = "Create your account to get started";
  }

  document.getElementById("loginError").textContent = "";
  document.getElementById("signupError").textContent = "";
}


// ── Email/Password Signup ────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  const name     = document.getElementById("signupName").value.trim();
  const email    = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const confirm  = document.getElementById("signupConfirm").value;
  const errorEl  = document.getElementById("signupError");
  errorEl.textContent = "";

  if (!name) { errorEl.textContent = "Please enter your name"; return; }
  if (!email) { errorEl.textContent = "Please enter your email"; return; }
  if (password.length < 6) { errorEl.textContent = "Password must be at least 6 characters"; return; }
  if (password !== confirm) { errorEl.textContent = "Passwords do not match"; return; }

  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || "Signup failed";
      return;
    }

    // Account created — show success and switch to login tab
    errorEl.style.color = "#34d399";
    errorEl.textContent = "✓ Account created! Please sign in.";

    // Switch to login tab and pre-fill email
    setTimeout(() => {
      showTab("login");
      document.getElementById("loginEmail").value = email;
      document.getElementById("loginPassword").focus();
    }, 1000);

  } catch (err) {
    errorEl.textContent = "Connection error. Please try again.";
  }
}


// ── Email/Password Login ─────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl  = document.getElementById("loginError");
  errorEl.textContent = "";

  if (!email) { errorEl.textContent = "Please enter your email"; return; }
  if (!password) { errorEl.textContent = "Please enter your password"; return; }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || "Login failed";
      return;
    }

    // Login successful — save and go to chat
    localStorage.setItem("mygpt_token", data.token);
    localStorage.setItem("mygpt_user", JSON.stringify(data.user));
    window.location.href = "/";

  } catch (err) {
    errorEl.textContent = "Connection error. Please try again.";
  }
}


// ── Social Login (Google / GitHub) ───────────────────────────
function socialLogin(provider) {
  window.location.href = `/api/auth/${provider}?provider=${provider}`;
}
