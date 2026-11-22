# RHWP Core — third-party notices

The Onedit browser Core is built from a modified version of the public, MIT-licensed [RHWP project](https://github.com/edwardkim/rhwp), reference version 0.8.7. `PUBLIC_CORE_BINARY_MANIFEST.json` records the upstream reference and downstream build identity.

Onedit keeps its downstream Rust source, patches and repository history private. Public releases ship the compiled Core WASM, its generated JavaScript bindings and TypeScript declarations, and the corresponding license notices. RHWP upstream remains available under [its MIT license](https://github.com/edwardkim/rhwp/blob/main/LICENSE).

Copyright (c) 2025-2026 Edward Kim. The browser runtime and Core binary kit carry the complete upstream MIT permission and copyright notice as `licenses/CORE-MIT.txt`. Retain it when redistributing the covered material.

The kit includes `licenses/WASM-DEPENDENCY-NOTICES.json`, referenced original license texts under `licenses/rust/`, and `SBOM.cdx.json`. This inventory documents the recorded locked wasm32 normal/build dependency tree; it is not a linked-symbol inventory. Do not relabel dependency licenses as MIT.

The Core kit and browser runtime include the pinned Rust toolchain's standard library copyright notice and license texts under `licenses/rust-std/`.

Onedit-owned UI and SDK are MIT under their separate notices. Noto is SIL OFL 1.1; see the individual font notices in the runtime. HCR Batang/Dotum are under separate Hancom terms. This package does not grant commercial HCR font redistribution or modification rights; omit those fonts from a commercial bundle or obtain permission separately. The Core kit carries no font files.
