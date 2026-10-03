import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fetch_gnomad import is_plp  # noqa: E402
from model import affected_probability, consanguinity_share, sample_F, sample_q  # noqa: E402


def test_hardy_weinberg_when_no_inbreeding():
    assert affected_probability(0.01, 0.0) == pytest.approx(1e-4)


def test_full_inbreeding_gives_q():
    assert affected_probability(0.01, 1.0) == pytest.approx(0.01)


def test_first_cousin_inflation_for_rare_allele():
    # q = 0.001, F = 1/16: q^2 = 1e-6 but qF = 6.25e-5 -> ~63x more affected births
    p = affected_probability(0.001, 1 / 16)
    assert p / 1e-6 == pytest.approx(63.4375, rel=1e-6)
    assert consanguinity_share(0.001, 1 / 16) == pytest.approx(0.0625 / 0.0634375)


def test_sample_q_centres_on_observed_frequency():
    rng = np.random.default_rng(0)
    draws = sample_q(0.01, 1_000_000, rng, 5000)
    assert np.median(draws) == pytest.approx(0.01, rel=0.01)


def test_sample_q_with_no_observations_is_small_but_positive():
    rng = np.random.default_rng(0)
    draws = sample_q(0.0, 5000, rng, 5000)
    assert (draws > 0).all()
    assert np.percentile(draws, 95) < 1e-3


def test_sample_F_known_rates():
    rng = np.random.default_rng(0)
    F = sample_F([50, 50], [50, 50], [0.5, 0.8], rng, 10)
    assert np.allclose(F, 0.5 / 16)


def test_sample_F_overall_never_below_first_cousin():
    rng = np.random.default_rng(0)
    F = sample_F([40, 40], [10, 10], [0.5, 0.8], rng, 100)
    assert np.allclose(F, 0.4 / 16)


@pytest.mark.parametrize("sig,expected", [
    ("Pathogenic", True),
    ("Likely pathogenic", True),
    ("Pathogenic/Likely pathogenic", True),
    ("Conflicting classifications of pathogenicity", False),
    ("Uncertain significance", False),
    ("Benign/Likely benign", False),
    (None, False),
])
def test_is_plp(sig, expected):
    assert is_plp(sig) is expected


def _variant(**kw):
    base = {"filters": [], "ac": 10, "an": 100_000, "hgvsc": "c.1A>G", "clinvar": None, "stars": None,
            "lof_hc": False, "pops": {"nfe": [10, 100_000]}}
    base.update(kw)
    return base


def test_qualifies_rules():
    from compute import qualifies
    assert qualifies(_variant(clinvar="Pathogenic", stars=2), "PAH")
    assert not qualifies(_variant(clinvar="Pathogenic", stars=0), "PAH")            # unreviewed
    assert not qualifies(_variant(clinvar="Likely benign", lof_hc=True), "PAH")      # ClinVar overrides LoF
    assert qualifies(_variant(lof_hc=True), "PAH")                                   # rare unclassified LoF
    assert not qualifies(_variant(lof_hc=True, pops={"afr": [50, 10_000]}), "PAH")   # too common in a group
    assert not qualifies(_variant(clinvar="Pathogenic", stars=2, filters=["AC0"]), "PAH")
    assert not qualifies(_variant(clinvar="Pathogenic", stars=4, hgvsc="c.1210-7_1210-6del"), "CFTR")  # low penetrance
    assert qualifies(_variant(clinvar="Conflicting classifications of pathogenicity", stars=1, hgvsc="c.563A>G"), "GALT")  # curated
