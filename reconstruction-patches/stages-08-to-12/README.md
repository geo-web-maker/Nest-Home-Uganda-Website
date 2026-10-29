# Nest Home Care Uganda — reconstruction stages 08–12

These are forward-only patches reconstructed from the stage mockups and the existing 00–07 reconstructed baseline.

Apply from the project root, in this exact order:

```bash
patch -p1 < reconstruction-patches/stages-08-to-12/08.patch
patch -p1 < reconstruction-patches/stages-08-to-12/08b.patch
patch -p1 < reconstruction-patches/stages-08-to-12/09.patch
patch -p1 < reconstruction-patches/stages-08-to-12/10.patch
patch -p1 < reconstruction-patches/stages-08-to-12/11.patch
patch -p1 < reconstruction-patches/stages-08-to-12/12.patch
```

The patches are intentionally separate so a later stage can be audited or reverted by restoring the baseline and replaying only the required forward sequence. They are not reverse/undo patches.

## Verification

A clean copy of the 00–07 baseline was used to replay all six patches in order. The resulting source tree matched the reconstructed source snapshot byte-for-byte for the replayed tree.

Application/test suites were not executed during reconstruction. Run the local validation commands in the stage handover report.
