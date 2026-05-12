/**
 * Persian Lexical Search — app.js
 *
 * Data pipeline:
 *   1. Load data/lexicon_data.tsv  → lexicon Map<norm_word, row_object>
 *   2. Load data/ou_prefix.tsv + ou_suffix.tsv + ou_meta.json  → OU tables
 *   3. Load data/word_frequencies_public.tsv  → freq Map<norm_word, {pm, zipf}>
 *
 * For each queried word:
 *   - Exact normalised match in lexicon → return full row
 *   - Otherwise: OU computed in-browser, frequency from freq TSV, rest = NA
 */

"use strict";

// =============================================================
// COLUMN METADATA (defines display groups and headers)
// =============================================================
const COL_GROUPS = [
  {
    id: "basic",
    label: "پایه / Basic",
    cols: [
      { key: "WORD",           label: "واژه / Word",         fmt: "str" },
      { key: "Transcription1", label: "آوانگاری / Transcription", fmt: "str" },
      { key: "PerMilFreq",     label: "بسامد (در میلیون) / Freq/M", fmt: 3 },
      { key: "zipf",           label: "زیف / Zipf",           fmt: 3 },
      { key: "Length",         label: "طول / Length",          fmt: 0 },
      { key: "AvePhonLength",  label: "طول آوایی / PhonLen",   fmt: 2 },
      { key: "n_syllables",    label: "هجا / Syllables",       fmt: 2 },
      { key: "_source",        label: "منبع / Source",         fmt: "str" },
    ],
  },
  {
    id: "gpc",
    label: "GPC / PGC",
    cols: [
      { key: "H_GPC_word",           label: "H_GPC_word",           fmt: 4 },
      { key: "H_PGC_word",           label: "H_PGC_word",           fmt: 4 },
      { key: "H_GPC_grapheme_word",  label: "H_GPC_grapheme",       fmt: 4 },
      { key: "H_PGC_grapheme_word",  label: "H_PGC_grapheme",       fmt: 4 },
      { key: "H_GPC_onset_word",     label: "H_GPC_onset",          fmt: 4 },
      { key: "H_PGC_onset_word",     label: "H_PGC_onset",          fmt: 4 },
      { key: "H_GPC_rime_word",      label: "H_GPC_rime",           fmt: 4 },
      { key: "H_PGC_rime_word",      label: "H_PGC_rime",           fmt: 4 },
      { key: "H_GPC_OVC_word",       label: "H_GPC_OVC",            fmt: 4 },
      { key: "H_PGC_OVC_word",       label: "H_PGC_OVC",            fmt: 4 },
    ],
  },
  {
    id: "ou",
    label: "Orthographic Uncertainty (OU)",
    cols: [
      { key: "OUF",    label: "OUF",    fmt: 4 },
      { key: "OUB",    label: "OUB",    fmt: 4 },
      { key: "OU",     label: "OU",     fmt: 4 },
      { key: "MAXOUF", label: "MAXOUF", fmt: 4 },
      { key: "MAXOUB", label: "MAXOUB", fmt: 4 },
      { key: "MINOUF", label: "MINOUF", fmt: 4 },
      { key: "MINOUB", label: "MINOUB", fmt: 4 },
    ],
  },
  {
    id: "pu",
    label: "Phonological Uncertainty (PU)",
    cols: [
      { key: "PUF",    label: "PUF",    fmt: 4 },
      { key: "PUB",    label: "PUB",    fmt: 4 },
      { key: "PU",     label: "PU",     fmt: 4 },
      { key: "MAXPUF", label: "MAXPUF", fmt: 4 },
      { key: "MAXPUB", label: "MAXPUB", fmt: 4 },
      { key: "MINPUF", label: "MINPUF", fmt: 4 },
      { key: "MINPUB", label: "MINPUB", fmt: 4 },
    ],
  },
  {
    id: "mismatch",
    label: "OU–PU Mismatch",
    cols: [
      { key: "OU_PU_Mismatch",    label: "OU−PU",      fmt: 4 },
      { key: "OUF_PUF_Mismatch",  label: "OUF−PUF",    fmt: 4 },
      { key: "OUB_PUB_Mismatch",  label: "OUB−PUB",    fmt: 4 },
    ],
  },
  {
    id: "semantic",
    label: "Semantic Neighbourhood",
    cols: [
      { key: "SN_k25",            label: "SN k=25",          fmt: 4 },
      { key: "SN_k50",            label: "SN k=50",          fmt: 4 },
      { key: "Entropy_beta5",     label: "Entropy β=5",      fmt: 4 },
      { key: "Entropy_beta10",    label: "Entropy β=10",     fmt: 4 },
      { key: "Dispersion_k50",    label: "Dispersion k=50",  fmt: 4 },
      { key: "Hubness_k50",       label: "Hubness k=50",     fmt: 4 },
      { key: "ClusteringCoeff_k25", label: "Clustering k=25", fmt: 4 },
    ],
  },
];

