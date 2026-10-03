"""UNSEEN pipeline configuration.

Every non-computed input carries a citation. Values marked kind="inferred" are
modelling assumptions that we state openly in the UI.
"""

METHOD_VERSION = "0.2.0"

# Literature search synonyms (Europe PMC title/abstract). The first term is also the ClinicalTrials.gov condition.
SEARCH_TERMS = {
    "pku": ["phenylketonuria", "hyperphenylalaninemia", "hyperphenylalaninaemia"],
    "cf": ["cystic fibrosis"],
    "wilson": ["Wilson disease", "Wilson's disease", "hepatolenticular degeneration"],
    "pompe": ["Pompe disease", "glycogen storage disease type II", "acid maltase deficiency"],
    "mps1": ["mucopolysaccharidosis type I", "mucopolysaccharidosis I", "Hurler syndrome", "MPS I"],
    "taysachs": ["Tay-Sachs", "GM2 gangliosidosis"],
    "sandhoff": ["Sandhoff disease", "Sandhoff"],
    "mld": ["metachromatic leukodystrophy"],
    "krabbe": ["Krabbe disease", "globoid cell leukodystrophy"],
    "npc": ["Niemann-Pick disease type C", "Niemann-Pick type C", "NPC1"],
    "xp": ["xeroderma pigmentosum"],
    "at": ["ataxia telangiectasia", "ataxia-telangiectasia"],
    "lgmdr1": ["calpainopathy", "LGMD2A", "LGMDR1", "CAPN3"],
    "msud": ["maple syrup urine disease"],
    "galt": ["galactosemia", "galactosaemia"],
    "hcu": ["homocystinuria"],
    "mcad": ["medium-chain acyl-CoA dehydrogenase deficiency", "MCAD deficiency", "MCADD"],
    "ga1": ["glutaric aciduria type 1", "glutaric acidemia type 1", "glutaric aciduria type I", "glutaric acidemia type I"],
    "pa": ["propionic acidemia", "propionic aciduria", "propionic acidaemia"],
    "mma": ["methylmalonic acidemia", "methylmalonic aciduria", "methylmalonic acidaemia"],
    "ph1": ["primary hyperoxaluria"],
    "dfnb1": ["GJB2", "connexin 26", "DFNB1"],
}
GNOMAD_DATASET = "gnomad_r4"
GNOMAD_GROUPS = ["afr", "amr", "asj", "eas", "fin", "mid", "nfe", "sas"]
MAX_VARIANT_AF = 0.02  # artefact / low-penetrance guard: drop any qualifying variant above this overall AF
MAX_UNCLASSIFIED_LOF_AF = 0.001  # LoF calls with no ClinVar record must be rare in every group (artefact guard)

# Well-established disease alleles that ClinVar currently lists as "conflicting" because of
# outlier submissions. Included on purpose and labelled "curated" in the UI.
CURATED_PATHOGENIC = {
    "GALT": {"c.563A>G": "p.Gln188Arg: the most common classic-galactosemia allele in Europeans"},
}

# Variants classified pathogenic in ClinVar but with reduced / variable penetrance. Counting them
# would estimate "carriers of a risk genotype", not affected children. Excluded on purpose.
LOW_PENETRANCE = {
    "CFTR": {"c.1210-7_1210-6del": "Poly-T 5T allele: variable penetrance (CFTR-related disorder, rarely classic CF)",
             "c.1210-11T>G": "TG-tract variant modifying 5T: variable penetrance",
             "c.350G>A": "p.Arg117His: 'varying clinical consequence' in CFTR2"},
    "GJB2": {"c.101T>C": "p.Met34Thr: reduced penetrance, mild phenotype",
             "c.109G>A": "p.Val37Ile: reduced penetrance, mild phenotype"},
}
MC_SAMPLES = 4000
RANDOM_SEED = 7

