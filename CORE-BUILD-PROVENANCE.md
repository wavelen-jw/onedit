# Onedit 1.1.0 Core binary provenance

The standalone browser editor uses a modified downstream RHWP 0.8.7 Core, built with Rust 1.93.1 for `wasm32-unknown-unknown`. The public build remaps local compiler paths. Its App identity is `73b479b7bfa96ea3402c938aab848dbe694e4419f7c9c5eac5add1e3af11eb7f` and its WASM SHA-256 is `5f9553b45707abac54f440a7192f6c59d011c8149be71abda8c5e25e18f58447`. `PUBLIC_CORE_BINARY_MANIFEST.json` pins the four matched binary and binding files.

[RHWP](https://github.com/edwardkim/rhwp) is Copyright (c) 2025–2026 Edward Kim. The runtime and Core binary kit include the upstream MIT terms, dependency notices and Rust standard library notices. The SDK companion archive carries the separately pinned checked-open runtime.
