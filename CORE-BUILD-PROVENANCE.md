# Onedit RC3 Core binary provenance

The browser editor uses the verified RHWP downstream Core shipped with Onedit editor build `3ff307418ee3434ee3a19d17ea562ae053ff07379c70e668c082effe18ce02f0`.
The matched JavaScript glue, WASM and two declaration files are in the Core and browser archives. WASM SHA-256: `d412c4e19641e476b617f715b9d61df4e1fa8c2a74957320017b19153ed6faf0`.

The upstream project is [RHWP](https://github.com/edwardkim/rhwp), Copyright (c) 2025–2026 Edward Kim. The modified downstream Rust source is not in this release. The supplied Core quartet, license and dependency notices are included; the published TypeScript build uses the supplied quartet rather than compiling Rust. The RC3 app source built against these files reproduces the published UI and WASM assets. Archive checksums are in the release's SHA256SUMS.