# Autosomal-recessive diseases whose causal variants are mostly SNVs/indels,
# so short-read gnomAD frequencies are meaningful.
DISEASES = [
    {"id": "pku", "orpha": 716, "name": "PKU / PAH deficiency", "genes": ["PAH"], "search": "phenylketonuria", "group": "Metabolic", "screenable": True,
     "caveat": "Counts the whole PAH-deficiency spectrum (classic PKU + milder hyperphenylalaninemia), like German screening statistics do."},
    {"id": "cf", "orpha": 586, "name": "Cystic fibrosis", "genes": ["CFTR"], "search": "cystic fibrosis", "group": "Respiratory", "screenable": True},
    {"id": "wilson", "orpha": 905, "name": "Wilson disease", "genes": ["ATP7B"], "search": "Wilson disease", "group": "Metabolic", "screenable": False},
    {"id": "pompe", "orpha": 365, "name": "Pompe disease (GSD II)", "genes": ["GAA"], "search": "Pompe disease", "group": "Lysosomal", "screenable": True},
    {"id": "mps1", "orpha": 579, "name": "Mucopolysaccharidosis type I", "genes": ["IDUA"], "search": "mucopolysaccharidosis type I", "group": "Lysosomal", "screenable": True},
    {"id": "taysachs", "orpha": 845, "name": "Tay-Sachs disease", "genes": ["HEXA"], "search": "Tay-Sachs", "group": "Lysosomal", "screenable": False},
    {"id": "sandhoff", "orpha": 796, "name": "Sandhoff disease", "genes": ["HEXB"], "search": "Sandhoff disease", "group": "Lysosomal", "screenable": False},
    {"id": "mld", "orpha": 512, "name": "Metachromatic leukodystrophy", "genes": ["ARSA"], "search": "metachromatic leukodystrophy", "group": "Lysosomal", "screenable": True},
    {"id": "krabbe", "orpha": 487, "name": "Krabbe disease", "genes": ["GALC"], "search": "Krabbe disease", "group": "Lysosomal", "screenable": True,
     "caveat": "The common 30-kb GALC deletion is not captured by SNV data, so estimates are a lower bound."},
    {"id": "npc", "orpha": 646, "name": "Niemann-Pick disease type C", "genes": ["NPC1", "NPC2"], "search": "Niemann-Pick type C", "group": "Lysosomal", "screenable": False},
    {"id": "xp", "orpha": 910, "name": "Xeroderma pigmentosum (XPA/XPC)", "genes": ["XPA", "XPC"], "search": "xeroderma pigmentosum", "group": "Skin / DNA repair", "screenable": False},
    {"id": "at", "orpha": 100, "name": "Ataxia-telangiectasia", "genes": ["ATM"], "search": "ataxia telangiectasia", "group": "Neurological", "screenable": False},
    {"id": "lgmdr1", "orpha": 267, "name": "Calpainopathy (LGMD R1)", "genes": ["CAPN3"], "search": "calpainopathy", "group": "Neuromuscular", "screenable": False,
     "caveat": "Includes the intronic c.1746-20C>G allele (ClinVar pathogenic, frequent in Northern Europe); penetrance is debated, so estimates may run high."},
    {"id": "msud", "orpha": 511, "name": "Maple syrup urine disease", "genes": ["BCKDHA", "BCKDHB", "DBT"], "search": "maple syrup urine disease", "group": "Metabolic", "screenable": True},
    {"id": "galt", "orpha": 79239, "name": "Classic galactosemia", "genes": ["GALT"], "search": "galactosemia", "group": "Metabolic", "screenable": True},
    {"id": "hcu", "orpha": 394, "name": "Classic homocystinuria", "genes": ["CBS"], "search": "homocystinuria", "group": "Metabolic", "screenable": True,
     "caveat": "The common p.Ile278Thr allele is missing from gnomAD's GRCh38 calls (the CBS region is duplicated in the reference), so estimates are a lower bound."},
    {"id": "mcad", "orpha": 42, "name": "MCAD deficiency", "genes": ["ACADM"], "search": "medium-chain acyl-CoA dehydrogenase deficiency", "group": "Metabolic", "screenable": True},
    {"id": "ga1", "orpha": 25, "name": "Glutaric acidemia type 1", "genes": ["GCDH"], "search": "glutaric aciduria type 1", "group": "Metabolic", "screenable": True},
    {"id": "pa", "orpha": 35, "name": "Propionic acidemia", "genes": ["PCCA", "PCCB"], "search": "propionic acidemia", "group": "Metabolic", "screenable": True},
    {"id": "mma", "orpha": 27, "name": "Methylmalonic acidemia (MMUT)", "genes": ["MMUT"], "search": "methylmalonic acidemia", "group": "Metabolic", "screenable": True},
    {"id": "ph1", "orpha": 93598, "name": "Primary hyperoxaluria type 1", "genes": ["AGXT"], "search": "primary hyperoxaluria type 1", "group": "Renal", "screenable": False},
    {"id": "dfnb1", "orpha": 90636, "name": "GJB2-related deafness (DFNB1)", "genes": ["GJB2"], "search": "GJB2 deafness", "group": "Hearing", "screenable": True},
]

