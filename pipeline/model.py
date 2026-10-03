"""Pure, deterministic population-genetics math. No I/O, no LLM. Unit-tested."""
import numpy as np


def affected_probability(q, F):
    """P(child is homozygous / compound-het for pathogenic alleles) with inbreeding.

    P = q^2 (1 - F) + q F  — Wright's formula; reduces to Hardy-Weinberg q^2 when F = 0.
    Works on scalars or numpy arrays.
    """
    q = np.asarray(q, dtype=float)
    F = np.asarray(F, dtype=float)
    return q * q * (1.0 - F) + q * F


def consanguinity_share(q, F):
    """Fraction of affected births attributable to the inbreeding (qF) term."""
    p = affected_probability(q, F)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(p > 0, (np.asarray(q) * np.asarray(F)) / p, 0.0)


def sample_q(q_hat, n_alleles, rng, size):
    """Posterior draws of an aggregate pathogenic allele frequency.

    Jeffreys Beta(x + 0.5, n - x + 0.5) with x = q_hat * n. With q_hat = 0 this still
    gives a small, honest non-zero upper bound — absence of evidence is not zero.
    """
    n = max(float(n_alleles), 1.0)
    x = min(max(q_hat * n, 0.0), n)
    return rng.beta(x + 0.5, n - x + 0.5, size=size)


def sample_F(first_cousin, overall, unknown_share, rng, size):
    """Population mean inbreeding coefficient from marriage-type rates (percent ranges).

    First cousins contribute F = 1/16; other consanguineous unions are treated as
    second cousins (F = 1/64). If only the overall rate is known, the first-cousin share
    is drawn from `unknown_share`.
    """
    ro = rng.uniform(overall[0], overall[1], size) / 100.0
    if first_cousin is None:
        r1 = ro * rng.uniform(unknown_share[0], unknown_share[1], size)
    else:
        r1 = rng.uniform(first_cousin[0], first_cousin[1], size) / 100.0
        ro = np.maximum(ro, r1)
    return r1 / 16.0 + (ro - r1) / 64.0


def summarize(x):
    x = np.asarray(x, dtype=float)
    return {"p5": float(np.percentile(x, 5)), "median": float(np.median(x)), "p95": float(np.percentile(x, 95))}
