"use strict";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

// Build DOM safely: text always goes in as text, never as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") el.style.cssText = value; // CSSOM, allowed by the page's security policy
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const isStaticHost =
  window.location.hostname.endsWith("github.io") ||
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" && window.location.port !== "8000" && !window.location.port.startsWith("8");

let customBackend = localStorage.getItem("insta2yt_backend") || "";
let isDemo = isStaticHost && !customBackend;

function getApiBase() {
  if (customBackend) return customBackend.replace(/\/+$/, "");
  return "";
}

// Sample mock data for GitHub Web live preview mode
let demoChannels = [
  {
    channel_id: "demo-main",
    title: "Daily Shorts Official",
    custom_url: "@dailyshortsofficial",
    thumbnail_url: "",
    is_active: 1,
  },
  {
    channel_id: "demo-backup",
    title: "Clips & Reels Hub",
    custom_url: "@reelsandclips",
    thumbnail_url: "",
    is_active: 0,
  },
];

let demoVideos = [
  {
    id: 1,
    shortcode: "DA_hydrapress",
    source_url: "https://www.instagram.com/reel/DA_hydrapress/",
    status: "uploaded",
    privacy: "public",
    auto_upload: true,
    channel_id: "demo-main",
    channel_title: "Daily Shorts Official",
    title: "Satisfying Hydraulic Press Crush #Shorts",
    description: "Crushing various objects with a hydraulic press.\n\nOriginal: https://www.instagram.com/reel/DA_hydrapress/\n#shorts #satisfying",
    tags: ["shorts", "satisfying", "viral"],
    youtube_id: "dQw4w9WgXcQ",
    youtube_url: "https://youtu.be/dQw4w9WgXcQ",
    progress: 100,
    note: null,
    duplicate_of: null,
    duplicate_hits: 0,
    has_file: false,
    has_thumb: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    uploaded_at: new Date(Date.now() - 3000000).toISOString(),
  },
  {
    id: 2,
    shortcode: "DB_kineticsand",
    source_url: "https://www.instagram.com/reel/DB_kineticsand/",
    status: "review",
    privacy: "unlisted",
    auto_upload: false,
    channel_id: "demo-main",
    channel_title: "Daily Shorts Official",
    title: "Kinetic Sand ASMR Slicing & Crushing",
    description: "Crispy slicing of kinetic sand blocks.\n\nOriginal: https://www.instagram.com/reel/DB_kineticsand/\n#shorts #relaxing",
    tags: ["shorts", "relaxing", "sand"],
    youtube_id: null,
    youtube_url: null,
    progress: 0,
    note: "Auto-upload was turned off. Ready for your review.",
    duplicate_of: null,
    duplicate_hits: 0,
    has_file: true,
    has_thumb: false,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    uploaded_at: null,
  },
];

function updateWebBanner() {
  const banner = $("web-mode-banner");
  if (!banner) return;
  if (!isStaticHost) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const textEl = $("web-banner-text");
  if (customBackend) {
    textEl.innerHTML = `<strong>Runner Connected:</strong> Talking to live backend at <code>${customBackend}</code>`;
  } else {
    textEl.innerHTML = `<strong>GitHub Web Preview:</strong> Interactive demo mode active. Connect your local runner (<code>start.bat</code>) anytime.`;
  }
}

