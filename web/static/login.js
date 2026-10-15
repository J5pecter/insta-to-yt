"use strict";

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("login-error");
  error.hidden = true;
  const isStatic = window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";

  if (isStatic) {
    window.location.href = "./";
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("password").value }),
    });
    if (res.ok) {
      window.location.href = "./";
      return;
    }
    const data = await res.json().catch(() => ({}));
    error.textContent = data.detail || "Login failed.";
    error.hidden = false;
  } catch (err) {
    if (isStatic) {
      window.location.href = "./";
    } else {
      error.textContent = err.message || "Login failed.";
      error.hidden = false;
    }
  }
});