# Shown in the UI as "not estimable with this method" — honesty is a feature.
EXCLUDED = [
    {"name": "Spinal muscular atrophy", "genes": ["SMN1"], "reason": "Caused mostly by whole-exon deletions that short-read SNV frequencies do not capture."},
    {"name": "Friedreich ataxia", "genes": ["FXN"], "reason": "Caused by a GAA repeat expansion, invisible to SNV data."},
    {"name": "Congenital adrenal hyperplasia", "genes": ["CYP21A2"], "reason": "Pseudogene conversions make short-read frequencies unreliable."},
    {"name": "Gaucher disease", "genes": ["GBA1"], "reason": "A nearby pseudogene makes short-read frequencies unreliable."},
    {"name": "Familial Mediterranean fever", "genes": ["MEFV"], "reason": "Low/variable penetrance and disputed variant classifications."},
    {"name": "Alpha-thalassemia", "genes": ["HBA1", "HBA2"], "reason": "Mostly gene deletions, not SNVs."},
]

TADMOURI = {
    "label": "Tadmouri et al. 2009, Reproductive Health 6:17 (Table 1)",
    "url": "https://doi.org/10.1186/1742-4755-6-17",
}
BITTLES = {
    "label": "Bittles & Black 2010, PNAS — <1% of marriages consanguineous in Western Europe / North America",
    "url": "https://ro.ecu.edu.au/ecuworks/6502/",
}

