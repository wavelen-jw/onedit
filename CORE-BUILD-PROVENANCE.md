# Onedit RC5 Core binary provenance

The browser editor includes a modified downstream RHWP 0.8.7 Core, built with Rust 1.93.1 for `wasm32-unknown-unknown`. RC5's public App build is `c9c5a919d298206fe14c72f4724ae94fcad3a3e1c40c40fddf2cac1f04d571db`; its WASM SHA-256 is `8fbb7253449b1aab87ddd778b78294135999f087f9e4843cd86896985066a229`. JavaScript glue, WASM and both declaration files are supplied together and pinned in `PUBLIC_CORE_BINARY_MANIFEST.json`.

[RHWP](https://github.com/edwardkim/rhwp) is Copyright (c) 2025–2026 Edward Kim. Core and dependency notices ship with the browser runtime and Core binary. The publicly available TypeScript build recreates the browser assets with the supplied Core; modified downstream Rust source is not part of this release.
