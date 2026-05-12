/**
 * Persian Lexical Search — app.js
 *
 * Features
 * --------
 * • Lookup words in the pre-built lexicon (62 K words, all metrics)
 * • Column-group toggles with ⓘ info icons (eLeXiCon-style)
 * • In-browser OU computation for out-of-lexicon words (prefix/suffix tables)
 * • In-browser PU computation once the user supplies a transcription
 * • In-browser H_GPC_grapheme / H_PGC_grapheme from mapping entropy tables
 * • Transcription validator — Persian IPA character check
 * • TSV export of the current result set
 */

"use strict";

// =============================================================
// MEASURE DESCRIPTIONS  (shown in ⓘ tooltips)
// =============================================================
const MEASURE_INFO = {
  WORD:           "واژه نوشتاری / Written word form",
  Transcription1: "آوانگاری آوایی (IPA) / Primary phonological transcription (IPA)",
  PerMilFreq:     "بسامد در هر میلیون واژه / Frequency per million words in the corpus",
  zipf:           "مقیاس زیف = log₁₀(بسامد/M) + 3 / Zipf scale: log₁₀(freq/M) + 3",
  Length:         "تعداد حروف واژه (بعد از نرمال‌سازی) / Orthographic length after normalisation",
  AvePhonLength:  "میانگین طول آوایی در تلفظ‌های مختلف / Mean phonological length across pronunciations",
  n_syllables:    "میانگین تعداد هجا در تلفظ‌های مختلف / Mean syllable count across pronunciations",

  WeightedPN:     "تعداد همسایگان آوایی وزن‌دار (بسامد) / Frequency-weighted phonological neighbourhood size",
  AveragedPhonNeighbourFreq: "میانگین بسامد همسایگان آوایی / Mean frequency of phonological neighbours",
  OrthographicNeighbours:     "تعداد همسایگان نوشتاری (فاصله Levenshtein = 1) / Orthographic neighbourhood size (Levenshtein = 1)",
  AveragedOrthographicNeighboursFrequency: "میانگین بسامد همسایگان نوشتاری / Mean frequency of orthographic neighbours",

  H_GPC_word:     "آنتروپی تلفظ داده شده واژه (H_GPC سطح کلمه). هرچه بالاتر، ابهام تلفظی بیشتر. / Shannon entropy of pronunciation given the written word-form. Higher = more pronunciation ambiguity.",
  H_PGC_word:     "آنتروپی هجی داده شده تلفظ (H_PGC سطح کلمه) / Shannon entropy of spelling given the phonological word-form.",
  H_GPC_grapheme_word: "میانگین آنتروپی حرف→واج در سطح تک‌حرف / Mean grapheme-to-phoneme entropy across each grapheme in the word.",
  H_PGC_grapheme_word: "میانگین آنتروپی واج→حرف در سطح تک‌واج / Mean phoneme-to-grapheme entropy across each phoneme in the pronunciation.",
  H_GPC_onset_word:    "آنتروپی GPC برای حرف آغازین هجا (onset) / GPC entropy for the syllable-onset grapheme.",
  H_PGC_onset_word:    "آنتروپی PGC برای واج آغازین هجا (onset) / PGC entropy for the syllable-onset phoneme.",
  H_GPC_rime_word:     "آنتروپی GPC برای حروف قافیه هجا (هسته + کدا) / GPC entropy for the syllable rime graphemes (nucleus + coda).",
  H_PGC_rime_word:     "آنتروپی PGC برای واج‌های قافیه هجا / PGC entropy for the syllable rime phoneme sequence.",
  H_GPC_OVC_word:      "آنتروپی GPC در چارچوب هجا (آغاز–واکه–کدا) / GPC entropy of the vowel within its syllable Onset-Vowel-Coda (OVC) context.",
  H_PGC_OVC_word:      "آنتروپی PGC در چارچوب هجا (آغاز–واکه–کدا) / PGC entropy of the vowel within its syllable Onset-Vowel-Coda (OVC) context.",

  OUF:    "عدم قطعیت آوایی رو به جلو (Westbury &amp; Yang, 2025): میانگین آنتروپی پیشوندها / Orthographic Uncertainty Forward: mean entropy of all orthographic prefixes (Westbury &amp; Yang, 2025).",
  OUB:    "عدم قطعیت آوایی رو به عقب: میانگین آنتروپی پسوندها / Orthographic Uncertainty Backward: mean entropy of all orthographic suffixes.",
  OU:     "عدم قطعیت آوایی کل = OUF + OUB / Total Orthographic Uncertainty = OUF + OUB.",
  MAXOUF: "حداکثر عدم قطعیت رو به جلو = آنتروپی اولین حرف / Maximum forward uncertainty = H(first letter prefix).",
  MAXOUB: "حداکثر عدم قطعیت رو به عقب = آنتروپی آخرین حرف / Maximum backward uncertainty = H(last letter suffix).",
  MINOUF: "حداقل عدم قطعیت رو به جلو = آنتروپی کل واژه به عنوان پیشوند / Minimum forward uncertainty = H(full word as prefix).",
  MINOUB: "حداقل عدم قطعیت رو به عقب = آنتروپی کل واژه به عنوان پسوند / Minimum backward uncertainty = H(full word as suffix).",

  PUF:    "عدم قطعیت واجی رو به جلو: میانگین آنتروپی پیشوندهای آوایی / Phonological Uncertainty Forward: mean entropy of phonological-form prefixes.",
  PUB:    "عدم قطعیت واجی رو به عقب / Phonological Uncertainty Backward.",
  PU:     "عدم قطعیت واجی کل = PUF + PUB / Total Phonological Uncertainty = PUF + PUB.",
  MAXPUF: "حداکثر عدم قطعیت واجی رو به جلو / Maximum phonological uncertainty forward.",
  MAXPUB: "حداکثر عدم قطعیت واجی رو به عقب / Maximum phonological uncertainty backward.",
  MINPUF: "حداقل عدم قطعیت واجی رو به جلو / Minimum phonological uncertainty forward.",
  MINPUB: "حداقل عدم قطعیت واجی رو به عقب / Minimum phonological uncertainty backward.",

  OU_PU_Mismatch:   "ناهمخوانی OU و PU = OU − PU. مثبت: نوشتار ابهام بیشتری از تلفظ دارد / OU−PU mismatch. Positive = spelling more uncertain than pronunciation.",
  OUF_PUF_Mismatch: "ناهمخوانی رو به جلو = OUF − PUF / Forward mismatch = OUF − PUF.",
  OUB_PUB_Mismatch: "ناهمخوانی رو به عقب = OUB − PUB / Backward mismatch = OUB − PUB.",

  Valence:       "خوشایندی واژه — منبع اول: نماتی و همکاران (۱۴۰۵/۲۰۲۶) E-PLAN (قضاوت بهترین–بدترین)؛ منبع دوم: مقادیر پیش‌بینی‌شده / Word valence. Primary source: Nemati et al. (2026) E-PLAN (best–worst judgments); fallback: predicted values.",
  Arousal:       "برانگیختگی واژه — منبع اول: E-PLAN (نماتی و همکاران، ۲۰۲۶)؛ منبع دوم: پیش‌بینی‌شده / Arousal. Primary: Nemati et al. (2026) E-PLAN; fallback: predicted.",
  Dominance:     "سلطه واژه — منبع اول: E-PLAN (نماتی و همکاران، ۲۰۲۶)؛ منبع دوم: پیش‌بینی‌شده / Dominance. Primary: Nemati et al. (2026) E-PLAN; fallback: predicted.",
  Concreteness:  "عینیت واژه — منبع اول: E-PLAN (نماتی و همکاران، ۲۰۲۶)؛ منبع دوم: پیش‌بینی‌شده / Concreteness. Primary: Nemati et al. (2026) E-PLAN; fallback: predicted.",
  Affect_Source: "منبع هنجار عاطفی: «E-PLAN (Nemati et al., 2026)» = قضاوت انسانی؛ «Predicted» = مقدار پیش‌بینی‌شده از مدل / Affective norm source: E-PLAN (Nemati et al., 2026) = human best–worst judgment; Predicted = model-extrapolated value.",

  SN_k25: "اندازه همسایگی معنایی در k=25 (شباهت کسینوس در فضای word2vec) / Semantic neighbourhood size at k=25 (cosine similarity in word2vec PCA space).",
  SN_k50: "اندازه همسایگی معنایی در k=50 / Semantic neighbourhood size at k=50.",
  Entropy_beta5:  "آنتروپی همسایگی با دمای β=5 / Neighbourhood entropy with temperature β=5.",
  Entropy_beta10: "آنتروپی همسایگی با دمای β=10 / Neighbourhood entropy with temperature β=10.",
  Dispersion_k50: "پراکندگی فضایی: میانگین فاصله تا 50 نزدیک‌ترین همسایه / Spatial dispersion: mean distance to 50 nearest neighbours.",
  Hubness_k50:    "مرکزیت (hubness): تعداد دفعاتی که این واژه در لیست 50-NN سایرین ظاهر می‌شود / Hubness: number of times this word appears in others' 50-NN lists.",
  ClusteringCoeff_k25: "ضریب خوشه‌بندی محلی در k=25 / Local clustering coefficient at k=25.",
};