# first_cousin / overall = percent of marriages, as [low, high] ranges from the source.
# first_cousin None => only an overall rate exists; first-cousin share is then inferred.
COUNTRIES = [
    {"iso3": "TUN", "name": "Tunisia", "first_cousin": [17.4, 23], "overall": [20.1, 39.3], "src": TADMOURI,
     "ancestry": {"mid": 0.7, "nfe": 0.2, "afr": 0.1}},
    {"iso3": "MAR", "name": "Morocco", "first_cousin": [8.6, 10], "overall": [19.9, 28], "src": TADMOURI,
     "ancestry": {"mid": 0.7, "nfe": 0.2, "afr": 0.1}},
    {"iso3": "DZA", "name": "Algeria", "first_cousin": [11.3, 11.3], "overall": [22.6, 34], "src": TADMOURI,
     "ancestry": {"mid": 0.7, "nfe": 0.2, "afr": 0.1}},
    {"iso3": "LBY", "name": "Libya", "first_cousin": None, "overall": [48.4, 48.4], "src": TADMOURI,
     "ancestry": {"mid": 0.75, "nfe": 0.1, "afr": 0.15}},
    {"iso3": "EGY", "name": "Egypt", "first_cousin": [14.3, 23.2], "overall": [20.9, 32.8], "src": TADMOURI,
     "ancestry": {"mid": 0.8, "nfe": 0.1, "afr": 0.1}},
    {"iso3": "SDN", "name": "Sudan", "first_cousin": [44.2, 49.5], "overall": [44.2, 63.3], "src": TADMOURI,
     "ancestry": {"mid": 0.5, "afr": 0.5}},
    {"iso3": "SAU", "name": "Saudi Arabia", "first_cousin": [24.6, 42.3], "overall": [42.1, 66.7], "src": TADMOURI,
     "ancestry": {"mid": 1.0}},
    {"iso3": "YEM", "name": "Yemen", "first_cousin": [32, 34], "overall": [40, 44.7], "src": TADMOURI,
     "ancestry": {"mid": 0.9, "afr": 0.1}},
    {"iso3": "JOR", "name": "Jordan", "first_cousin": [19.5, 39], "overall": [28.5, 63.7], "src": TADMOURI,
     "ancestry": {"mid": 1.0}},
    {"iso3": "IRQ", "name": "Iraq", "first_cousin": [29, 33], "overall": [47, 60], "src": TADMOURI,
     "ancestry": {"mid": 1.0}},
    {"iso3": "PAK", "name": "Pakistan", "first_cousin": [50, 50], "overall": [50, 64],
     "src": {"label": "Pakistan DHS 2017-18 Key Findings: 'Half of all marriages occur between first cousins'", "url": "https://dhsprogram.com/pubs/pdf/SR257/SR257.pdf"},
     "ancestry": {"sas": 1.0}},
    {"iso3": "IRN", "name": "Iran", "first_cousin": [27.9, 27.9], "overall": [38.6, 38.6],
     "src": {"label": "Saadat et al. 2004, Annals of Human Biology 31(2) — 38.6% consanguineous, 27.9% first cousins (n=306,343 couples)", "url": "https://doi.org/10.1080/03014460310001652211"},
     "ancestry": {"mid": 0.6, "sas": 0.3, "nfe": 0.1}},
    {"iso3": "TUR", "name": "Turkey", "first_cousin": [16.8, 18.3], "overall": [22, 24],
     "src": {"label": "Turkish DHS series: consanguinity 22-24%, ~76% of it first-cousin (2008)", "url": "https://www.cambridge.org/core/journals/journal-of-biosocial-science/article/abs/prevalence-of-consanguineous-marriages-and-affecting-factors-in-turkey-a-national-survey/3E14E2D39723ED4B126685003443417D"},
     "ancestry": {"mid": 0.4, "nfe": 0.6}},
    {"iso3": "IND", "name": "India", "first_cousin": None, "overall": [7.5, 9.3],
     "src": {"label": "NFHS-1 to NFHS-4 analysis: national consanguinity fell from 9.3% to 7.5%", "url": "https://www.cambridge.org/core/journals/journal-of-biosocial-science/article/has-the-longpredicted-decline-in-consanguineous-marriage-in-india-occurred/F3A8CAE2EAA8C011ECD7084A3ECFB2BC"},
     "ancestry": {"sas": 1.0}},
    {"iso3": "FRA", "name": "France", "first_cousin": None, "overall": [0.1, 1.0], "src": BITTLES,
     "ancestry": {"nfe": 1.0}},
    {"iso3": "DEU", "name": "Germany", "first_cousin": None, "overall": [0.1, 1.0], "src": BITTLES,
     "ancestry": {"nfe": 1.0}},
    {"iso3": "GBR", "name": "United Kingdom", "first_cousin": None, "overall": [0.1, 1.0], "src": BITTLES,
     "ancestry": {"nfe": 0.9, "sas": 0.06, "afr": 0.04}},
    {"iso3": "USA", "name": "United States", "first_cousin": None, "overall": [0.1, 1.0], "src": BITTLES,
     "ancestry": {"nfe": 0.6, "amr": 0.19, "afr": 0.13, "eas": 0.06, "asj": 0.02}},
]

# When a source gives only the overall rate, we assume this share of consanguineous
# marriages are first-cousin unions (the rest second-cousin). Stated as inferred in the UI.
FIRST_COUSIN_SHARE_IF_UNKNOWN = [0.5, 0.8]