// =============================================================
// STATE
// =============================================================
let lexicon = new Map();   // norm_word → {WORD, WORD_norm, Transcription1, ...}
let freqMap = new Map();   // norm_word → {pm, zipf}
let ouPrefix = {};
let ouSuffix = {};
let ouTotal = 1;
let dataReady = false;
let lastResults = [];      // [{word, row}] — current result set for export

// =============================================================
// PERSIAN NORMALISATION (mirrors build_web_data.py)
// =============================================================
function normalizeWord(text) {
  if (!text) return "";
  return text
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[ ‌]+/g, "");   // remove spaces and ZWNJ
}

// =============================================================
// ENTROPY HELPER (Shannon −p log₂ p contribution)
// =============================================================
function entropyContrib(p) {
  return p <= 0 ? 0 : -p * Math.log2(p);
}

// =============================================================
// IN-BROWSER OU COMPUTATION
// (identical to OrthUncertaintyCalculations.py compute_ou_for_word)
// =============================================================
function computeOU(word) {
  const L = word.length;
  if (L === 0) return null;

  const forward = [];
  const backward = [];

  for (let k = 1; k <= L; k++) {
    const pref = word.slice(0, k);
    const suf  = word.slice(L - k);
    forward.push(entropyContrib((ouPrefix[pref] || 0) / ouTotal));
    backward.push(entropyContrib((ouSuffix[suf]  || 0) / ouTotal));
  }

  const sumF = forward.reduce((a, b) => a + b, 0);
  const sumB = backward.reduce((a, b) => a + b, 0);

  return {
    OUF:    sumF / L,
    OUB:    sumB / L,
    OU:     sumF / L + sumB / L,
    MAXOUF: forward[0],
    MAXOUB: backward[0],
    MINOUF: forward[L - 1],
    MINOUB: backward[L - 1],
  };
}

