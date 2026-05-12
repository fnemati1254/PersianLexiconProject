"""
build_web_data.py
=================
Offline preprocessing for the Persian Lexical Search web app.

Reads:
  LEXICON_FILE  — PersianLexicon_with_Phonological_Uncertainty.xlsx
  FREQ_TSV      — word_frequencies_public.tsv  (fallback frequencies)

Writes into ../data/:
  lexicon_data.tsv    — compact tab-separated lookup table (~35 columns)
  ou_prefix.tsv       — prefix → sumFreq  (for in-browser OU computation)
  ou_suffix.tsv       — suffix → sumFreq
  ou_meta.json        — {"total_freq": <float>}
  pu_prefix.tsv       — phoneme-prefix → sumFreq  (for in-browser PU)
  pu_suffix.tsv       — phoneme-suffix → sumFreq
  pu_meta.json        — {"total_freq": <float>}

Run once whenever the source lexicon changes:
    python build_web_data.py
"""

import json
import math
import os
import re
import sys

# Force UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from collections import defaultdict

import numpy as np
import pandas as pd

# ==========================================================
# PATHS  — edit these if your files live elsewhere
# ==========================================================
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

LEXICON_FILE = (
    r"D:\PsycholinguisticsConferencePaper\statisticalAnalysisRT"
    r"\PersianLexicon_with_Phonological_Uncertainty.xlsx"
)
FREQ_TSV = (
    r"D:\projectData\Frequency\PersianFrequencySearch\word_frequencies_public.tsv"
)

# ==========================================================
# COLUMNS TO EXPORT
# ==========================================================
WORD_COL = "WORD"
FREQ_COL = "PerMilFreq"

TRANSCRIPTION_COLS = [
    "Transcription1", "Transcription2", "Transcription3",
    "Transcription4", "Transcription5",
]

EXPORT_COLS = [
    "WORD_norm",           # normalised form used as lookup key
    "WORD",                # original orthographic form
    "Transcription1",
    "PerMilFreq",
    "zipf",
    "Length",
    "AvePhonLength",
    "n_syllables",
    # GPC / PGC
    "H_GPC_word",
    "H_PGC_word",
    "H_GPC_grapheme_word",
    "H_PGC_grapheme_word",
    "H_GPC_onset_word",
    "H_PGC_onset_word",
    "H_GPC_rime_word",
    "H_PGC_rime_word",
    "H_GPC_OVC_word",
    "H_PGC_OVC_word",
    # Orthographic Uncertainty
    "OUF", "OUB", "OU",
    "MAXOUF", "MAXOUB", "MINOUF", "MINOUB",
    # Phonological Uncertainty
    "PUF", "PUB", "PU",
    "MAXPUF", "MAXPUB", "MINPUF", "MINPUB",
    # OU–PU mismatch
    "OU_PU_Mismatch", "OUF_PUF_Mismatch", "OUB_PUB_Mismatch",
    # Semantic neighbourhood
    "SN_k25", "SN_k50",
    "Entropy_beta5", "Entropy_beta10",
    "Dispersion_k50", "Hubness_k50", "ClusteringCoeff_k25",
]

NUMERIC_EXPORT_COLS = [c for c in EXPORT_COLS if c not in ("WORD_norm", "WORD", "Transcription1")]

# ==========================================================
# NORMALISATION
# ==========================================================
SPACE_RE = re.compile(r"[ ‌]+")   # space + ZWNJ


def normalize_word(text) -> str:
    """Persian orthographic normalisation — matches OrthUncertaintyCalculations.py nospace form."""
    if pd.isna(text):
        return ""
    v = str(text).strip()
    v = (v.replace("ي", "ی")
          .replace("ك", "ک")
          .replace("ۀ", "ه")
          .replace("ة", "ه")
          .replace("أ", "ا")
          .replace("إ", "ا")
          .replace("ؤ", "و"))
    v = SPACE_RE.sub("", v)
    return v


def normalize_transcription(text) -> str:
    if pd.isna(text):
        return ""
    v = str(text).strip().replace(" ", "").replace("‌", "")
    return v.replace("g", "ɡ").replace("S", "s").replace("'", "ʔ")


VOWELS = {"a", "e", "o", "ɑ", "i", "u", "ɛ", "ɔ"}
GLOTTAL = "ʔ"


def add_glottal(phon: str) -> str:
    return (GLOTTAL + phon) if (phon and phon[0] in VOWELS) else phon


# ==========================================================
# HELPERS
# ==========================================================

def entropy_contribution(p: float) -> float:
    return 0.0 if p <= 0.0 else -p * math.log2(p)


def fmt(v, decimals=6) -> str:
    """Format a scalar for TSV — empty string for NaN."""
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    try:
        f = float(v)
        if math.isnan(f):
            return ""
        return f"{f:.{decimals}f}"
    except (TypeError, ValueError):
        return str(v) if v else ""


# ==========================================================
# STEP 1 — load lexicon
# ==========================================================
print("Loading lexicon …")
df = pd.read_excel(LEXICON_FILE)
print(f"  {len(df)} rows, {len(df.columns)} columns")

# Ensure zipf exists
if "zipf" not in df.columns:
    df["freq_safe"] = pd.to_numeric(df[FREQ_COL], errors="coerce").clip(lower=0.1)
    df["zipf"] = np.log10(df["freq_safe"]) + 3

# Normalised lookup key
df["WORD_norm"] = df[WORD_COL].apply(normalize_word)