function simulatePipeline(video) {
  setTimeout(() => {
    video.status = "downloading";
    video.progress = 25;
    renderList();
    renderStats(getDemoCounts());
  }, 1200);

  setTimeout(() => {
    video.status = "analyzing";
    video.progress = 50;
    video.title = `Trending Reel (${video.shortcode}) #Shorts`;
    renderList();
    renderStats(getDemoCounts());
  }, 2800);

  setTimeout(() => {
    if (!video.auto_upload) {
      video.status = "review";
      video.progress = 0;
      video.note = "Auto-upload turned off. Ready for your review.";
      renderList();
      renderStats(getDemoCounts());
      showNotice("Video downloaded & processed! Ready for your review.");
    } else {
      video.status = "uploading";
      video.progress = 75;
      renderList();
      renderStats(getDemoCounts());

      setTimeout(() => {
        video.status = "uploaded";
        video.progress = 100;
        video.youtube_id = "yt_" + video.shortcode;
        video.youtube_url = "https://youtu.be/yt_" + video.shortcode;
        video.uploaded_at = new Date().toISOString();
        video.has_file = false;
        renderList();
        renderStats(getDemoCounts());
        showNotice("Video successfully uploaded to YouTube! Temporary file deleted immediately.");
      }, 2000);
    }
  }, 4400);
}

function getDemoCounts() {
  return {
    total: demoVideos.length,
    uploaded: demoVideos.filter((v) => v.status === "uploaded").length,
    review: demoVideos.filter((v) => v.status === "review").length,
    in_progress: demoVideos.filter((v) => IN_PROGRESS.includes(v.status)).length,
    failed: demoVideos.filter((v) => v.status === "failed").length,
  };
}

