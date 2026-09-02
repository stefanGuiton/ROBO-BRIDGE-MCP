# Packaged Gate Source

The gate source is stored as a checksum-verified package under `tools/submission/package/`.

Each command extracts the package to the operating-system temporary directory. It does not write generated source into the repository. The launcher verifies this SHA-256 value before extraction:

```text
e1e52a57970a2868a60b6d7d7a43c3b9b4eec3e397868c7a51efcc68d8a0eb22
```

The small source files in `tools/submission/` are reviewable launch adapters. They preserve the normal commands and named module exports.

To create a readable source copy for audit:

```bash
npm run submission:source
```

Output:

```text
artifacts/submission-source/
```

This output is ignored by Git. The extraction rejects unsafe paths, unsupported archive entry types, invalid sizes, truncation, and checksum mismatch.
