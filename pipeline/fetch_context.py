"""Fetch the non-genetic context for every disease x country pair (all cached).

- Orphanet: verify each ORPHA code resolves to the expected disease name
- World Bank: crude birth rate x population -> annual births
- Europe PMC: number of papers whose title/abstract mention the disease AND the country
- ClinicalTrials.gov: recruiting / not-yet-recruiting trials with a site in the country
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from config import COUNTRIES, DISEASES, SEARCH_TERMS

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "context.json"
NOW = datetime.now(timezone.utc).isoformat(timespec="seconds")

DEMONYMS = {
    "TUN": ["Tunisia", "Tunisian"], "MAR": ["Morocco", "Moroccan"], "DZA": ["Algeria", "Algerian"],
    "LBY": ["Libya", "Libyan"], "EGY": ["Egypt", "Egyptian"], "SDN": ["Sudan", "Sudanese"],
    "SAU": ["Saudi Arabia", "Saudi"], "YEM": ["Yemen", "Yemeni"], "JOR": ["Jordan", "Jordanian"],
    "IRQ": ["Iraq", "Iraqi"], "PAK": ["Pakistan", "Pakistani"], "IRN": ["Iran", "Iranian"],
    "TUR": ["Turkey", "Turkish"], "IND": ["India", "Indian"], "FRA": ["France", "French"],
    "DEU": ["Germany", "German"], "GBR": ["United Kingdom", "British"], "USA": ["United States", "American"],
}


def get_json(client: httpx.Client, url: str, **kw) -> dict | list:
    for attempt in range(4):
        try:
            r = client.get(url, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                raise httpx.HTTPStatusError("retryable", request=r.request, response=r)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError):
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def orphanet(client: httpx.Client) -> dict:
    out = {}
    for d in DISEASES:
        url = f"https://api.orphacode.org/EN/ClinicalEntity/orphacode/{d['orpha']}/Name"
        body = get_json(client, url, headers={"apiKey": "unseen-hackathon"})
        out[d["id"]] = {"orpha": d["orpha"], "preferred_term": body.get("Preferred term"),
                        "url": f"https://www.orpha.net/en/disease/detail/{d['orpha']}"}
        print(f"ORPHA:{d['orpha']:<6} {d['name']:<40} -> {out[d['id']]['preferred_term']}")
    return out


def births(client: httpx.Client) -> dict:
    out = {}
    for c in COUNTRIES:
        base = f"https://api.worldbank.org/v2/country/{c['iso3']}/indicator"
        cbr = get_json(client, f"{base}/SP.DYN.CBRT.IN?format=json&mrnev=1")[1][0]
        pop = get_json(client, f"{base}/SP.POP.TOTL?format=json&mrnev=1")[1][0]
        n = cbr["value"] / 1000 * pop["value"]
        out[c["iso3"]] = {
            "births_per_year": round(n),
            "crude_birth_rate": cbr["value"], "cbr_year": cbr["date"],
            "population": pop["value"], "pop_year": pop["date"],
            "source": "World Bank WDI (SP.DYN.CBRT.IN x SP.POP.TOTL)",
            "url": f"https://data.worldbank.org/indicator/SP.DYN.CBRT.IN?locations={c['iso3']}",
        }
        print(f"{c['iso3']}: {n:,.0f} births/yr (CBR {cbr['date']})")
    return out


def literature(client: httpx.Client) -> dict:
    out = {}
    for d in DISEASES:
        for c in COUNTRIES:
            place = " OR ".join(f'TITLE_ABS:"{t}"' for t in DEMONYMS[c["iso3"]])
            terms = " OR ".join(f'TITLE_ABS:"{t}"' for t in SEARCH_TERMS[d["id"]])
            q = f"({terms}) AND ({place})"
            body = get_json(client, "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                            params={"query": q, "format": "json", "pageSize": 1})
            out[f"{d['id']}|{c['iso3']}"] = {
                "papers": body["hitCount"], "query": q,
                "url": "https://europepmc.org/search?query=" + httpx.QueryParams({"q": q})["q"].replace(" ", "%20"),
            }
        print(f"papers: {d['id']} done")
    return out


def trials(client: httpx.Client) -> dict:
    out = {}
    for d in DISEASES:
        cond = SEARCH_TERMS[d["id"]][0]
        for c in COUNTRIES:
            body = get_json(client, "https://clinicaltrials.gov/api/v2/studies", params={
                "query.cond": cond, "query.locn": DEMONYMS[c["iso3"]][0],
                "filter.overallStatus": "RECRUITING,NOT_YET_RECRUITING",
                "countTotal": "true", "pageSize": 1,
            })
            out[f"{d['id']}|{c['iso3']}"] = {
                "open_trials": body.get("totalCount", 0),
                "url": f"https://clinicaltrials.gov/search?cond={cond.replace(' ', '%20')}&locStr={DEMONYMS[c['iso3']][0].replace(' ', '%20')}&aggFilters=status:rec%20not",
            }
        print(f"trials: {d['id']} done")
    return out


def main() -> None:
    with httpx.Client(timeout=60, headers={"User-Agent": "UNSEEN-hackathon/0.1"}) as client:
        ctx = {"retrieved_at": NOW, "orphanet": orphanet(client), "births": births(client),
               "literature": literature(client), "trials": trials(client)}
    OUT.write_text(json.dumps(ctx, indent=1), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
