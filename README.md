# Persian Lexical Search | جستجوی ویژگی‌های واژگانی فارسی

A static GitHub Pages web app for looking up psycholinguistic metrics of Persian words.

## Features

- **Single words or batch lists** — type directly or upload a `.txt` file (one word per line)
- **Full lexicon lookup** (62,041 words) returning:
  - Frequency (`PerMilFreq`, Zipf)
  - Word length, average phonological length, syllable count
  - GPC / PGC entropy at word, grapheme, onset, rime, and OVC levels
  - Orthographic Uncertainty (OU, OUF, OUB, MAX/MIN variants)
  - Phonological Uncertainty (PU, PUF, PUB, MAX/MIN variants)
  - OU–PU mismatch indices
  - Semantic neighbourhood metrics (SN_k25, SN_k50, Entropy β5/β10, Dispersion, Hubness, Clustering Coefficient)
- **Out-of-lexicon fallback** — for words not in the lexicon, OU is computed on the fly from pre-built prefix/suffix tables; frequency is looked up from a 320 K-word frequency list
- **Column group toggles** — show/hide metric groups
- **Export** — download results as UTF-8 TSV

## Metrics based on

- **Orthographic / Phonological Uncertainty**: Westbury, C., & Yang, M. (2025). Orthographic uncertainty: An entropy-based measure of word form typicality. *The Mental Lexicon, 19*(3), 439–495. https://doi.org/10.1075/ml.24006.wes
- **Lexicon & Neighbourhood**: Nemati, F., Westbury, C., Hollis, G., & Haghbin, H. (2022). The Persian Lexicon project: Minimized orthographic neighbourhood effects in a dense language. *Journal of Psycholinguistic Research, 51*(5), 957–979. https://doi.org/10.1007/s10936-022-09863-x
- **Affective Norms (E-PLAN)**: Nemati, F., Westbury, C., Rostami, H., et al. (2026). Extrapolated Persian Lexical Affect Norms (E-PLAN) from best–worst judgments of valence, arousal, dominance, and concreteness. *Behavior Research Methods, 58*, 111. https://doi.org/10.3758/s13428-026-02963-9
- **GPC / PGC entropy**: Shannon entropy of grapheme-to-phoneme and phoneme-to-grapheme mappings derived from forced-alignment data.
- **Semantic neighbourhood**: Cosine similarity in word2vec PCA space (k=25/50 nearest neighbours).

## Repository structure

```
├── index.html              Web app entry point
├── app.js                  Lookup logic + in-browser OU computation
├── style.css               RTL-aware styling
├── data/
│   ├── lexicon_data.tsv    Pre-built lookup table (~20 MB raw, ~4 MB gzipped)
│   ├── ou_prefix.tsv       Prefix → sum-frequency table
│   ├── ou_suffix.tsv       Suffix → sum-frequency table
│   ├── ou_meta.json        Total frequency scalar
│   ├── pu_prefix.tsv       Phoneme-prefix → sum-frequency table
│   ├── pu_suffix.tsv       Phoneme-suffix → sum-frequency table
│   ├── pu_meta.json        Phoneme total frequency scalar
│   └── word_frequencies_public.tsv  Frequency fallback (320 K words)
└── build/
    └── build_web_data.py   Offline preprocessing script (re-run when lexicon updates)
```

## Publishing to GitHub Pages

```bash
git init
git add .
git commit -m "Initial Persian Lexical Search app"
git remote add origin https://github.com/<your-username>/PersianLexiconProject.git
git push -u origin main
```

Then in the repository **Settings → Pages**, set the source to **GitHub Actions**. The included workflow (`.github/workflows/static.yml`) will deploy automatically on every push to `main`.

## Updating the data

When the underlying lexicon changes, re-run the build script:

```bash
# Edit LEXICON_FILE / FREQ_TSV paths in build/build_web_data.py if needed
python build/build_web_data.py
```

This rewrites all files in `data/`. Commit and push to trigger a re-deployment.

## Privacy

All processing is done locally in the browser. No word queries are sent to any server.
