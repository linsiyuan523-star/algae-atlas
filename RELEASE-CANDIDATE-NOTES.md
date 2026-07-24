# Release Candidate Notes

Status: DRAFT_ONLY

- Product: Algae Team Content Publishing Workbench
- Version: 0.1.0
- Validation head: `53e43181b848f0c4f3bbe0a5742a62fe9a84fe40`
- Target: Windows x64, NSIS current-user installer
- Candidate: `content-workbench_0.1.0_x64-setup.exe`
- SHA-256: `8682A7DA94E64A5DD915617ABC2DAF6610B8939D81D9E7136BFE35D184B9E6F7`
- Size: 2,630,838 bytes
- Signature: not signed
- Runtime prerequisite: installed WebView2 runtime

The candidate was built successfully from the final dependency state with
Tauri 2.11.5 and Rust 1.97.1. The package is an installer candidate only; it
was not signed, released, uploaded, or deployed.

Before a release decision:

- resolve or explicitly accept the production npm audit findings;
- complete Rust lockfile vulnerability scanning;
- rehearse this exact hash on a clean Windows VM;
- sign the installer or approve an unsigned distribution policy;
- merge only through a reviewed PR, then deploy only from `origin/main`.
