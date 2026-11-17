# Onedit RC4 Core binary provenance

The browser editor uses the same modified downstream RHWP Core binary as RC3. RC4's public App build is `0bf3e06565246cbaee0103c9f128241d6d3c571d05418ba4325bbc221767aed2`; its WASM SHA-256 is `d412c4e19641e476b617f715b9d61df4e1fa8c2a74957320017b19153ed6faf0`. JavaScript glue, WASM and both declaration files are supplied together.

[RHWP](https://github.com/edwardkim/rhwp) is Copyright (c) 2025–2026 Edward Kim. Core and dependency notices ship with the browser runtime and Core binary. The publicly available TypeScript build recreates the browser assets with the supplied Core; modified downstream Rust source is not part of this release.