# Real-world benchmarks: countries where newborn screening gives a near-complete observed incidence.
VALIDATION = [
    {"country": "DEU", "disease": "pku", "observed_one_in": [5262, 5262], "label": "PKU + HPA, German NBS 2006-2018",
     "source": {"label": "Dtsch Arztebl Int 2022;119:306-16", "url": "https://di.aerzteblatt.de/int/archive/article/224839"}},
    {"country": "DEU", "disease": "mcad", "observed_one_in": [10086, 10086], "label": "German NBS 2006-2018",
     "source": {"label": "Dtsch Arztebl Int 2022;119:306-16", "url": "https://di.aerzteblatt.de/int/archive/article/224839"}},
    {"country": "DEU", "disease": "galt", "observed_one_in": [76821, 76821], "label": "German NBS 2006-2018",
     "source": {"label": "Dtsch Arztebl Int 2022;119:306-16", "url": "https://di.aerzteblatt.de/int/archive/article/224839"}},
    {"country": "DEU", "disease": "cf", "observed_one_in": [5400, 5400], "label": "German NBS",
     "source": {"label": "Dtsch Arztebl Int 2022;119:306-16", "url": "https://di.aerzteblatt.de/int/archive/article/224839"},
     "note": "Screening misses part of CF cases; the classic genetic figure for Northern Europeans is ~1 in 2,500."},
    {"country": "TUR", "disease": "pku", "observed_one_in": [4500, 4500], "label": "Turkish Ministry of Health, national NBS",
     "source": {"label": "El-Metwally et al. 2018, BioMed Res Int (systematic review)", "url": "https://doi.org/10.1155/2018/7697210"},
     "note": "High-consanguinity check: the q*F term is what lifts Turkey above Germany, as observed."},
    {"country": "IRN", "disease": "pku", "observed_one_in": [5200, 15000], "label": "Iranian provincial NBS, HPA 0.66-1.91 per 10,000",
     "source": {"label": "Iranian PKU screening meta-analysis, BMC Pediatrics 2020", "url": "https://doi.org/10.1186/s12887-020-02230-6"},
     "note": "Model runs high: gnomAD's Middle-Eastern sample (~3,000 people) is dominated by mild-HPA alleles (A300S, V230I) that screening may not count. Exactly the gap more regional sequencing would close."},
]

# ---------------------------------------------------------------------------------------------
# Newborn blood-spot screening programmes. `covers` = diseases in this model that the national
# programme screens for. kind "literature" = a cited source states it; "inferred" = no national
# programme was found in the reviewed sources (stated as such in the UI, never as fact).
# GJB2 deafness is excluded from the gap metric: it is found by hearing screening, not blood spots.
# ---------------------------------------------------------------------------------------------
BLOODSPOT_SCREENABLE = ["pku", "cf", "msud", "galt", "hcu", "mcad", "ga1", "pa", "mma", "pompe", "mps1", "mld", "krabbe"]
_LEBANON_NBS = {"label": "Khneisser et al. 2015, J Med Screen 22:182: 'Few countries in the Middle East-North Africa region have adopted national newborn screening for inborn errors of metabolism by tandem mass spectrometry'",
                "url": "https://doi.org/10.1177/0969141315590675"}
