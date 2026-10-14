"use strict";

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("login-error");
  error.hidden = true;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("password").value }),
  });
  if (res.ok) {
    window.location.href = "/";
    return;
  }
  const data = await res.json().catch(() => ({}));
  error.textContent = data.detail || "Login failed.";
  error.hidden = false;
});
