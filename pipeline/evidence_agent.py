"""UNSEEN evidence agent: an OpenAI tool-calling researcher that mines the literature for what gnomAD
misses — local founder variants, regional allele frequencies and diagnosed patient series.

Trust model: the model may *propose* findings, but a finding is only kept if
  1. its quote appears verbatim (whitespace/case-insensitive) in text the agent actually retrieved, and
  2. the number it reports appears inside that quote.
Everything else is written to `rejected`. Verified findings are merged into the atlas by compute.py.

Usage:  OPENAI_API_KEY=... python evidence_agent.py [disease|country ...] [--pairs 10]
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import COUNTRIES, DISEASES, SEARCH_TERMS

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "evidence" / "agent_findings.json"
ATLAS = ROOT / "web" / "public" / "data" / "atlas.json"
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
MAX_STEPS = 14
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"

SYSTEM = """You are a genetic epidemiologist building an evidence base for UNSEEN, an atlas of undiagnosed
rare-disease patients. For the given disease and country, find in the literature:
  - founder_variant: a variant reported as frequent/founder in that country (give its allele frequency if stated),
  - allele_frequency: a pathogenic allele or carrier frequency measured in that country's population,
  - patient_series: the number of diagnosed patients reported in that country.
Use search_literature, then read_fulltext / read_abstract on the most relevant papers. Record each finding with
record_finding. The quote MUST be copied verbatim from text a tool returned, and MUST contain the number you
report. Prefer population-based studies and national cohorts. Stop when you have the key findings (max ~6)
by replying with a one-line summary and no tool call. Never invent; if nothing is found, say so."""

TOOLS = [
    {"type": "function", "function": {
        "name": "search_literature", "description": "Search Europe PMC. Returns up to 8 papers (pmid, pmcid, title, year, abstract excerpt).",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "read_abstract", "description": "Full abstract of a paper by PMID.",
        "parameters": {"type": "object", "properties": {"pmid": {"type": "string"}}, "required": ["pmid"]}}},
    {"type": "function", "function": {
        "name": "read_fulltext", "description": "Open-access full text (by PMCID), filtered to paragraphs mentioning frequencies, founders, mutations or patients.",
        "parameters": {"type": "object", "properties": {"pmcid": {"type": "string"}}, "required": ["pmcid"]}}},
    {"type": "function", "function": {
        "name": "record_finding", "description": "Record one evidence finding with a verbatim quote.",
        "parameters": {"type": "object", "properties": {
            "type": {"type": "string", "enum": ["founder_variant", "allele_frequency", "patient_series"]},
            "pmid": {"type": "string"}, "variant": {"type": "string"},
            "value": {"type": "number"}, "unit": {"type": "string", "description": "e.g. 'patients', '% of alleles', 'carrier frequency'"},
            "quote": {"type": "string"}},
            "required": ["type", "pmid", "value", "unit", "quote"]}}},
]


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip().lower()


def number_in_quote(value: float, quote: str) -> bool:
    """The reported number must literally appear in the quote (allowing %, decimals and thousand separators)."""
    q = quote.replace(",", "").replace(" ", "")
    candidates = {f"{value:g}", f"{value:.1f}", f"{value:.2f}", f"{value:.3f}", str(int(value)) if float(value).is_integer() else f"{value:g}"}
    if 0 < value < 1:
        candidates |= {f"{value * 100:g}", f"{value * 100:.1f}"}
    return any(re.search(rf"(?<![\d.]){re.escape(c)}(?![\d])", q) for c in candidates)


def verify(finding: dict, corpus: dict[str, str]) -> tuple[bool, str]:
    text = corpus.get(str(finding.get("pmid")))
    if not text:
        return False, "quote source was never retrieved"
    if norm(finding.get("quote", "")) not in norm(text):
        return False, "quote not found verbatim in the retrieved text"
    if not number_in_quote(float(finding.get("value", "nan")), finding["quote"]):
        return False, "reported value does not appear in the quote"
    return True, "verified"


class Researcher:
    def __init__(self, client: httpx.Client):
        self.http = client
        self.corpus: dict[str, str] = {}  # pmid -> all text retrieved for it

    def _remember(self, pmid: str | None, text: str) -> None:
        if pmid:
            self.corpus[pmid] = self.corpus.get(pmid, "") + "\n" + text

    def search_literature(self, query: str) -> dict:
        r = self.http.get(f"{EPMC}/search", params={"query": query, "format": "json", "resultType": "core", "pageSize": 8})
        out = []
        for h in r.json().get("resultList", {}).get("result", []):
            abstract = re.sub(r"<[^>]+>", " ", h.get("abstractText") or "")
            self._remember(h.get("pmid"), (h.get("title") or "") + "\n" + abstract)
            out.append({"pmid": h.get("pmid"), "pmcid": h.get("pmcid"), "title": h.get("title"), "year": h.get("pubYear"),
                        "abstract_excerpt": abstract[:700]})
        return {"results": out}

    def read_abstract(self, pmid: str) -> dict:
        r = self.http.get(f"{EPMC}/search", params={"query": f"EXT_ID:{pmid} AND SRC:MED", "format": "json", "resultType": "core"})
        hits = r.json().get("resultList", {}).get("result", [])
        if not hits:
            return {"error": "not found"}
        abstract = re.sub(r"<[^>]+>", " ", hits[0].get("abstractText") or "")
        self._remember(pmid, abstract)
        return {"pmid": pmid, "title": hits[0].get("title"), "abstract": abstract}

    def read_fulltext(self, pmcid: str) -> dict:
        r = self.http.get(f"{EPMC}/{pmcid}/fullTextXML")
        if r.status_code != 200:
            return {"error": "no open-access full text"}
        xml = r.text
        pmid = (re.search(r'<article-id pub-id-type="pmid">(\d+)</article-id>', xml) or [None, None])[1]
        paras = [norm(p) for p in re.findall(r"<p>(.*?)</p>", xml, re.S)]
        keep = [p for p in paras if re.search(r"frequen|founder|mutation|variant|allele|patients|carrier|prevalence", p)]
        text = "\n".join(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", p)) for p in re.findall(r"<p>(.*?)</p>", xml, re.S)
                         if re.search(r"frequen|founder|mutation|variant|allele|patients|carrier|prevalence", p, re.I))
        self._remember(pmid, text)
        return {"pmid": pmid, "paragraphs": len(keep), "text": text[:9000]}

    def call(self, name: str, args: dict) -> dict:
        try:
            return getattr(self, name)(**args)
        except (httpx.HTTPError, TypeError, ValueError, AttributeError) as e:
            return {"error": f"{type(e).__name__}: {e}"}


def openai(client: httpx.Client, key: str, messages: list[dict]) -> dict:
    body = {"model": MODEL, "messages": messages, "tools": TOOLS, "tool_choice": "auto"}
    if re.match(r"^(gpt-5|o\d)", MODEL):
        body["reasoning_effort"] = "medium"
    r = client.post("https://api.openai.com/v1/chat/completions", json=body,
                    headers={"Authorization": f"Bearer {key}"}, timeout=180)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]


def research_pair(client: httpx.Client, key: str, disease: dict, country: dict, hint: dict | None) -> tuple[list, list]:
    res = Researcher(client)
    terms = " OR ".join(f'"{t}"' for t in SEARCH_TERMS[disease["id"]])
    user = (f"Disease: {disease['name']} (genes {', '.join(disease['genes'])}). Country: {country['name']}.\n"
            f"Suggested first search: ({terms}) AND \"{country['name']}\".")
    if hint:
        user += f"\nA text-miner found this candidate patient series (confirm or correct it): PMID {hint.get('pmid')}: \"{hint.get('sentence')}\""
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]
    proposed = []
    for _ in range(MAX_STEPS):
        msg = openai(client, key, messages)
        messages.append(msg)
        if not msg.get("tool_calls"):
            break
        for tc in msg["tool_calls"]:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            if name == "record_finding":
                proposed.append(args)
                result = {"recorded": True}
            else:
                result = res.call(name, args)
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result)[:12000]})
    verified, rejected = [], []
    for f in proposed:
        ok, why = verify(f, res.corpus)
        rec = {**f, "disease": disease["id"], "country": country["iso3"], "check": why,
               "url": f"https://europepmc.org/article/MED/{f.get('pmid')}"}
        (verified if ok else rejected).append(rec)
    return verified, rejected


def pick_pairs(args: list[str], n: int) -> list[tuple[dict, dict]]:
    atlas = json.loads(ATLAS.read_text(encoding="utf-8"))
    want = {a.lower() for a in args}
    pairs = []
    for p in sorted(atlas["pairs"], key=lambda p: -p["expected_births"]["median"] / max(p["attention_ratio"] or 0.02, 0.02)):
        d = next(x for x in DISEASES if x["id"] == p["disease"])
        c = next(x for x in COUNTRIES if x["iso3"] == p["country"])
        if want and not ({d["id"], c["iso3"].lower(), c["name"].lower()} & want):
            continue
        pairs.append((d, c, p["reported"]["best"]))
    return pairs[:n]


def main() -> None:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("Set OPENAI_API_KEY to run the evidence agent (the atlas works without it).")
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    n = int(sys.argv[sys.argv.index("--pairs") + 1]) if "--pairs" in sys.argv else 10
    argv = [a for a in argv if not a.isdigit()]
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"findings": [], "rejected": []}
    with httpx.Client(timeout=60, headers={"User-Agent": "UNSEEN-evidence-agent/0.3"}) as client:
        for d, c, hint in pick_pairs(argv, n):
            print(f"researching {d['name']} in {c['name']} …", flush=True)
            v, r = research_pair(client, key, d, c, hint)
            existing["findings"] = [f for f in existing["findings"] if not (f["disease"] == d["id"] and f["country"] == c["iso3"])] + v
            existing["rejected"] = [f for f in existing["rejected"] if not (f["disease"] == d["id"] and f["country"] == c["iso3"])] + r
            print(f"  {len(v)} verified, {len(r)} rejected", flush=True)
    existing.update({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": MODEL})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(existing, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
