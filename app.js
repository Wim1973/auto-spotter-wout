const DB_NAME = "auto-spotter";
const STORE = "spots";
const AI_ENDPOINT = "https://auto-spotter-ai.wim-dhulster.workers.dev";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSpot(spot) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(spot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllSpots() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.datum.localeCompare(a.datum)));
    req.onerror = () => reject(req.error);
  });
}

async function deleteSpot(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const form = document.getElementById("spot-form");
const photoInput = document.getElementById("photo-input");
const photoImg = document.getElementById("photo-img");
const photoPlaceholder = document.getElementById("photo-placeholder");
const aiAnalyzeBtn = document.getElementById("ai-analyze-btn");
const aiStatus = document.getElementById("ai-status");
let currentPhotoDataUrl = null;
let currentPhotoFile = null;

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  currentPhotoFile = file;
  currentPhotoDataUrl = await fileToDataUrl(file);
  photoImg.src = currentPhotoDataUrl;
  photoImg.hidden = false;
  photoPlaceholder.hidden = true;
  aiAnalyzeBtn.hidden = !AI_ENDPOINT;
  aiStatus.hidden = true;
});

aiAnalyzeBtn.addEventListener("click", async () => {
  if (!currentPhotoFile || !AI_ENDPOINT) return;
  aiAnalyzeBtn.disabled = true;
  aiStatus.hidden = false;
  aiStatus.textContent = "AI analyseert de foto...";
  try {
    const base64 = currentPhotoDataUrl.split(",")[1];
    const res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, media_type: currentPhotoFile.type }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Onbekende fout");

    document.getElementById("merk").value = data.merk || "";
    document.getElementById("model").value = data.model || "";
    document.getElementById("motor").value = data.motor || "";
    document.getElementById("pk").value = (data.pk || "").replace(/\D/g, "");
    document.getElementById("waarde").value = "";
    document.getElementById("zeldzaamheid").value = data.zeldzaamheid || "Zeldzaam";
    document.getElementById("notities").value = [data.waarde_schatting, data.toelichting].filter(Boolean).join(" — ");

    aiStatus.textContent = "Klaar! Controleer en pas aan waar nodig.";
  } catch (err) {
    aiStatus.textContent = "AI-analyse mislukt: " + err.message;
  } finally {
    aiAnalyzeBtn.disabled = false;
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPhotoDataUrl) {
    alert("Voeg eerst een foto toe.");
    return;
  }
  const spot = {
    id: Date.now().toString(),
    datum: new Date().toISOString(),
    foto: currentPhotoDataUrl,
    merk: document.getElementById("merk").value.trim(),
    model: document.getElementById("model").value.trim(),
    motor: document.getElementById("motor").value.trim(),
    pk: document.getElementById("pk").value,
    waarde: document.getElementById("waarde").value,
    locatie: document.getElementById("locatie").value.trim(),
    zeldzaamheid: document.getElementById("zeldzaamheid").value,
    notities: document.getElementById("notities").value.trim(),
  };
  await saveSpot(spot);
  form.reset();
  photoImg.hidden = true;
  photoImg.src = "";
  photoPlaceholder.hidden = false;
  currentPhotoDataUrl = null;
  await renderList();
});

const listEl = document.getElementById("spot-list");
const emptyState = document.getElementById("empty-state");
const countBadge = document.getElementById("count-badge");

function fieldRow(label, value) {
  if (!value) return "";
  return `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function renderList() {
  const spots = await getAllSpots();
  countBadge.textContent = spots.length;
  emptyState.hidden = spots.length > 0;
  listEl.innerHTML = spots.map(s => `
    <div class="spot-card" data-id="${s.id}">
      <img src="${s.foto}" alt="${escapeHtml(s.merk)}">
      <div class="spot-info">
        <div class="spot-merk">${escapeHtml(s.merk || "?")}</div>
        <div class="spot-model">${escapeHtml(s.model || "")}</div>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".spot-card").forEach(card => {
    card.addEventListener("click", () => openDetail(card.dataset.id, spots));
  });
}

const overlay = document.getElementById("detail-overlay");
const detailImg = document.getElementById("detail-img");
const detailFields = document.getElementById("detail-fields");
const closeDetailBtn = document.getElementById("close-detail");
const deleteBtn = document.getElementById("delete-btn");
let currentDetailId = null;

function openDetail(id, spots) {
  const s = spots.find(x => x.id === id);
  if (!s) return;
  currentDetailId = id;
  detailImg.src = s.foto;
  detailFields.innerHTML = [
    fieldRow("Merk", s.merk),
    fieldRow("Model", s.model),
    fieldRow("Motor", s.motor),
    fieldRow("PK", s.pk),
    fieldRow("Waarde", s.waarde ? `€ ${s.waarde}` : ""),
    fieldRow("Waar gezien", s.locatie),
    fieldRow("Zeldzaamheid", s.zeldzaamheid),
    fieldRow("Notities", s.notities),
    fieldRow("Datum", new Date(s.datum).toLocaleString("nl-BE")),
  ].join("");
  overlay.hidden = false;
}

closeDetailBtn.addEventListener("click", () => { overlay.hidden = true; });
deleteBtn.addEventListener("click", async () => {
  if (!currentDetailId) return;
  if (!confirm("Deze spot verwijderen?")) return;
  await deleteSpot(currentDetailId);
  overlay.hidden = true;
  await renderList();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

renderList();
