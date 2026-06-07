let token = sessionStorage.getItem("admin_token") || "";

const loginScreen = document.getElementById("login-screen");
const adminPanel = document.getElementById("admin-panel");
const headerStatus = document.getElementById("header-status");

if (token) boot();

document.getElementById("login-btn").addEventListener("click", () => {
	token = document.getElementById("token-input").value.trim();
	if (!token) return;
	sessionStorage.setItem("admin_token", token);
	boot();
});

document.getElementById("token-input").addEventListener("keydown", (e) => {
	if (e.key === "Enter") document.getElementById("login-btn").click();
});

function boot() {
	loginScreen.style.display = "none";
	adminPanel.style.display = "block";
	headerStatus.textContent = "Logged in";
	loadDocuments();
}

function authHeaders() {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
}

function setStatus(id, type, msg) {
	const el = document.getElementById(id);
	el.className = `status ${type}`;
	el.textContent = msg;
	if (type !== "error") setTimeout(() => (el.className = "status"), 3500);
}

// ── Load documents ────────────────────────────────────────────────────────────

async function loadDocuments() {
	const list = document.getElementById("doc-list");
	list.innerHTML = '<div class="empty">Loading…</div>';

	try {
		const res = await fetch("/api/documents", { headers: authHeaders() });
		if (res.status === 401) {
			sessionStorage.removeItem("admin_token");
			location.reload();
			return;
		}
		const docs = await res.json();
		renderDocuments(docs);
	} catch (err) {
		list.innerHTML = '<div class="empty">Failed to load documents.</div>';
	}
}

function renderDocuments(docs) {
	const list = document.getElementById("doc-list");
	const count = document.getElementById("doc-count");
	count.textContent = `(${docs.length})`;

	if (docs.length === 0) {
		list.innerHTML = '<div class="empty">No documents yet. Add one above or load defaults.</div>';
		return;
	}

	list.innerHTML = "";
	for (const doc of docs) {
		const item = document.createElement("div");
		item.className = "doc-item";
		item.dataset.id = doc.id;
		item.innerHTML = `
			<div class="doc-info">
				<div class="doc-title">${escapeHtml(doc.title)}</div>
				<div class="doc-meta">${escapeHtml(doc.content.slice(0, 80))}…</div>
			</div>
			<span class="badge">${escapeHtml(doc.category)}</span>
			<button class="btn-danger delete-btn" data-id="${escapeHtml(doc.id)}">Delete</button>
		`;
		list.appendChild(item);
	}

	list.querySelectorAll(".delete-btn").forEach((btn) => {
		btn.addEventListener("click", () => deleteDocument(btn.dataset.id, btn));
	});
}

// ── Add document ─────────────────────────────────────────────────────────────

document.getElementById("add-btn").addEventListener("click", async () => {
	const title = document.getElementById("doc-title").value.trim();
	const category = document.getElementById("doc-category").value;
	const content = document.getElementById("doc-content").value.trim();

	if (!title || !content) {
		setStatus("add-status", "error", "Title and content are required.");
		return;
	}

	const btn = document.getElementById("add-btn");
	btn.disabled = true;
	btn.textContent = "Embedding…";
	setStatus("add-status", "info", "Generating embedding and saving…");

	try {
		const res = await fetch("/api/documents", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ title, category, content }),
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "Unknown error");

		setStatus("add-status", "success", `Document added (id: ${data.id})`);
		document.getElementById("doc-title").value = "";
		document.getElementById("doc-content").value = "";
		loadDocuments();
	} catch (err) {
		setStatus("add-status", "error", `Error: ${err.message}`);
	} finally {
		btn.disabled = false;
		btn.textContent = "Add Document";
	}
});

// ── Delete document ───────────────────────────────────────────────────────────

async function deleteDocument(id, btn) {
	if (!confirm("Delete this document?")) return;
	btn.disabled = true;

	try {
		const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		if (!res.ok) throw new Error("Delete failed");
		document.querySelector(`.doc-item[data-id="${id}"]`)?.remove();
		const remaining = document.querySelectorAll(".doc-item").length;
		document.getElementById("doc-count").textContent = `(${remaining})`;
		if (remaining === 0) {
			document.getElementById("doc-list").innerHTML =
				'<div class="empty">No documents yet. Add one above or load defaults.</div>';
		}
		setStatus("list-status", "success", "Document deleted.");
	} catch (err) {
		setStatus("list-status", "error", "Failed to delete document.");
		btn.disabled = false;
	}
}

// ── Seed defaults ─────────────────────────────────────────────────────────────

document.getElementById("seed-btn").addEventListener("click", async () => {
	if (!confirm("This will upsert all default chunks from data.ts into the database. Continue?")) return;

	const btn = document.getElementById("seed-btn");
	btn.disabled = true;
	btn.textContent = "Seeding…";
	setStatus("add-status", "info", "Embedding and saving default chunks…");

	try {
		const res = await fetch("/api/seed", { method: "POST", headers: authHeaders() });
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "Unknown error");
		setStatus("add-status", "success", `Seeded ${data.count} default chunks.`);
		loadDocuments();
	} catch (err) {
		setStatus("add-status", "error", `Seed failed: ${err.message}`);
	} finally {
		btn.disabled = false;
		btn.textContent = "Load Defaults from data.ts";
	}
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