SCREENING = {
    "DEU": {"status": "national expanded", "covers": ["pku", "msud", "hcu", "ga1", "pa", "mma", "mcad", "cf", "galt"], "kind": "literature",
            "src": {"label": "Target Diseases for Neonatal Screening in Germany, Dtsch Arztebl Int 2022 (Table 1, 19 target diseases)", "url": "https://di.aerzteblatt.de/int/archive/article/224839"}},
    "FRA": {"status": "national expanded (2023)", "covers": ["pku", "cf", "mcad", "msud", "hcu", "ga1"], "kind": "literature",
            "src": {"label": "New inborn errors of metabolism added to the French neonatal screening programme (PMID 34003097)", "url": "https://pubmed.ncbi.nlm.nih.gov/34003097"}},
    "GBR": {"status": "national (9 conditions)", "covers": ["pku", "cf", "mcad", "hcu", "msud", "ga1"], "kind": "literature",
            "src": {"label": "UK National Screening Committee: PKU, CHT, SCD, CF, MCADD + HCU, MSUD, GA1, IVA", "url": "https://legacyscreening.phe.org.uk/policydb_download.php?doc=420"}},
    "USA": {"status": "national recommended panel (RUSP)", "covers": ["pku", "msud", "hcu", "mcad", "ga1", "pa", "mma", "galt", "cf", "pompe", "mps1", "krabbe"], "kind": "literature",
            "src": {"label": "HHS Recommended Uniform Screening Panel (Krabbe added July 2024)", "url": "https://www.hrsa.gov/sites/default/files/hrsa/advisory-committees/heritable-disorders/reports-recommendations/infantile-krabbe-final-response.pdf"}},
    "SAU": {"status": "national expanded (MS/MS, 20 disorders 2024)", "covers": ["pku", "msud", "hcu", "pa", "mma", "ga1", "mcad", "galt"], "kind": "literature",
            "src": {"label": "Newborn Screening in Saudi Arabia, Int J Neonatal Screen 2026;12:35 (panel table)", "url": "https://doi.org/10.3390/ijns12020035"}},
    "EGY": {"status": "national, phased roll-out since 2021 (19 diseases)", "covers": ["pku", "cf", "msud", "galt", "hcu", "pa", "mma", "mcad"], "kind": "literature",
            "src": {"label": "Egypt State Information Service: initiative for early detection of 19 genetic diseases in newborns (2021)", "url": "https://sis.gov.eg/en/media-center/news/egypt-launches-initiative-for-early-detection-of-19-genetic-diseases-in-newborns-begins-free-treatment-of-spinal-muscular-atrophy/"}},
    "TUR": {"status": "national (6 diseases)", "covers": ["pku", "cf"], "kind": "literature",
            "src": {"label": "Turkish national programme: PKU, CH, biotinidase, CF, CAH, SMA (Anatolian Curr Med J 2024)", "url": "https://dergipark.org.tr/en/pub/acmj/article/1532044"}},
    "IRN": {"status": "national CH + PKU (since 2005); MS/MS expansion piloted", "covers": ["pku"], "kind": "literature",
            "src": {"label": "MENA-ISNS 2020 country report: 'Newborn screening for inherited metabolic diseases (IMDs) started in Iran covering CH and PKU in 2005'", "url": "https://doi.org/10.3390/ijns6010012"}},
    "TUN": {"status": "no national metabolic screening (CH pilots since 2014)", "covers": [], "kind": "literature",
            "src": {"label": "Newborn screening for congenital hypothyroidism: worldwide coverage, Eur Thyroid J 2025", "url": "https://etj.bioscientifica.com/view/journals/etj/14/1/ETJ-24-0327.xml"}},
    "MAR": {"status": "no national metabolic screening (regional CH programme)", "covers": [], "kind": "literature",
            "src": {"label": "Implementation of neonatal screening for congenital hypothyroidism in Eastern Morocco (PMC12285925)", "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12285925/"}},
    "PAK": {"status": "no national metabolic screening", "covers": [], "kind": "literature",
            "src": {"label": "Wasim et al. 2023, Advanced Biology: no national-level NBS for inborn errors of metabolism in Pakistan", "url": "https://doi.org/10.1002/adbi.202200318"}},
    "IND": {"status": "no national programme (<1M of ~25M births screened)", "covers": [], "kind": "literature",
            "src": {"label": "Wasim et al. 2023, Advanced Biology: India has yet to establish a nationwide NBS programme", "url": "https://doi.org/10.1002/adbi.202200318"}},
    "DZA": {"status": "no national programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
    "LBY": {"status": "no national programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
    "SDN": {"status": "no national programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
    "YEM": {"status": "no national programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
    "JOR": {"status": "no national MS/MS programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
    "IRQ": {"status": "no national programme found", "covers": [], "kind": "inferred", "src": _LEBANON_NBS},
}

# Cost model for "what would screening cost and save?" — every input cited or stated as a range.
COSTS = {
    "test_usd": [5.0, 35.0],  # assumed range for a full MS/MS panel per newborn (stated as inferred in the UI)
    "test_kind": "inferred",
    "saving_per_case_usd": 31631,
    "saving_src": {"label": "Khneisser et al. 2015 (Lebanon, 126,000 newborns): direct cost of care halved, 'reaching on average 31,631 USD per detected case'",
                   "url": "https://doi.org/10.1177/0969141315590675"},
}

# Country -> GME Variome subregion (a stated approximation, shown as inferred in the UI).
GME_REGION = {"TUN": "NWA", "MAR": "NWA", "DZA": "NWA", "LBY": "NWA", "EGY": "NEA", "SDN": "NEA",
              "SAU": "AP", "YEM": "AP", "JOR": "SD", "IRQ": "SD", "TUR": "TP", "IRN": "PP", "PAK": "PP"}
# Bayesian pooling: the gnomAD ancestry-mix estimate acts as a prior worth this many alleles
# (= 500 people); the regional exomes are the data. Stated as an assumption in the UI.
REGIONAL_PRIOR_ALLELES = 1000
