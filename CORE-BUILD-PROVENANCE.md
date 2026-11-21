# Onedit RC6 Core binary provenance

The browser editor includes a modified downstream RHWP 0.8.7 Core, built with Rust 1.93.1 for `wasm32-unknown-unknown`. RC6's public App build is `a0d430e31f8015836029bc03ca71084d8fcdd98aafb36a5523a1a02df46a053b`; its WASM SHA-256 is `78845dc759ebeabdaa36feee2271d9112eb72e6fe6f57ad8d4117b587e181890`. JavaScript glue, WASM and both declaration files are supplied together and pinned in `PUBLIC_CORE_BINARY_MANIFEST.json`.

[RHWP](https://github.com/edwardkim/rhwp) is Copyright (c) 2025–2026 Edward Kim. Core and dependency notices ship with the browser runtime and Core binary. The publicly available TypeScript build recreates the browser assets with the supplied Core; modified downstream Rust source is not part of this release.