async function handleDemoApi(method, url, body) {
  if (url === "/api/status") {
    const activeChan = demoChannels.find((c) => c.is_active) || demoChannels[0];
    return {
      ai: { provider: "free", ready: true, model: "rules", message: "Free mode active" },
      youtube: {
        configured: true,
        channel_id: activeChan.channel_id,
        channel_title: activeChan.title,
        channels: demoChannels,
      },
      counts: getDemoCounts(),
    };
  }
  if (url === "/api/channels") {
    return demoChannels;
  }
  if (url.startsWith("/api/channels/") && url.endsWith("/select")) {
    const parts = url.split("/");
    const chId = parts[3];
    for (const c of demoChannels) {
      c.is_active = c.channel_id === chId ? 1 : 0;
    }
    return { ok: true, channel_id: chId };
  }
  if (url.startsWith("/api/channels/") && method === "DELETE") {
    const parts = url.split("/");
    const chId = parts[3];
    demoChannels = demoChannels.filter((c) => c.channel_id !== chId);
    return { ok: true };
  }
  if (url === "/api/videos") {
    return demoVideos;
  }
  if (url === "/api/add" && method === "POST") {
    const lines = (body.links || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const added = [];
    const activeChan = demoChannels.find((c) => c.is_active) || demoChannels[0];
    for (const line of lines) {
      const match = line.match(/(?:reel|p)\/([A-Za-z0-9_-]+)/);
      const shortcode = match ? match[1] : "reel_" + Math.random().toString(36).slice(2, 8);
      const existing = demoVideos.find((v) => v.shortcode === shortcode);
      if (existing) {
        added.push({ link: line, status: "duplicate", message: "Already checked in this demo session." });
        continue;
      }
      const newVid = {
        id: demoVideos.length + 1,
        shortcode,
        source_url: line,
        status: "queued",
        privacy: body.privacy || "private",
        auto_upload: body.auto_upload !== false,
        channel_id: body.channel_id || activeChan.channel_id,
        channel_title: activeChan.title,
        title: `Instagram Video ${shortcode}`,
        description: `Uploaded from: ${line}\n\n#shorts`,
        tags: ["shorts"],
        youtube_id: null,
        youtube_url: null,
        progress: 0,
        note: null,
        duplicate_of: null,
        duplicate_hits: 0,
        has_file: false,
        has_thumb: false,
        created_at: new Date().toISOString(),
        uploaded_at: null,
      };
      demoVideos.unshift(newVid);
      added.push({ link: line, status: "queued", video_id: newVid.id });
      simulatePipeline(newVid);
    }
    return { added, total_submitted: lines.length };
  }
  if (url.startsWith("/api/videos/") && url.endsWith("/edit") && method === "POST") {
    const id = parseInt(url.split("/")[3], 10);
    const v = demoVideos.find((x) => x.id === id);
    if (v) {
      if (body.title) v.title = body.title;
      if (body.description) v.description = body.description;
      if (body.tags) v.tags = body.tags;
      if (body.privacy) v.privacy = body.privacy;
      if (body.channel_id) {
        v.channel_id = body.channel_id;
        const ch = demoChannels.find((c) => c.channel_id === body.channel_id);
        if (ch) v.channel_title = ch.title;
      }
    }
    return { ok: true };
  }
  if (url.startsWith("/api/videos/") && url.endsWith("/upload") && method === "POST") {
    const id = parseInt(url.split("/")[3], 10);
    const v = demoVideos.find((x) => x.id === id);
    if (v) {
      v.status = "uploading";
      v.progress = 60;
      setTimeout(() => {
        v.status = "uploaded";
        v.progress = 100;
        v.youtube_id = "yt_" + v.shortcode;
        v.youtube_url = "https://youtu.be/yt_" + v.shortcode;
        v.uploaded_at = new Date().toISOString();
        v.has_file = false;
        renderList();
        renderStats(getDemoCounts());
        showNotice("Uploaded to YouTube!");
      }, 1500);
    }
    return { ok: true };
  }
  if (url.startsWith("/api/videos/") && url.endsWith("/retry") && method === "POST") {
    const id = parseInt(url.split("/")[3], 10);
    const v = demoVideos.find((x) => x.id === id);
    if (v) {
      v.status = "queued";
      simulatePipeline(v);
    }
    return { ok: true };
  }
  if (url === "/api/logout") {
    return { ok: true };
  }
  if (url === "/api/client-secret") {
    return { ok: true };
  }
  return {};
}

async function api(method, url, body) {
  if (isDemo) {
    return handleDemoApi(method, url, body);
  }
  const fullUrl = getApiBase() + url;
  try {
    const res = await fetch(fullUrl, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      if (!isStaticHost) {
        window.location.href = "login";
      }
      throw new Error("Please log in.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong.");
    return data;
  } catch (err) {
    if (isStaticHost && !customBackend) {
      isDemo = true;
      updateWebBanner();
      return handleDemoApi(method, url, body);
    }
    throw err;
  }
}

function showNotice(text, bad = false) {
  const n = $("notice");
  n.textContent = text;
  n.className = bad ? "notice bad" : "notice";
  n.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => (n.hidden = true), 8000);
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const fmtSecs = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

/* ---------- status labels ---------- */
const STATUS = {
  queued: ["Waiting", "info"],
  downloading: ["Downloading…", "info"],
  analyzing: ["AI checking…", "info"],
  review: ["Needs your review", "warn"],
  upload_queued: ["Waiting to upload", "info"],
  uploading: ["Uploading", "info"],
  uploaded: ["On YouTube", "ok"],
  failed: ["Failed", "bad"],
  duplicate: ["Duplicate – skipped", ""],
  interrupted: ["Interrupted", "bad"],
};
const IN_PROGRESS = ["queued", "downloading", "analyzing", "upload_queued", "uploading"];
const FILTERS = {
  all: () => true,
  uploaded: (v) => v.status === "uploaded",
  review: (v) => v.status === "review",
  progress: (v) => IN_PROGRESS.includes(v.status),
  failed: (v) => v.status === "failed" || v.status === "interrupted",
  duplicate: (v) => v.status === "duplicate",
};

/* ---------- state ---------- */
let videos = [];
let filter = "all";
let lastRendered = "";
let pollTimer = null;
let reviewing = null;
let connectedChannels = [];
let activeChannelId = null;

function populateChannelSelect(selectEl, channels, selectedId) {
  if (!selectEl) return;
  selectEl.replaceChildren();
  if (!channels || channels.length === 0) {
    selectEl.append(h("option", { value: "" }, "(No channel connected)"));
    return;
  }
  for (const c of channels) {
    const isSel = selectedId ? c.channel_id === selectedId : Boolean(c.is_active);
    const opt = h("option", { value: c.channel_id, selected: isSel }, c.title + (c.is_active ? " (Active)" : ""));
    selectEl.append(opt);
  }
}

function renderChannelDropdown(channels, currentActiveId) {
  const menu = $("channel-dropdown");
  if (!menu) return;
  menu.replaceChildren();

  menu.append(h("div", { class: "channel-menu-head" }, "Connected YouTube Channels"));

  if (!channels || channels.length === 0) {
    menu.append(h("div", { style: "padding: 8px; font-size: 13px; color: var(--muted);" }, "No channels connected yet."));
  } else {
    for (const c of channels) {
      const isActive = c.channel_id === currentActiveId || Boolean(c.is_active);
      const avatar = c.thumbnail_url
        ? h("img", { class: "ch-avatar", src: c.thumbnail_url, alt: "" })
        : h("div", { class: "ch-avatar", style: "display:grid;place-items:center;font-size:11px;" }, "▶");

      const item = h("div", { class: "channel-item" + (isActive ? " active" : "") },
        h("div", { class: "channel-info-block", onclick: () => switchChannel(c.channel_id) },
          avatar,
          h("div", {},
            h("div", { class: "channel-name" }, c.title),
            h("div", { class: "channel-sub" }, isActive ? "Currently selected ✓" : "Click to select")
          )
        ),
        h("div", { style: "display:flex;align-items:center;gap:4px;" },
          isActive ? h("span", { class: "chip ok" }, "Active") : h("button", { class: "btn small ghost", type: "button", onclick: () => switchChannel(c.channel_id) }, "Select"),
          h("button", { class: "btn small ghost danger", type: "button", title: "Disconnect this channel", onclick: () => disconnectChannel(c.channel_id, c.title) }, "✕")
        )
      );
      menu.append(item);
    }
  }

  menu.append(h("div", { class: "channel-menu-divider" }));
  const footer = h("div", { class: "channel-menu-footer" },
    h("a", { href: "/youtube/connect", class: "btn small primary wide", style: "text-align:center;text-decoration:none;" }, "+ Connect another channel")
  );
  menu.append(footer);
}

async function switchChannel(channelId) {
  try {
    await api("POST", `/api/channels/${channelId}/select`);
    const dd = $("channel-dropdown");
    if (dd) dd.hidden = true;
    showNotice("Switched active YouTube channel.");
    await loadStatus();
    await refresh();
  } catch (err) {
    showNotice(err.message, true);
  }
}

async function disconnectChannel(channelId, channelTitle) {
  if (!confirm(`Disconnect channel "${channelTitle}"?`)) return;
  try {
    await api("DELETE", `/api/channels/${channelId}`);
    showNotice(`Disconnected channel "${channelTitle}".`);
    await loadStatus();
    await refresh();
  } catch (err) {
    showNotice(err.message, true);
  }
}

/* ---------- top bar ---------- */
async function loadStatus() {
  const s = await api("GET", "/api/status");

  connectedChannels = s.youtube.channels || [];
  activeChannelId = s.youtube.channel_id;

  const ai = $("ai-status");
  const label = { claude: "AI on", local: s.ai.ready ? "Local AI" : "Local AI: not ready", free: "Free mode" }[s.ai.provider];
  ai.replaceChildren(h("span", { class: "dot" }), label);
  ai.className = s.ai.provider === "free" ? "pill" : s.ai.ready ? "pill ok" : "pill warn";
  ai.title = {
    claude: `Claude (${s.ai.model}) watches still frames of each video and writes the title and description.`,
    local: s.ai.message,
    free: "Free mode: Titles and descriptions are cleanly generated from video caption and hashtags.",
  }[s.ai.provider];

  const setupCard = $("setup-card");
  if (!s.youtube.configured) {
    if (setupCard) setupCard.hidden = false;
    const uriEl = $("redirect-uri-text");
    if (uriEl) uriEl.textContent = s.youtube.redirect_uri;
  } else {
    if (setupCard) setupCard.hidden = true;
  }

  const yt = $("yt-status");
  const dropdown = $("channel-dropdown");
  if (!s.youtube.configured) {
    yt.className = "pill warn";
    yt.replaceChildren(h("span", { class: "dot" }), "YouTube: setup needed");
    yt.title = "Configure your client_secret.json in the setup section below.";
    yt.onclick = () => { if (setupCard) setupCard.scrollIntoView({ behavior: "smooth" }); };
    if (dropdown) dropdown.hidden = true;
  } else if (!s.youtube.connected) {
    yt.className = "pill warn";
    yt.replaceChildren(h("span", { class: "dot" }), h("a", { href: "/youtube/connect" }, "Connect YouTube"));
    yt.title = "Sign in with the Google account that owns (or manages) your channel.";
    yt.onclick = null;
    if (dropdown) dropdown.hidden = true;
  } else {
    yt.className = "pill ok";
    const name = s.youtube.channel_title || "YouTube connected";
    yt.replaceChildren(
      h("span", { class: "dot" }),
      s.youtube.channel_thumbnail ? h("img", { class: "ch-avatar", src: s.youtube.channel_thumbnail, alt: "" }) : null,
      h("span", { style: "font-weight:600;" }, name),
      h("span", { style: "font-size:10px;opacity:.8;margin-left:2px;" }, "▾")
    );
    yt.title = "Click to switch or manage channels.";
    yt.onclick = (e) => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    };
    renderChannelDropdown(connectedChannels, activeChannelId);
  }

  const badge = $("current-channel-badge");
  if (badge) {
    badge.textContent = s.youtube.channel_title ? "Target: " + s.youtube.channel_title : "No channel connected";
  }

  populateChannelSelect($("task-channel"), connectedChannels, activeChannelId);

  if (!$("links").dataset.touched) {
    $("privacy").value = s.defaults.privacy;
    $("auto-upload").checked = s.defaults.auto_upload;
  }
}

async function disconnectYouTube() {
  if (!confirm("Disconnect this YouTube channel? Automatic uploads will stop until you connect again.")) return;
  await api("POST", "/api/youtube/disconnect");
  await loadStatus();
}

/* ---------- add links ---------- */
async function addLinks(event) {
  event.preventDefault();
  const results = $("add-results");
  results.replaceChildren();
  if (!$("rights").checked) {
    results.append(h("li", { class: "invalid" }, "Please tick the box to confirm you own these videos or have permission."));
    return;
  }
  const btn = $("add-btn");
  btn.disabled = true;
  const taskChannelEl = $("task-channel");
  const selectedChannelId = taskChannelEl ? taskChannelEl.value : undefined;
  try {
    const data = await api("POST", "/api/videos", {
      links: $("links").value,
      privacy: $("privacy").value,
      auto_upload: $("auto-upload").checked,
      rights_confirmed: true,
      channel_id: selectedChannelId || undefined,
    });
    for (const r of data.results) {
      const icon = { added: "✓", duplicate: "⚠", invalid: "✕" }[r.outcome];
      results.append(
        h("li", { class: r.outcome },
          `${icon} ${r.input} — ${r.message} `,
          r.youtube_url ? h("a", { href: r.youtube_url, target: "_blank", rel: "noopener noreferrer" }, "Open on YouTube") : null),
      );
    }
    if (data.results.some((r) => r.outcome === "added")) $("links").value = "";
    await refresh();
  } catch (err) {
    results.append(h("li", { class: "invalid" }, err.message));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- list ---------- */
function renderStats(s) {
  const tiles = [
    ["Total links", s.total, ""],
    ["On YouTube", s.uploaded, "ok"],
    ["In progress", s.in_progress, "info"],
    ["Needs review", s.review, "warn"],
    ["Failed", s.failed, "bad"],
    ["Duplicates blocked", s.duplicates_blocked, ""],
  ];
  $("stats").replaceChildren(
    ...tiles.map(([label, num, cls]) => h("div", { class: `stat ${cls}` }, h("div", { class: "num" }, num), h("div", { class: "label" }, label))),
  );
}

function aiChips(v) {
  const chips = [];
  if (v.is_asmr === true) chips.push(h("span", { class: "chip ok" }, `ASMR ✓ ${v.asmr_confidence || ""}`.trim()));
  else if (v.is_asmr === false) chips.push(h("span", { class: "chip bad" }, "Not ASMR"));
  for (const t of (v.asmr_triggers || []).slice(0, 4)) chips.push(h("span", { class: "chip accent" }, t));
  return chips;
}

function actionsFor(v) {
  const a = [];
  const editable = ["review", "failed", "interrupted"].includes(v.status) && v.has_file && v.title;
  if (v.youtube_url) a.push(h("a", { class: "btn small yt", href: v.youtube_url, target: "_blank", rel: "noopener noreferrer" }, "▶ YouTube"));
  if (v.status === "review" && editable) a.push(h("button", { class: "btn small primary", type: "button", onclick: () => openReview(v.id) }, "Review & upload"));
  if ((v.status === "failed" || v.status === "interrupted") && editable) a.push(h("button", { class: "btn small", type: "button", onclick: () => openReview(v.id) }, "Edit"));
  if (v.status === "failed" || v.status === "interrupted") a.push(h("button", { class: "btn small primary", type: "button", onclick: () => retry(v) }, "Retry"));
  if (["review", "failed", "interrupted"].includes(v.status)) a.push(h("button", { class: "btn small ghost", type: "button", title: "Already uploaded by hand? Record its YouTube link.", onclick: () => markUploaded(v) }, "Mark done"));
  if (!IN_PROGRESS.includes(v.status) && v.status !== "uploaded") a.push(h("button", { class: "btn small ghost danger", type: "button", onclick: () => removeVideo(v) }, "Delete"));
  return a;
}

function renderItem(v) {
  const [label, cls] = STATUS[v.status] || [v.status, ""];
  const statusText = v.status === "uploading" ? `${label} ${v.progress}%` : label;
  const thumb = v.has_thumb
    ? h("img", { class: "thumb", src: `/api/videos/${v.id}/thumb`, alt: "", loading: "lazy" })
    : h("div", { class: "thumb" }, "▶");
  const title = v.title
    ? h("div", { class: "item-title", title: v.title }, v.title)
    : h("div", { class: "item-title placeholder" },
      { duplicate: "Duplicate – not uploaded", failed: "Could not be processed" }[v.status] ||
      (IN_PROGRESS.includes(v.status) ? "Working on it…" : "No title yet"));

  const meta = h("div", { class: "meta" },
    v.channel_title ? h("span", { class: "channel-badge" }, "📺 " + v.channel_title) : null,
    h("a", { href: v.source_url, target: "_blank", rel: "noopener noreferrer" }, v.ig_uploader ? `@${v.ig_uploader}` : "Instagram link"),
    v.duration ? h("span", {}, fmtSecs(v.duration)) : null,
    h("span", {}, `Added ${fmtDate(v.created_at)}`),
    v.uploaded_at ? h("span", {}, `Uploaded ${fmtDate(v.uploaded_at)}`) : null,
    v.duplicate_hits ? h("span", { title: "Times this link was pasted again and blocked" }, `Blocked repeats: ${v.duplicate_hits}`) : null,
  );
  const note = v.note && v.status !== "uploaded"
    ? h("p", { class: ["failed", "interrupted"].includes(v.status) ? "note bad" : "note" }, v.note)
    : null;

  return h("div", { class: "item" },
    thumb,
    h("div", { class: "item-main" }, title, meta, h("div", { class: "chips" }, aiChips(v)), note),
    h("div", { class: "item-side" },
      h("span", { class: `chip ${cls}` }, statusText),
      v.status === "uploading" ? h("div", { class: "progress" }, h("div", { style: `width:${v.progress}%` })) : null,
      h("div", { class: "item-actions" }, actionsFor(v)),
    ),
  );
}

function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const shown = videos.filter(FILTERS[filter]).filter((v) =>
    !q || [v.title, v.ig_uploader, v.source_url, v.shortcode].some((x) => (x || "").toLowerCase().includes(q)));
  $("list").replaceChildren(...shown.map(renderItem));
  $("empty").hidden = shown.length > 0;
  $("empty").textContent = videos.length ? "Nothing matches this filter." : "No videos yet. Paste an Instagram link above to start.";
}

async function refresh() {
  clearTimeout(pollTimer);
  try {
    const data = await api("GET", "/api/videos");
    const snapshot = JSON.stringify(data);
    if (snapshot !== lastRendered) {
      lastRendered = snapshot;
      videos = data.videos;
      renderStats(data.stats);
      renderList();
    }
  } catch (err) {
    showNotice(err.message, true);
  }
  const busy = videos.some((v) => IN_PROGRESS.includes(v.status));
  pollTimer = setTimeout(refresh, busy ? 3000 : 15000);
}

/* ---------- row actions ---------- */
async function retry(v) {
  if (v.status === "interrupted" &&
      !confirm("The app stopped while this was uploading. Check your YouTube channel first.\n\nIf the video is NOT there, press OK to upload it again.")) return;
  try {
    await api("POST", `/api/videos/${v.id}/retry`);
    await refresh();
  } catch (err) { showNotice(err.message, true); }
}

async function markUploaded(v) {
  const link = prompt("Paste the YouTube link of this video (it will be recorded as uploaded):");
  if (!link) return;
  try {
    await api("POST", `/api/videos/${v.id}/mark-uploaded`, { youtube_link: link });
    await refresh();
  } catch (err) { showNotice(err.message, true); }
}

async function removeVideo(v) {
  if (!confirm("Delete this record? If you add the same link again later, it will be processed again.")) return;
  try {
    await api("DELETE", `/api/videos/${v.id}`);
    await refresh();
  } catch (err) { showNotice(err.message, true); }
}

/* ---------- review dialog ---------- */
function openReview(id) {
  const v = videos.find((x) => x.id === id);
  if (!v) return;
  reviewing = id;
  $("r-heading").textContent = v.status === "review" ? "Review before upload" : "Edit and upload";
  if (v.has_thumb) $("r-thumb").src = `/api/videos/${v.id}/thumb`;
  $("r-thumb").hidden = !v.has_thumb;
  $("r-source").href = v.source_url;
  const ai = $("r-ai");
  ai.replaceChildren(
    h("div", { class: "chips" }, aiChips(v).length ? aiChips(v) : h("span", { class: "chip" }, "Not checked")),
    v.ai_summary ? h("div", {}, v.ai_summary) : null,
  );
  $("r-note").textContent = v.note || "";
  $("r-note").hidden = !v.note;
  $("r-title").value = v.title || "";
  $("r-desc").value = v.description || "";
  $("r-tags").value = (v.tags || []).join(", ");
  $("r-privacy").value = v.privacy;
  populateChannelSelect($("r-channel"), connectedChannels, v.channel_id || activeChannelId);
  $("r-error").hidden = true;
  updateCount();
  $("review").showModal();
}

function reviewBody() {
  const rChan = $("r-channel");
  return {
    title: $("r-title").value,
    description: $("r-desc").value,
    tags: $("r-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    privacy: $("r-privacy").value,
    channel_id: rChan ? rChan.value : undefined,
  };
}

async function reviewAction(kind) {
  const err = $("r-error");
  err.hidden = true;
  if (!$("r-title").value.trim()) {
    err.textContent = "The title can't be empty.";
    err.hidden = false;
    return;
  }
  const buttons = [$("r-save"), $("r-upload")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    if (kind === "upload") await api("POST", `/api/videos/${reviewing}/upload`, reviewBody());
    else await api("PATCH", `/api/videos/${reviewing}`, reviewBody());
    $("review").close();
    showNotice(kind === "upload" ? "Upload started." : "Saved.");
    await refresh();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

function updateCount() {
  $("r-count").textContent = `${$("r-title").value.length}/100`;
}

/* ---------- start ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("notice")) {
    const text = params.get("notice");
    showNotice(text, /fail|cancel|missing|expired/i.test(text));
    history.replaceState(null, "", "/");
  }

  $("add-form").addEventListener("submit", addLinks);
  $("links").addEventListener("input", () => ($("links").dataset.touched = "1"));
  $("search").addEventListener("input", renderList);
  $("filters").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    for (const b of $("filters").children) b.classList.toggle("active", b === btn);
    renderList();
  });
  $("logout").addEventListener("click", async () => {
    await api("POST", "/api/logout");
    window.location.href = "/login";
  });
  $("review-form").addEventListener("submit", (e) => e.preventDefault());
  $("r-title").addEventListener("input", updateCount);
  $("r-save").addEventListener("click", () => reviewAction("save"));
  $("r-upload").addEventListener("click", () => reviewAction("upload"));
  $("r-close").addEventListener("click", () => $("review").close());
  $("r-cancel").addEventListener("click", () => $("review").close());

  // Setup card events
  const copyBtn = $("copy-uri-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const uri = $("redirect-uri-text").textContent.trim();
      navigator.clipboard.writeText(uri).then(() => showNotice("Redirect URI copied to clipboard!"));
    });
  }
  const browseBtn = $("browse-file-btn");
  const fileInput = $("setup-file");
  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { $("setup-json").value = ev.target.result; };
        reader.readAsText(file);
      }
    });
  }
  const saveSetupBtn = $("save-setup-btn");
  if (saveSetupBtn) {
    saveSetupBtn.addEventListener("click", async () => {
      const errEl = $("setup-error");
      errEl.hidden = true;
      const text = $("setup-json").value.trim();
      if (!text) {
        errEl.textContent = "Please paste or choose a client_secret.json file.";
        errEl.hidden = false;
        return;
      }
      try {
        await api("POST", "/api/client-secret", { content: text });
        showNotice("Google OAuth credentials saved successfully!");
        await loadStatus();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // Backend settings dialog events
  const backendSettingsBtn = $("backend-settings-btn");
  const backendDialog = $("backend-dialog");
  const backendForm = $("backend-form");
  const backendResetBtn = $("backend-reset-btn");
  const backendInput = $("backend-url-input");

  if (backendSettingsBtn && backendDialog) {
    backendSettingsBtn.addEventListener("click", () => {
      if (backendInput) backendInput.value = customBackend;
      backendDialog.showModal();
    });
  }

  if (backendForm && backendDialog) {
    backendForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = backendInput ? backendInput.value.trim() : "";
      if (val) {
        customBackend = val;
        localStorage.setItem("insta2yt_backend", val);
        isDemo = false;
      } else {
        customBackend = "";
        localStorage.removeItem("insta2yt_backend");
        isDemo = isStaticHost;
      }
      backendDialog.close();
      updateWebBanner();
      showNotice(isDemo ? "Using demo mode." : `Connected to runner: ${customBackend}`);
      await loadStatus().catch((err) => showNotice(err.message, true));
      await refresh();
    });
  }

  if (backendResetBtn && backendDialog) {
    backendResetBtn.addEventListener("click", async () => {
      customBackend = "";
      localStorage.removeItem("insta2yt_backend");
      isDemo = isStaticHost;
      if (backendInput) backendInput.value = "";
      backendDialog.close();
      updateWebBanner();
      showNotice("Reset to interactive demo mode.");
      await loadStatus().catch(() => {});
      await refresh();
    });
  }

  updateWebBanner();
  loadStatus().catch((err) => showNotice(err.message, true));
  refresh();
});