// =============================================================
// TSV PARSER  (handles quoted fields and embedded newlines)
// =============================================================
function parseTSV(text) {
  const lines = text.split("\n");
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split("\t").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (cells[idx] || "").trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

// =============================================================
// DATA LOADING
// =============================================================
function setLoading(msg) {
  const el = document.getElementById("loadingMsg");
  if (el) el.innerHTML = msg;
}

async function fetchTSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

async function loadAll() {
  try {
    // 1. Lexicon
    setLoading("در حال بارگذاری واژگان…<br>Loading lexicon…");
    const lexText = await fetchTSV("data/lexicon_data.tsv");
    const { rows: lexRows } = parseTSV(lexText);
    for (const row of lexRows) {
      const key = row["WORD_norm"] || normalizeWord(row["WORD"] || "");
      if (key) lexicon.set(key, row);
    }

    // 2. OU tables
    setLoading("در حال بارگذاری جداول OU…<br>Loading OU tables…");
    const [pfxText, sfxText, ouMeta] = await Promise.all([
      fetchTSV("data/ou_prefix.tsv"),
      fetchTSV("data/ou_suffix.tsv"),
      fetchJSON("data/ou_meta.json"),
    ]);
    parseTSV(pfxText).rows.forEach(r => { ouPrefix[r.key] = parseFloat(r.freq) || 0; });
    parseTSV(sfxText).rows.forEach(r => { ouSuffix[r.key] = parseFloat(r.freq) || 0; });
    ouTotal = ouMeta.total_freq || 1;

    // 3. Frequency fallback
    setLoading("در حال بارگذاری بسامد…<br>Loading frequency data…");
    const freqText = await fetchTSV("data/word_frequencies_public.tsv");
    parseTSV(freqText).rows.forEach(r => {
      const key = r["word_norm"] || normalizeWord(r["word"] || "");
      if (key) freqMap.set(key, { pm: r["PerMillion"], zipf: r["Zipf"] });
    });

    dataReady = true;
    document.getElementById("loadingOverlay").style.display = "none";
    setStatus(`آماده — ${lexicon.size.toLocaleString()} واژه در واژگان / Ready — ${lexicon.size.toLocaleString()} words in lexicon`, "ok");

  } catch (err) {
    console.error(err);
    document.getElementById("loadingOverlay").style.display = "none";
    setStatus("خطا در بارگذاری داده‌ها: " + err.message + " — make sure to run build/build_web_data.py first.", "error");
  }
}

// =============================================================
// LOOKUP
// =============================================================
function lookupWord(rawWord) {
  const norm = normalizeWord(rawWord);
  if (!norm) return null;

  // --- Lexicon hit ---
  if (lexicon.has(norm)) {
    const row = { ...lexicon.get(norm), _source: "lexicon" };
    return { norm, row };
  }

  // --- Compute partial metrics for missing words ---
  const ou = computeOU(norm);
  const freq = freqMap.get(norm);

  const row = {
    WORD:      rawWord,
    WORD_norm: norm,
    _source:   "computed (not in lexicon)",
    PerMilFreq: freq ? freq.pm   : "",
    zipf:       freq ? freq.zipf : "",
    Length:    norm.length,
  };

  if (ou) {
    Object.assign(row, {
      OUF:    ou.OUF.toFixed(6),
      OUB:    ou.OUB.toFixed(6),
      OU:     ou.OU.toFixed(6),
      MAXOUF: ou.MAXOUF.toFixed(6),
      MAXOUB: ou.MAXOUB.toFixed(6),
      MINOUF: ou.MINOUF.toFixed(6),
      MINOUB: ou.MINOUB.toFixed(6),
    });
  }

  return { norm, row };
}

// =============================================================
// RESULTS RENDERING
// =============================================================
function activeGroups() {
  return Array.from(document.querySelectorAll(".grp:checked")).map(cb => cb.value);
}

function activeCols() {
  const groups = new Set(activeGroups());
  const cols = [];
  for (const grp of COL_GROUPS) {
    if (groups.has(grp.id)) cols.push(...grp.cols);
  }
  return cols;
}

function formatCell(value, fmt) {
  if (value === undefined || value === null || value === "") return "—";
  if (fmt === "str") return String(value);
  const n = parseFloat(value);
  if (isNaN(n)) return "—";
  if (fmt === 0) return Math.round(n).toString();
  return n.toFixed(fmt);
}

function renderTable(results) {
  const cols = activeCols();
  const thead = document.getElementById("tableHead");
  const tbody = document.getElementById("tableBody");

  // Build header with group spans
  const groups = activeGroups();
  let spanRow = "<tr>";
  let headerRow = "<tr>";

  for (const grp of COL_GROUPS) {
    if (!groups.includes(grp.id)) continue;
    const visible = grp.cols;
    spanRow += `<th colspan="${visible.length}" class="group-header">${grp.label}</th>`;
    for (const col of visible) {
      headerRow += `<th>${col.label}</th>`;
    }
  }

  thead.innerHTML = spanRow + "</tr>" + headerRow + "</tr>";

  // Build body
  tbody.innerHTML = "";
  for (const { row } of results) {
    const tr = document.createElement("tr");
    if (row._source && row._source !== "lexicon") {
      tr.classList.add("row-computed");
    }
    for (const col of cols) {
      const td = document.createElement("td");
      const raw = row[col.key];
      if (col.key === "WORD" || col.key === "Transcription1") {
        td.dir = col.key === "WORD" ? "rtl" : "ltr";
      }
      td.textContent = formatCell(raw, col.fmt);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  document.getElementById("resultCount").textContent =
    `${results.length} واژه / word(s) — ` +
    `${results.filter(r => r.row._source === "lexicon").length} از واژگان / in lexicon, ` +
    `${results.filter(r => r.row._source !== "lexicon").length} محاسبه‌شده / computed`;
}

// =============================================================
// SEARCH
// =============================================================
function doSearch() {
  if (!dataReady) {
    setStatus("داده‌ها هنوز بارگذاری نشده‌اند / Data still loading…", "warn");
    return;
  }

  const raw = document.getElementById("wordInput").value;
  const words = raw
    .split(/[\n،,\t]+/)
    .map(w => w.trim())
    .filter(Boolean);

  if (words.length === 0) {
    setStatus("لطفاً یک یا چند واژه وارد کنید / Please enter at least one word.", "warn");
    return;
  }

  lastResults = words.map(w => ({ word: w, ...lookupWord(w) }))
                      .filter(r => r.norm);

  if (lastResults.length === 0) {
    setStatus("هیچ نتیجه‌ای یافت نشد / No results found.", "warn");
    return;
  }

  renderTable(lastResults);
  document.getElementById("resultsSection").hidden = false;
  document.getElementById("colGroupPanel").hidden  = false;
  setStatus("", "");
}

// =============================================================
// EXPORT
// =============================================================
function exportTSV() {
  if (!lastResults.length) return;
  const cols = activeCols();

  const header = cols.map(c => c.key).join("\t");
  const rows = lastResults.map(({ row }) =>
    cols.map(c => {
      const v = row[c.key];
      return (v === undefined || v === null) ? "" : String(v);
    }).join("\t")
  );

  const tsv = [header, ...rows].join("\n");
  const blob = new Blob(["﻿" + tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "persian_lexical_results.tsv";
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================
// STATUS MESSAGE
// =============================================================
function setStatus(msg, type) {
  const el = document.getElementById("statusMsg");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "status-msg status-" + (type || "info");
  el.textContent = msg;
}

// =============================================================
// FILE INPUT
// =============================================================
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById("wordInput").value = ev.target.result;
    setStatus(`فایل بارگذاری شد: ${file.name}`, "ok");
  };
  reader.readAsText(file, "utf-8");
  e.target.value = "";
});

// =============================================================
// BUTTON WIRING
// =============================================================
document.getElementById("searchBtn").addEventListener("click", doSearch);

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("wordInput").value = "";
  document.getElementById("resultsSection").hidden = true;
  document.getElementById("colGroupPanel").hidden  = true;
  lastResults = [];
  setStatus("", "");
});

document.getElementById("exportBtn").addEventListener("click", exportTSV);

// Re-render table when column groups change
document.querySelectorAll(".grp").forEach(cb => {
  cb.addEventListener("change", () => {
    if (lastResults.length) renderTable(lastResults);
  });
});

// Enter key in textarea submits
document.getElementById("wordInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) doSearch();
});

// =============================================================
// BOOT
// =============================================================
loadAll();