// =============================================================
// COLUMN GROUP DEFINITIONS
// =============================================================
const COL_GROUPS = [
  {
    id: "basic", label: "پایه / Basic",
    cols: [
      { key: "WORD",           label: "واژه",       fmt: "str" },
      { key: "Transcription1", label: "آوانگاری",   fmt: "str" },
      { key: "PerMilFreq",     label: "بسامد/M",    fmt: 3 },
      { key: "zipf",           label: "زیف",        fmt: 3 },
      { key: "Length",         label: "طول",        fmt: 0 },
      { key: "AvePhonLength",  label: "طول آوایی",  fmt: 2 },
      { key: "n_syllables",    label: "هجا",        fmt: 2 },
      { key: "_source",        label: "منبع",       fmt: "str" },
    ],
  },
  {
    id: "affective", label: "هنجارهای عاطفی و معنایی / Affective Norms",
    cols: [
      { key: "Valence",       label: "Valence خوشایندی",  fmt: 3 },
      { key: "Arousal",       label: "Arousal هیجان",     fmt: 3 },
      { key: "Dominance",     label: "Dominance سلطه",    fmt: 3 },
      { key: "Concreteness",  label: "Concreteness عینیت", fmt: 3 },
      { key: "Affect_Source", label: "منبع / Source",     fmt: "str" },
    ],
  },
  {
    id: "neighbour", label: "همسایگی / Neighbourhood",
    cols: [
      { key: "WeightedPN",     label: "PN وزن‌دار", fmt: 2 },
      { key: "AveragedPhonNeighbourFreq",              label: "میانگین بسامد PN", fmt: 3 },
      { key: "OrthographicNeighbours",                 label: "همسایگان نوشتاری", fmt: 0 },
      { key: "AveragedOrthographicNeighboursFrequency",label: "میانگین بسامد ON", fmt: 3 },
    ],
  },
  {
    id: "gpc", label: "انطباق حرف-واج / GPC & PGC",
    cols: [
      { key: "H_GPC_word",          label: "H_GPC_word",      fmt: 4 },
      { key: "H_PGC_word",          label: "H_PGC_word",      fmt: 4 },
      { key: "H_GPC_grapheme_word", label: "H_GPC_grapheme",  fmt: 4 },
      { key: "H_PGC_grapheme_word", label: "H_PGC_grapheme",  fmt: 4 },
      { key: "H_GPC_onset_word",    label: "H_GPC_onset",     fmt: 4 },
      { key: "H_PGC_onset_word",    label: "H_PGC_onset",     fmt: 4 },
      { key: "H_GPC_rime_word",     label: "H_GPC_rime",      fmt: 4 },
      { key: "H_PGC_rime_word",     label: "H_PGC_rime",      fmt: 4 },
      { key: "H_GPC_OVC_word",      label: "H_GPC_OVC",       fmt: 4 },
      { key: "H_PGC_OVC_word",      label: "H_PGC_OVC",       fmt: 4 },
    ],
  },
  {
    id: "ou", label: "عدم قطعیت آوایی / Orthographic Uncertainty",
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
    id: "pu", label: "عدم قطعیت واجی / Phonological Uncertainty",
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
    id: "mismatch", label: "ناهمخوانی / Mismatch",
    cols: [
      { key: "OU_PU_Mismatch",   label: "OU−PU",   fmt: 4 },
      { key: "OUF_PUF_Mismatch", label: "OUF−PUF", fmt: 4 },
      { key: "OUB_PUB_Mismatch", label: "OUB−PUB", fmt: 4 },
    ],
  },
  {
    id: "semantic", label: "همسایگی معنایی / Semantic Neighbourhood",
    cols: [
      { key: "SN_k25",            label: "SN k=25",         fmt: 4 },
      { key: "SN_k50",            label: "SN k=50",         fmt: 4 },
      { key: "Entropy_beta5",     label: "Entropy β=5",     fmt: 4 },
      { key: "Entropy_beta10",    label: "Entropy β=10",    fmt: 4 },
      { key: "Dispersion_k50",    label: "Dispersion k=50", fmt: 4 },
      { key: "Hubness_k50",       label: "Hubness k=50",    fmt: 4 },
      { key: "ClusteringCoeff_k25", label: "Clustering k=25", fmt: 4 },
    ],
  },
];

