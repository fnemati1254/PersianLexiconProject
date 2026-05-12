"""
build_web_data.py
=================
Offline preprocessing for the Persian Lexical Search web app.

Reads:
  LEXICON_FILE  — PersianLexicon_with_Phonological_Uncertainty.xlsx
  MAPPING_FILE  — Persian_GPC_PGC_mapping_inventory.xlsx
  FREQ_TSV      — word_frequencies_public.tsv  (fallback frequencies)

Writes into ../data/:
  lexicon_data.tsv        — main lookup table (all metrics per word)
  ou_prefix.tsv           — orth. prefix  -> sumFreq
  ou_suffix.tsv           — orth. suffix  -> sumFreq
  ou_meta.json            — {"total_freq": <float>}
  pu_prefix.tsv           — phon. prefix  -> sumFreq
  pu_suffix.tsv           — phon. suffix  -> sumFreq
  pu_meta.json            — {"total_freq": <float>}
  grapheme_entropy.json   — {grapheme: H_GPC_value}
  phoneme_entropy.json    — {phoneme_char: H_PGC_value}
  word_frequencies_public.tsv — normalised frequency fallback

Run once whenever the source lexicon changes:
    python build_web_data.py
"""

import json
import math
import os
import re
import sys
from collections import defaultdict

# Force UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

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
MAPPING_FILE = (
    r"D:\PsycholinguisticsConferencePaper\statisticalAnalysisRT"
    r"\Persian_GPC_PGC_mapping_inventory.xlsx"
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
    # Neighbourhood
    "WeightedPN",
    "AveragedPhonNeighbourFreq",
    "OrthographicNeighbours",
    "AveragedOrthographicNeighboursFrequency",
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
    # OU-PU mismatch
    "OU_PU_Mismatch", "OUF_PUF_Mismatch", "OUB_PUB_Mismatch",
    # Semantic neighbourhood
    "SN_k25", "SN_k50",
    "Entropy_beta5", "Entropy_beta10",
    "Dispersion_k50", "Hubness_k50", "ClusteringCoeff_k25",
]

# ==========================================================
# NORMALISATION
# ==========================================================
SPACE_RE = re.compile(r"[ ‌]+")   # space + ZWNJ


def normalize_word(text) -> str:
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

def entropy_from_dist(dist: dict) -> float:
    total = sum(dist.values())
    if total == 0:
        return 0.0
    return -sum((v / total) * math.log2(v / total) for v in dist.values() if v > 0)


def _write_freq_tsv(path: str, table: dict) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("key\tfreq\n")
        for k, v in table.items():
            fh.write(f"{k}\t{v:.4f}\n")


# ==========================================================
# STEP 1 — load lexicon
# ==========================================================
print("Loading lexicon ...")
df = pd.read_excel(LEXICON_FILE)
print(f"  {len(df)} rows, {len(df.columns)} columns")

# Ensure zipf exists
if "zipf" not in df.columns:
    df["freq_safe"] = pd.to_numeric(df[FREQ_COL], errors="coerce").clip(lower=0.1)
    df["zipf"] = np.log10(df["freq_safe"]) + 3

df["WORD_norm"] = df[WORD_COL].apply(normalize_word)

for col in TRANSCRIPTION_COLS:
    if col in df.columns:
        df[f"_{col}_norm"] = df[col].apply(normalize_transcription)

if "Length" not in df.columns:
    df["Length"] = df["WORD_norm"].str.len()

# ==========================================================
# STEP 2 — write lexicon_data.tsv
# ==========================================================
print("Writing lexicon_data.tsv ...")

out_cols = [c for c in EXPORT_COLS if c in df.columns]
missing = [c for c in EXPORT_COLS if c not in df.columns]
if missing:
    print(f"  NOTE: columns absent (will be blank): {missing}")

out_df = df[out_cols].copy()
for c in out_cols:
    if c not in ("WORD_norm", "WORD", "Transcription1"):
        out_df[c] = pd.to_numeric(out_df[c], errors="coerce").round(6)

out_path = os.path.join(DATA_DIR, "lexicon_data.tsv")
out_df.to_csv(out_path, sep="\t", index=False, encoding="utf-8")
size_mb = os.path.getsize(out_path) / 1e6
print(f"  -> {out_path}  ({size_mb:.1f} MB, {len(out_df)} rows)")

