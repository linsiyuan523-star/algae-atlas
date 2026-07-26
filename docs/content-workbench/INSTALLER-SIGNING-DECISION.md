# Installer Signing Decision

Decision: OWNER_DECISION_REQUIRED

No valid Windows Authenticode code-signing certificate is available. The
repository owner must choose exactly one option:

1. Obtain a trusted production code-signing certificate, sign the installer,
   verify its Authenticode chain, and then approve public distribution.
2. Explicitly approve unsigned distribution for internal testing only, with
   Windows SmartScreen and source-trust risks documented for recipients.

Codex has not selected or approved either option.