// =============================================================
// VALID PERSIAN IPA CHARACTERS  (for transcription validation)
// =============================================================
const IPA_VOWELS     = new Set(["a","e","o","ɑ","i","u","ɛ","ɔ"]);
const IPA_CONSONANTS = new Set([
  "b","p","t","d","k","ɡ","g","q","ʔ",
  "f","v","s","z","ʃ","ʒ","x","ɣ",
  "h","m","n","r","l","j","w",
]);
const IPA_ALL = new Set([...IPA_VOWELS, ...IPA_CONSONANTS]);
const DIGRAPHS = ["tʃ","dʒ"];   // treated as two consecutive valid chars

function validateTranscription(phon) {
  if (!phon || !phon.trim()) return { valid: false, errors: ["لطفاً آوانگاری را وارد کنید / Please enter a transcription."] };
  const errors = [];
  // check vowel
  if (![...phon].some(ch => IPA_VOWELS.has(ch))) {
    errors.push("آوانگاری باید حداقل یک واکه داشته باشد ({a,e,o,ɑ,i,u,ɛ,ɔ}) / Must contain at least one vowel.");
  }
  // check chars — split digraphs first
  const cleaned = phon.replace(/tʃ/g, "").replace(/dʒ/g, "");
  const invalid = [...cleaned].filter(ch => !IPA_ALL.has(ch));
  if (invalid.length) {
    errors.push(`نویسه‌های نامعتبر / Invalid characters: ${[...new Set(invalid)].join(" ")}`);
  }
  return { valid: errors.length === 0, errors };
}