# Normalised transcriptions (for PU table)
for col in TRANSCRIPTION_COLS:
    if col in df.columns:
        df[f"_{col}_norm"] = df[col].apply(normalize_transcription)

# Fill missing Length from normalized word
if "Length" not in df.columns:
    df["Length"] = df["WORD_norm"].str.len()

# ==========================================================
# STEP 2 — write lexicon_data.tsv
# ==========================================================
print("Writing lexicon_data.tsv …")

# Keep only columns that actually exist
out_cols = [c for c in EXPORT_COLS if c in df.columns]
missing = [c for c in EXPORT_COLS if c not in df.columns]
if missing:
    print(f"  NOTE: columns absent from lexicon (will be blank): {missing}")

out_df = df[out_cols].copy()

# Round numeric columns to 6 decimal places to shrink file
for c in out_cols:
    if c not in ("WORD_norm", "WORD", "Transcription1"):
        out_df[c] = pd.to_numeric(out_df[c], errors="coerce").round(6)

out_path = os.path.join(DATA_DIR, "lexicon_data.tsv")
out_df.to_csv(out_path, sep="\t", index=False, encoding="utf-8")
size_mb = os.path.getsize(out_path) / 1e6
print(f"  -> {out_path}  ({size_mb:.1f} MB, {len(out_df)} rows)")

# ==========================================================
# STEP 3 — build OU prefix / suffix tables
# ==========================================================
print("Building OU prefix/suffix frequency tables …")

ou_prefix: dict[str, float] = defaultdict(float)
ou_suffix: dict[str, float] = defaultdict(float)
ou_total = 0.0

lex_ou = (
    df.dropna(subset=["WORD_norm", FREQ_COL])
      .groupby("WORD_norm", as_index=False)[FREQ_COL]
      .sum()
)

for _, row in lex_ou.iterrows():
    w = str(row["WORD_norm"])
    f = float(row[FREQ_COL])
    if not w or f <= 0:
        continue
    ou_total += f
    L = len(w)
    for k in range(1, L + 1):
        ou_prefix[w[:k]] += f
        ou_suffix[w[L - k:]] += f

# Save as TSV (key\tfreq)
def _write_freq_tsv(path: str, table: dict):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("key\tfreq\n")
        for k, v in table.items():
            fh.write(f"{k}\t{v:.4f}\n")

_write_freq_tsv(os.path.join(DATA_DIR, "ou_prefix.tsv"), ou_prefix)
_write_freq_tsv(os.path.join(DATA_DIR, "ou_suffix.tsv"), ou_suffix)

with open(os.path.join(DATA_DIR, "ou_meta.json"), "w") as fh:
    json.dump({"total_freq": ou_total}, fh)

print(f"  {len(ou_prefix)} prefixes, {len(ou_suffix)} suffixes, total_freq={ou_total:.1f}")
for p in ("ou_prefix.tsv", "ou_suffix.tsv", "ou_meta.json"):
    sz = os.path.getsize(os.path.join(DATA_DIR, p)) / 1e6
    print(f"  {p}: {sz:.2f} MB")

# ==========================================================
# STEP 4 — build PU prefix / suffix tables
# ==========================================================
print("Building PU (phonological) prefix/suffix frequency tables …")

pu_prefix: dict[str, float] = defaultdict(float)
pu_suffix: dict[str, float] = defaultdict(float)
pu_total = 0.0

for _, row in df.iterrows():
    freq = pd.to_numeric(row.get(FREQ_COL), errors="coerce")
    if pd.isna(freq) or freq <= 0:
        continue
    for col in TRANSCRIPTION_COLS:
        nk = f"_{col}_norm"
        if nk not in df.columns:
            continue
        phon = str(row.get(nk, "")).strip()
        if not phon:
            continue
        phon = add_glottal(phon)
        f = float(freq)
        pu_total += f
        L = len(phon)
        for k in range(1, L + 1):
            pu_prefix[phon[:k]] += f
            pu_suffix[phon[L - k:]] += f

_write_freq_tsv(os.path.join(DATA_DIR, "pu_prefix.tsv"), pu_prefix)
_write_freq_tsv(os.path.join(DATA_DIR, "pu_suffix.tsv"), pu_suffix)
with open(os.path.join(DATA_DIR, "pu_meta.json"), "w") as fh:
    json.dump({"total_freq": pu_total}, fh)

print(f"  {len(pu_prefix)} phoneme-prefixes, {len(pu_suffix)} phoneme-suffixes")

# ==========================================================
# STEP 5 — copy / symlink freq TSV  (or write a slim version)
# ==========================================================
print("Processing frequency fallback …")
freq_df = pd.read_csv(FREQ_TSV, sep="\t", encoding="utf-8")
freq_df.columns = ["word", "PerMillion", "Zipf"]

# Normalise freq words so browser lookup matches
freq_df["word_norm"] = freq_df["word"].apply(normalize_word)

freq_out = os.path.join(DATA_DIR, "word_frequencies_public.tsv")
freq_df[["word_norm", "PerMillion", "Zipf"]].to_csv(freq_out, sep="\t", index=False, encoding="utf-8")
sz = os.path.getsize(freq_out) / 1e6
print(f"  {len(freq_df)} frequency entries → {freq_out} ({sz:.1f} MB)")

# ==========================================================
# DONE
# ==========================================================
print("\nAll data files written to:", DATA_DIR)
print("File sizes:")
for fname in sorted(os.listdir(DATA_DIR)):
    sz = os.path.getsize(os.path.join(DATA_DIR, fname)) / 1e6
    print(f"  {fname}: {sz:.2f} MB")
