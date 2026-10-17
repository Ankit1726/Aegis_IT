const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const question = document.getElementById("question");
const trace = document.getElementById("trace");
const sourceUsed = document.getElementById("sourceUsed");
const sidebar = document.getElementById("sidebar");
const tracePanel = document.getElementById("tracePanel");
const scrim = document.getElementById("scrim");

function escapeHtml(s = "") {
  return s.replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}
function formatInline(s = "") {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function formatText(s = "") {
  const blocks = [];
  let listType = "";
  let listItems = [];

  function flushList() {
    if (listItems.length) {
      blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
      listItems = [];
      listType = "";
    }
  }

  for (const line of s.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(`<li>${formatInline((unordered || ordered)[1])}</li>`);
    } else {
      flushList();
      if (!line.trim()) continue;
      if (heading) {
        const level = line.match(/^#+/)[0].length;
        blocks.push(`<h${level}>${formatInline(heading[1])}</h${level}>`);
      } else if (/^\s*[-*_]{3,}\s*$/.test(line)) {
        blocks.push("<hr>");
      } else {
        blocks.push(`<p>${formatInline(line)}</p>`);
      }
    }
  }

  flushList();
  return blocks.join("");
}
function scrollDown() {
  chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
}

function addMessage(role, text, source = "", citations = []) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  const citeHtml = citations.length
    ? `<div class="citations"><strong>Sources</strong><br>${citations.map((c) => (c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a>` : escapeHtml(c.title))).join("<br>")}</div>`
    : "";
  wrap.innerHTML = `<div class="avatar">AI</div><div class="bubble">${formatText(text)}${source ? `<div class="answer-source">Source: ${escapeHtml(source)}</div>` : ""}${citeHtml}</div>`;
  chat.appendChild(wrap);
  scrollDown();
}
function showTyping() {
  const w = document.createElement("div");
  w.className = "message assistant";
  w.id = "typing";
  w.innerHTML =
    '<div class="avatar">AI</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  chat.appendChild(w);
  scrollDown();
}
function hideTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}
function renderTrace(items = []) {
  trace.innerHTML = items.length
    ? items
        .map((x) => `<div class="trace-item">${escapeHtml(x)}</div>`)
        .join("")
    : '<div class="empty">No trace.</div>';
}

async function askAgent(q) {
  addMessage("user", q);
  question.value = "";
  renderTrace(["Running LangGraph workflow..."]);
  sourceUsed.textContent = "Running";
  const btn = form.querySelector("button");
  btn.disabled = true;
  showTyping();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    hideTyping();
    addMessage(
      "assistant",
      data.answer,
      data.source_used,
      data.citations || [],
    );
    renderTrace(data.trace || []);
    sourceUsed.textContent = data.source_used;
  } catch (e) {
    hideTyping();
    addMessage("assistant", `Error: ${e.message}`);
    renderTrace(["Request failed"]);
    sourceUsed.textContent = "Error";
  } finally {
    btn.disabled = false;
    question.focus();
  }
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = question.value.trim();
  if (q) askAgent(q);
});
question.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
document
  .querySelectorAll(".example")
  .forEach((b) =>
    b.addEventListener("click", () => askAgent(b.textContent.trim())),
  );

/* mobile / tablet drawers */
function closeDrawers() {
  sidebar.classList.remove("open");
  tracePanel.classList.remove("open");
  scrim.classList.remove("show");
}
function openDrawer(el) {
  closeDrawers();
  el.classList.add("open");
  scrim.classList.add("show");
}
document.getElementById("openMenu").onclick = () => openDrawer(sidebar);
document.getElementById("openTrace").onclick = () => openDrawer(tracePanel);
scrim.onclick = closeDrawers;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDrawers();
    modal.classList.add("hidden");
  }
});

/* upload modal */
const modal = document.getElementById("uploadModal");
document.getElementById("openUpload").onclick = () => {
  closeDrawers();
  modal.classList.remove("hidden");
};
document.getElementById("closeUpload").onclick = () =>
  modal.classList.add("hidden");
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});
document.getElementById("uploadBtn").onclick = async () => {
  const file = document.getElementById("fileInput").files[0];
  const key = document.getElementById("adminKey").value;
  const status = document.getElementById("uploadStatus");
  if (!file) {
    status.textContent = "Choose a file first.";
    return;
  }
  status.textContent = "Indexing document...";
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch("/api/ingest", {
      method: "POST",
      headers: { "X-Admin-Key": key },
      body: fd,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Upload failed");
    status.textContent = `Indexed ${d.file}: ${d.chunks} chunks.`;
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
};
