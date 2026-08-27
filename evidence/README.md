# Evidence policy

This directory contains no inherited pass/fail evidence.

The previous Oracle and Newton evidence was removed because it was not bound to the repaired source state and could be mistaken for current release proof.

Run `python scripts/verify.py --write-evidence` only when you intentionally want a new verification record for the exact current checkout. Generated files are written under `evidence/generated/` and are ignored by Git by default.