// =============================================================
// STATE
// =============================================================
let lexicon   = new Map();   // norm_word → row object
let freqMap   = new Map();   // norm_word → {pm, zipf}
let ouPrefix  = {};
let ouSuffix  = {};
let ouTotal   = 1;
let puPrefix  = {};
let puSuffix  = {};
let puTotal   = 1;
let gpcEntropy = {};         // grapheme → H_GPC
let pgcEntropy = {};         // phoneme char → H_PGC
let dataReady = false;
let lastResults = [];        // [{word, norm, row}]

// =============================================================
// PERSIAN NORMALISATION  (mirrors build_web_data.py)
// =============================================================
function normalizeWord(text) {
  if (!text) return "";
  return text.trim()
    .replace(/ي/g, "ی").replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه").replace(/ة/g, "ه")
    .replace(/أ/g, "ا").replace(/إ/g, "ا").replace(/ؤ/g, "و")
    .replace(/[ ‌]+/g, "");
}

function normalizeTranscription(t) {
  if (!t) return "";
  return t.trim()
    .replace(/\s/g, "").replace(/‌/g, "")
    .replace(/g/g, "ɡ").replace(/S/g, "s").replace(/'/g, "ʔ");
}

// =============================================================
// ENTROPY HELPERS
// =============================================================
function entropyContrib(p) { return p <= 0 ? 0 : -p * Math.log2(p); }
function mean(arr)          { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

// =============================================================
// IN-BROWSER OU COMPUTATION
// =============================================================
function computeOU(word) {
  const L = word.length;
  if (!L) return null;
  const fwd = [], bwd = [];
  for (let k = 1; k <= L; k++) {
    fwd.push(entropyContrib((ouPrefix[word.slice(0,k)]  || 0) / ouTotal));
    bwd.push(entropyContrib((ouSuffix[word.slice(L-k)]  || 0) / ouTotal));
  }
  const sF = fwd.reduce((a,b)=>a+b,0), sB = bwd.reduce((a,b)=>a+b,0);
  return { OUF:sF/L, OUB:sB/L, OU:sF/L+sB/L,
           MAXOUF:fwd[0], MAXOUB:bwd[0], MINOUF:fwd[L-1], MINOUB:bwd[L-1] };
}

// =============================================================
// IN-BROWSER PU COMPUTATION  (needs loaded puPrefix/puSuffix)
// =============================================================
function computePU(phon) {
  // prepend glottal if vowel-initial (matches add_glottal in Python)
  if (phon && IPA_VOWELS.has(phon[0])) phon = "ʔ" + phon;
  const L = phon.length;
  if (!L) return null;
  const fwd = [], bwd = [];
  for (let k = 1; k <= L; k++) {
    fwd.push(entropyContrib((puPrefix[phon.slice(0,k)]  || 0) / puTotal));
    bwd.push(entropyContrib((puSuffix[phon.slice(L-k)]  || 0) / puTotal));
  }
  const sF = fwd.reduce((a,b)=>a+b,0), sB = bwd.reduce((a,b)=>a+b,0);
  return { PUF:sF/L, PUB:sB/L, PU:sF/L+sB/L,
           MAXPUF:fwd[0], MAXPUB:bwd[0], MINPUF:fwd[L-1], MINPUB:bwd[L-1] };
}

// =============================================================
// IN-BROWSER H_GPC_grapheme / H_PGC_grapheme  (from mapping entropy tables)
// =============================================================
function computeGPCGrapheme(word, phon) {
  if (!word || !phon) return {};
  const hGPC = [...word].map(ch => gpcEntropy[ch] ?? 0);
  const hPGC = [...phon].map(ch => pgcEntropy[ch] ?? 0);
  return {
    H_GPC_grapheme_word: mean(hGPC).toFixed(6),
    H_PGC_grapheme_word: mean(hPGC).toFixed(6),
  };
}

// =============================================================
// TSV PARSER
// =============================================================
function parseTSV(text) {
  const lines = text.split("\n");
  if (!lines.length) return { headers: [], rows: [] };
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

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadAll() {
  try {
    setLoading("در حال بارگذاری واژگان…<br>Loading lexicon…");
    const lexText = await fetchText("data/lexicon_data.tsv");
    parseTSV(lexText).rows.forEach(row => {
      const key = row["WORD_norm"] || normalizeWord(row["WORD"] || "");
      if (key) lexicon.set(key, row);
    });

    setLoading("در حال بارگذاری جداول OU و PU…<br>Loading OU/PU tables…");
    const [pfx, sfx, ouMeta, ppfx, psfx, puMeta] = await Promise.all([
      fetchText("data/ou_prefix.tsv"),
      fetchText("data/ou_suffix.tsv"),
      fetchJSON("data/ou_meta.json"),
      fetchText("data/pu_prefix.tsv"),
      fetchText("data/pu_suffix.tsv"),
      fetchJSON("data/pu_meta.json"),
    ]);
    parseTSV(pfx).rows.forEach(r  => { ouPrefix[r.key] = +r.freq || 0; });
    parseTSV(sfx).rows.forEach(r  => { ouSuffix[r.key] = +r.freq || 0; });
    ouTotal = ouMeta.total_freq || 1;
    parseTSV(ppfx).rows.forEach(r => { puPrefix[r.key] = +r.freq || 0; });
    parseTSV(psfx).rows.forEach(r => { puSuffix[r.key] = +r.freq || 0; });
    puTotal = puMeta.total_freq || 1;

    setLoading("در حال بارگذاری جداول آنتروپی…<br>Loading entropy tables…");
    [gpcEntropy, pgcEntropy] = await Promise.all([
      fetchJSON("data/grapheme_entropy.json"),
      fetchJSON("data/phoneme_entropy.json"),
    ]);

    setLoading("در حال بارگذاری بسامد…<br>Loading frequency data…");
    const freqText = await fetchText("data/word_frequencies_public.tsv");
    parseTSV(freqText).rows.forEach(r => {
      const key = r["word_norm"] || normalizeWord(r["word"] || "");
      if (key) freqMap.set(key, { pm: r["PerMillion"], zipf: r["Zipf"] });
    });

    dataReady = true;
    document.getElementById("loadingOverlay").style.display = "none";
    setStatus(`آماده — ${lexicon.size.toLocaleString()} واژه در واژگان / Ready — ${lexicon.size.toLocaleString()} words`, "ok");

  } catch (err) {
    console.error(err);
    document.getElementById("loadingOverlay").style.display = "none";
    setStatus("خطا در بارگذاری: " + err.message + " — make sure to run build/build_web_data.py first.", "error");
  }
}

// =============================================================
// LOOKUP
// =============================================================
function lookupWord(rawWord) {
  const norm = normalizeWord(rawWord);
  if (!norm) return null;

  if (lexicon.has(norm)) {
    return { norm, row: { ...lexicon.get(norm), _source: "lexicon" } };
  }

  const freq = freqMap.get(norm);
  const ou   = computeOU(norm);
  const row  = {
    WORD: rawWord, WORD_norm: norm,
    _source: "computed",
    PerMilFreq: freq?.pm ?? "", zipf: freq?.zipf ?? "",
    Length: norm.length,
  };
  if (ou) Object.assign(row, {
    OUF:    ou.OUF.toFixed(6),    OUB:    ou.OUB.toFixed(6),
    OU:     ou.OU.toFixed(6),     MAXOUF: ou.MAXOUF.toFixed(6),
    MAXOUB: ou.MAXOUB.toFixed(6), MINOUF: ou.MINOUF.toFixed(6),
    MINOUB: ou.MINOUB.toFixed(6),
  });
  return { norm, row };
}

// =============================================================
// APPLY TRANSCRIPTION  (called when user submits one for a missing word)
// =============================================================
function applyTranscription(resultIdx, rawPhon) {
  const norm = normalizeTranscription(rawPhon);
  const result = lastResults[resultIdx];
  if (!result) return;

  const pu  = computePU(norm);
  const gpc = computeGPCGrapheme(result.row.WORD_norm || result.norm, norm);

  Object.assign(result.row, {
    Transcription1: rawPhon,
    ...gpc,
    ...(pu ? {
      PUF: pu.PUF.toFixed(6), PUB: pu.PUB.toFixed(6), PU: pu.PU.toFixed(6),
      MAXPUF: pu.MAXPUF.toFixed(6), MAXPUB: pu.MAXPUB.toFixed(6),
      MINPUF: pu.MINPUF.toFixed(6), MINPUB: pu.MINPUB.toFixed(6),
    } : {}),
    _source: "computed + transcription",
  });

  // If both OU and PU now available, compute mismatch
  const ouVal = parseFloat(result.row.OU);
  const puVal = pu ? pu.PU : NaN;
  if (!isNaN(ouVal) && !isNaN(puVal)) {
    result.row.OU_PU_Mismatch   = (ouVal - puVal).toFixed(6);
    result.row.OUF_PUF_Mismatch = (parseFloat(result.row.OUF || 0) - pu.PUF).toFixed(6);
    result.row.OUB_PUB_Mismatch = (parseFloat(result.row.OUB || 0) - pu.PUB).toFixed(6);
  }

  renderTable(lastResults);
}

// =============================================================
// RENDERING
// =============================================================
function activeGroups() {
  return new Set(
    Array.from(document.querySelectorAll(".grp:checked")).map(cb => cb.value)
  );
}
function activeCols() {
  const groups = activeGroups();
  return COL_GROUPS.filter(g => groups.has(g.id)).flatMap(g => g.cols);
}

function formatCell(value, fmt) {
  if (value === undefined || value === null || value === "") return "—";
  if (fmt === "str") return String(value);
  const n = parseFloat(value);
  if (isNaN(n)) return "—";
  return fmt === 0 ? Math.round(n).toString() : n.toFixed(fmt);
}

function makeInfoBtn(key) {
  const desc = MEASURE_INFO[key];
  if (!desc) return "";
  const btn = document.createElement("button");
  btn.className = "info-btn";
  btn.title = desc;
  btn.setAttribute("aria-label", "اطلاعات بیشتر / More info");
  btn.textContent = "ⓘ";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    showInfoModal(key, desc);
  });
  return btn;
}

function renderTable(results) {
  const cols   = activeCols();
  const groups = activeGroups();
  const thead  = document.getElementById("tableHead");
  const tbody  = document.getElementById("tableBody");

  // Two header rows: group spans + column names
  let spanHtml   = "<tr>";
  let headerHtml = "<tr>";
  for (const grp of COL_GROUPS) {
    if (!groups.has(grp.id)) continue;
    spanHtml += `<th colspan="${grp.cols.length}" class="group-header">${grp.label}</th>`;
    for (const col of grp.cols) {
      headerHtml += `<th class="col-header" data-key="${col.key}">${col.label} <span class="info-anchor" data-key="${col.key}">ⓘ</span></th>`;
    }
  }
  thead.innerHTML = spanHtml + "</tr>" + headerHtml + "</tr>";

  // Attach info click handlers to header ⓘ spans
  thead.querySelectorAll(".info-anchor").forEach(span => {
    span.addEventListener("click", () => {
      const key = span.dataset.key;
      showInfoModal(key, MEASURE_INFO[key] || key);
    });
  });

  tbody.innerHTML = "";
  for (let ri = 0; ri < results.length; ri++) {
    const { row } = results[ri];
    const isComputed = row._source !== "lexicon";
    const tr = document.createElement("tr");
    if (isComputed) tr.classList.add("row-computed");

    for (const col of cols) {
      const td = document.createElement("td");

      // Special case: transcription cell for computed words
      if (col.key === "Transcription1" && isComputed) {
        td.appendChild(makeTranscriptionCell(ri, row));
      } else {
        const raw = row[col.key];
        if (col.key === "WORD") td.dir = "rtl";
        td.textContent = formatCell(raw, col.fmt);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  document.getElementById("resultCount").textContent =
    `${results.length} واژه / word(s)  ·  ` +
    `${results.filter(r => r.row._source === "lexicon").length} از واژگان / in lexicon  ·  ` +
    `${results.filter(r => r.row._source !== "lexicon").length} محاسبه‌شده / computed`;
}

// Build the inline transcription widget for a missing-word row
function makeTranscriptionCell(resultIdx, row) {
  const wrap = document.createElement("div");
  wrap.className = "transcription-cell";

  if (row.Transcription1) {
    // Already has a transcription — show it with an edit button
    const span = document.createElement("span");
    span.className = "phon-tag ok";
    span.textContent = row.Transcription1;
    const editBtn = document.createElement("button");
    editBtn.className = "phon-edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "ویرایش / Edit transcription";
    editBtn.addEventListener("click", () => { span.remove(); editBtn.remove(); wrap.appendChild(makeInputFragment(resultIdx, row.Transcription1)); });
    wrap.appendChild(span);
    wrap.appendChild(editBtn);
  } else {
    wrap.appendChild(makeInputFragment(resultIdx, ""));
  }
  return wrap;
}

function makeInputFragment(resultIdx, initial) {
  const frag = document.createDocumentFragment();

  const input = document.createElement("input");
  input.type  = "text";
  input.className = "phon-input";
  input.value = initial;
  input.placeholder = "e.g. ketɑb";
  input.setAttribute("dir", "ltr");
  input.setAttribute("spellcheck", "false");
  input.addEventListener("input", () => validateAndMark(input, valMsg));

  const valMsg = document.createElement("div");
  valMsg.className = "val-msg";

  const btn = document.createElement("button");
  btn.className = "btn btn-xs btn-primary";
  btn.textContent = "محاسبه / Compute";
  btn.addEventListener("click", () => {
    const phon = normalizeTranscription(input.value);
    const { valid, errors } = validateTranscription(phon);
    if (!valid) {
      valMsg.textContent = errors.join(" | ");
      valMsg.className   = "val-msg val-err";
      return;
    }
    valMsg.textContent = "✓ معتبر / Valid";
    valMsg.className   = "val-msg val-ok";
    applyTranscription(resultIdx, phon);
  });

  frag.appendChild(input);
  frag.appendChild(btn);
  frag.appendChild(valMsg);

  // Guide line
  const guide = document.createElement("div");
  guide.className = "phon-guide";
  guide.innerHTML = `<strong>واکه‌ها:</strong> a e o ɑ i u &nbsp;|&nbsp; <strong>همخوان‌ها:</strong> b p t d k ɡ q ʔ f v s z ʃ ʒ x ɣ h m n r l j`;
  frag.appendChild(guide);

  return frag;
}

function validateAndMark(input, msgEl) {
  const phon = normalizeTranscription(input.value);
  if (!phon) { input.className = "phon-input"; msgEl.textContent = ""; return; }
  const { valid, errors } = validateTranscription(phon);
  input.className = "phon-input " + (valid ? "phon-valid" : "phon-invalid");
  msgEl.textContent = valid ? "✓ معتبر / Valid" : errors[0];
  msgEl.className   = "val-msg " + (valid ? "val-ok" : "val-err");
}

// =============================================================
// INFO MODAL
// =============================================================
function showInfoModal(key, desc) {
  document.getElementById("infoModalTitle").textContent = key;
  document.getElementById("infoModalBody").innerHTML =
    desc.replace(/\//g, " <span class='sep'>/</span> ");
  document.getElementById("infoModal").classList.add("open");
}

function closeInfoModal() {
  document.getElementById("infoModal").classList.remove("open");
}

// =============================================================
// COLUMN SELECTOR PANEL  (build programmatically)
// =============================================================
function buildColPanel() {
  const panel = document.getElementById("colGroupPanel");
  const row   = panel.querySelector(".col-group-row");
  row.innerHTML = '<strong dir="rtl">نمایش ستون‌ها / Show columns:</strong>';

  for (const grp of COL_GROUPS) {
    const label = document.createElement("label");
    label.className = "grp-label";

    const cb = document.createElement("input");
    cb.type  = "checkbox";
    cb.className = "grp";
    cb.value = grp.id;
    cb.checked = ["basic","affective","gpc","ou","pu"].includes(grp.id);
    cb.addEventListener("change", () => { if (lastResults.length) renderTable(lastResults); });

    const text = document.createTextNode(" " + grp.label + " ");
    const iBtns = document.createElement("span");
    iBtns.className = "grp-info-icons";

    for (const col of grp.cols) {
      const s = document.createElement("span");
      s.className  = "info-anchor small";
      s.textContent = col.label;
      s.dataset.key = col.key;
      s.title = MEASURE_INFO[col.key] || col.key;
      s.addEventListener("click", () => showInfoModal(col.key, MEASURE_INFO[col.key] || col.key));
      iBtns.appendChild(s);
    }

    label.appendChild(cb);
    label.appendChild(text);
    label.appendChild(iBtns);
    row.appendChild(label);
  }
}

// =============================================================
// SEARCH
// =============================================================
function doSearch() {
  if (!dataReady) { setStatus("داده‌ها هنوز آماده نیستند / Data still loading…", "warn"); return; }
  const raw = document.getElementById("wordInput").value;
  const words = raw.split(/[\n،,\t]+/).map(w => w.trim()).filter(Boolean);
  if (!words.length) { setStatus("لطفاً واژه‌ای وارد کنید / Please enter at least one word.", "warn"); return; }

  lastResults = words.map(w => ({ word: w, ...lookupWord(w) })).filter(r => r.norm);
  if (!lastResults.length) { setStatus("نتیجه‌ای یافت نشد / No results found.", "warn"); return; }

  renderTable(lastResults);
  document.getElementById("resultsSection").hidden  = false;
  document.getElementById("colGroupPanel").hidden   = false;
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
    cols.map(c => { const v = row[c.key]; return (v == null) ? "" : String(v); }).join("\t")
  );
  const blob = new Blob(["﻿" + [header, ...rows].join("\n")],
    { type: "text/tab-separated-values;charset=utf-8" });
  const a = Object.assign(document.createElement("a"),
    { href: URL.createObjectURL(blob), download: "persian_lexical_results.tsv" });
  a.click();
  URL.revokeObjectURL(a.href);
}

// =============================================================
// STATUS
// =============================================================
function setStatus(msg, type) {
  const el = document.getElementById("statusMsg");
  if (!msg) { el.hidden = true; return; }
  el.hidden   = false;
  el.className = "status-msg status-" + (type || "info");
  el.textContent = msg;
}

// =============================================================
// WIRING
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
document.getElementById("wordInput").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) doSearch();
});
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

// Info modal close
document.getElementById("infoModalClose").addEventListener("click", closeInfoModal);
document.getElementById("infoModal").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeInfoModal();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeInfoModal(); });

// =============================================================
// BOOT
// =============================================================
buildColPanel();
loadAll();