# ==========================================================
# STEP 3 — OU prefix / suffix tables
# ==========================================================
print("Building OU prefix/suffix tables ...")

ou_prefix: dict = defaultdict(float)
ou_suffix: dict = defaultdict(float)
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

_write_freq_tsv(os.path.join(DATA_DIR, "ou_prefix.tsv"), ou_prefix)
_write_freq_tsv(os.path.join(DATA_DIR, "ou_suffix.tsv"), ou_suffix)
with open(os.path.join(DATA_DIR, "ou_meta.json"), "w") as fh:
    json.dump({"total_freq": ou_total}, fh)

print(f"  {len(ou_prefix)} prefixes, {len(ou_suffix)} suffixes")

# ==========================================================
# STEP 4 — PU prefix / suffix tables
# ==========================================================
print("Building PU phonological prefix/suffix tables ...")

pu_prefix: dict = defaultdict(float)
pu_suffix: dict = defaultdict(float)
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
# STEP 5 — grapheme & phoneme entropy tables (from mapping inventory)
# ==========================================================
print("Building grapheme/phoneme entropy tables from mapping inventory ...")

gpc_by_grapheme: dict = {}
pgc_by_phoneme:  dict = {}

try:
    gpc_long = pd.read_excel(MAPPING_FILE, sheet_name="GPC_long")
    gpc_dist: dict = defaultdict(lambda: defaultdict(float))
    for _, row in gpc_long.iterrows():
        g = str(row["grapheme"])
        p = str(row["phoneme"])
        cnt = float(row["frequency_weighted_count"])
        gpc_dist[g][p] += cnt
    gpc_by_grapheme = {g: entropy_from_dist(d) for g, d in gpc_dist.items()}
    print(f"  {len(gpc_by_grapheme)} grapheme entropy values (GPC_long)")

    pgc_long = pd.read_excel(MAPPING_FILE, sheet_name="PGC_long")
    pgc_dist: dict = defaultdict(lambda: defaultdict(float))
    for _, row in pgc_long.iterrows():
        p = str(row["phoneme"])
        g = str(row["grapheme"])
        cnt = float(row["frequency_weighted_count"])
        pgc_dist[p][g] += cnt
    pgc_by_phoneme = {p: entropy_from_dist(d) for p, d in pgc_dist.items()}
    print(f"  {len(pgc_by_phoneme)} phoneme entropy values (PGC_long)")

except Exception as exc:
    print(f"  WARNING: could not read mapping file: {exc}")
    print("  grapheme_entropy.json / phoneme_entropy.json will be empty dicts.")

with open(os.path.join(DATA_DIR, "grapheme_entropy.json"), "w", encoding="utf-8") as fh:
    json.dump(gpc_by_grapheme, fh, ensure_ascii=False)
with open(os.path.join(DATA_DIR, "phoneme_entropy.json"), "w", encoding="utf-8") as fh:
    json.dump(pgc_by_phoneme, fh, ensure_ascii=False)

# ==========================================================
# STEP 6 — normalised frequency fallback TSV
# ==========================================================
print("Processing frequency fallback ...")
freq_df = pd.read_csv(FREQ_TSV, sep="\t", encoding="utf-8")
freq_df.columns = ["word", "PerMillion", "Zipf"]
freq_df["word_norm"] = freq_df["word"].apply(normalize_word)
freq_out = os.path.join(DATA_DIR, "word_frequencies_public.tsv")
freq_df[["word_norm", "PerMillion", "Zipf"]].to_csv(freq_out, sep="\t", index=False, encoding="utf-8")
sz = os.path.getsize(freq_out) / 1e6
print(f"  {len(freq_df)} frequency entries -> {freq_out} ({sz:.1f} MB)")

# ==========================================================
# DONE
# ==========================================================
print("\nAll data files written to:", DATA_DIR)
print("File sizes:")
for fname in sorted(os.listdir(DATA_DIR)):
    sz = os.path.getsize(os.path.join(DATA_DIR, fname)) / 1e6
    print(f"  {fname}: {sz:.2f} MB")
