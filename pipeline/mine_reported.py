"""Text-mine the largest reported patient series for every disease x country pair.

For each pair we pull up to MAX_HITS Europe PMC abstracts (title/abstract mention the disease AND
the country), split them into sentences and look for patient counts ("42 patients with PKU",
"twenty-three Tunisian children affected by XP" ...). The largest count in a sentence that names the
disease is kept, together with the verbatim sentence and the PMID, so every number is checkable.

This is a *lower bound* on diagnosed patients (one study), not a registry count. Sentences about
screened populations, controls, carriers or newborn totals are rejected. Results are cached.
"""
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import COUNTRIES, DISEASES, SEARCH_TERMS
from fetch_context import DEMONYMS

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "reported.json"
MAX_HITS = 300
WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())}
WORDS.update({"thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90})
NUM = r"(\d{1,4}(?:,\d{3})?|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|" \
      r"one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)"
UNIT = r"(patients|children|cases|probands|individuals|subjects|infants|newborns|families|siblings|sibs|adults|boys|girls)"
COUNT_RE = re.compile(rf"\b{NUM}\s+(?:[A-Za-z-]+\s+){{0,4}}?{UNIT}\b", re.I)
REJECT = re.compile(r"\b(screened|screening of|controls?|healthy|carriers?|blood donors|volunteers|population sample|"
                    r"general population|births|deliveries|questionnaire|respondents|physicians|doctors|nurses|parents of|"
                    r"suspected|symptomatic|referred|tested|investigated for|evaluated for|autism|autistic|"
                    r"intellectual disability|mental retardation|developmental delay|hearing-impaired|deaf children)\b", re.I)
# "48 children with Wilson disease": the disease must follow the unit through one of these links.
LINK = re.compile(r"^\s*(?:[A-Za-z-]+\s+){0,2}?(?:with|affected by|suffering from|diagnosed with|having|presenting with)\b", re.I)
RAW_CACHE = Path(__file__).resolve().parent.parent / "data" / "raw" / "reported_abstracts.json.gz"


def to_int(token: str) -> int | None:
    t = token.lower().replace(",", "")
    if t.isdigit():
        n = int(t)
        return None if 1900 <= n <= 2100 else n  # years are not cohorts
    parts = re.split(r"[- ]", t)
    total = 0
    for p in parts:
        if p not in WORDS:
            return None
        total += WORDS[p]
    return total


def best_count(abstract: str, terms: list[str], places: list[str], title: str = "") -> tuple[int, str, str] | None:
    """Largest patient count whose phrase names the disease, in a sentence (or title) naming the country.

    Accepted shapes: "42 Tunisian PKU patients" (disease inside the count phrase) or
    "48 children with Wilson disease" (disease right after with / affected by / diagnosed with ...).
    """
    tl = [t.lower() for t in terms]
    pl = [p.lower() for p in places]
    title_has_place = any(p in title.lower() for p in pl)
    best = None
    for sent in re.split(r"(?<=[.;!?])\s+(?=[A-Z(<])", re.sub(r"<[^>]+>", " ", abstract)):
        low = sent.lower()
        if not any(t in low for t in tl) or REJECT.search(sent):
            continue
        if not (title_has_place or any(p in low for p in pl)):
            continue
        for m in COUNT_RE.finditer(sent):
            n = to_int(m.group(1))
            if n is None or n < 1 or n > 5000:
                continue
            unit = m.group(2).lower()
            if unit == "newborns":
                continue
            inside = sent[m.start():m.end()].lower()
            after = sent[m.end():m.end() + 90]
            named = any(t in inside for t in tl) or (LINK.match(after) is not None and any(t in after.lower() for t in tl))
            if not named:
                continue
            if best is None or n > best[0]:
                best = (n, unit, sent.strip())
    return best


def search(client: httpx.Client, query: str) -> list[dict]:
    hits, cursor = [], "*"
    while len(hits) < MAX_HITS:
        for attempt in range(4):
            try:
                r = client.get("https://www.ebi.ac.uk/europepmc/webservices/rest/search", params={
                    "query": query, "format": "json", "resultType": "core", "pageSize": 100, "cursorMark": cursor})
                r.raise_for_status()
                body = r.json()
                break
            except (httpx.HTTPError, ValueError):
                if attempt == 3:
                    raise
                time.sleep(3 * (attempt + 1))
        page = body.get("resultList", {}).get("result", [])
        hits.extend(page)
        nxt = body.get("nextCursorMark")
        if not page or not nxt or nxt == cursor:
            break
        cursor = nxt
    return hits[:MAX_HITS]


def main() -> None:
    import gzip
    raw = json.loads(gzip.decompress(RAW_CACHE.read_bytes())) if RAW_CACHE.exists() else {}
    out = {"pairs": {}}
    with httpx.Client(timeout=60, headers={"User-Agent": "UNSEEN-hackathon/0.2"}) as client:
        for d in DISEASES:
            terms = SEARCH_TERMS[d["id"]]
            for c in COUNTRIES:
                key = f"{d['id']}|{c['iso3']}"
                if key not in raw:
                    place = " OR ".join(f'TITLE_ABS:"{t}"' for t in DEMONYMS[c["iso3"]])
                    q = "(" + " OR ".join(f'TITLE_ABS:"{t}"' for t in terms) + f") AND ({place})"
                    raw[key] = [{"pmid": h.get("pmid"), "title": h.get("title") or "", "abstract": h.get("abstractText") or "",
                                 "year": h.get("pubYear"), "journal": h.get("journalTitle")} for h in search(client, q)]
                best = None
                for h in raw[key]:
                    found = best_count(h["abstract"], terms, DEMONYMS[c["iso3"]], h["title"])
                    if found and (best is None or found[0] > best["n"]):
                        best = {"n": found[0], "unit": found[1], "sentence": found[2], "pmid": h["pmid"], "title": h["title"],
                                "year": h["year"], "journal": h["journal"],
                                "url": f"https://europepmc.org/article/MED/{h['pmid']}" if h["pmid"] else None}
                out["pairs"][key] = {"abstracts_scanned": len(raw[key]), "best": best}
            print(f"{d['id']}: done", flush=True)
            RAW_CACHE.write_bytes(gzip.compress(json.dumps(raw).encode("utf-8")))
    out["retrieved_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
