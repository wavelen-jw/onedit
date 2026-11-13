# Onedit Core binary provenance

This packet describes the unpublished Onedit rebrand. It is not the older published release. The exact UI build fingerprint, SDK archive, WASM quartet and package hashes are in PUBLIC_CORE_BINARY_MANIFEST.json. No previous official verdict transfers to these pins.

## Private build mapping

The project records RHWP v0.8.7 / `1a76570e833917d15817415a53c09ad61ab3203f` as its upstream baseline reference. The public upstream version and license can be checked at that revision. The binary is modified downstream. Its private source inventory and Cargo.lock are identified by SHA256, not shipped. The manifest does not claim that cloning the upstream revision reproduces this binary or that its full downstream commit ancestry is public.

The recorded build used Rust/Cargo 1.93.1, wasm32-unknown-unknown, locked offline Cargo dependencies, release-test profile, and the features and path-remapping policy listed in the manifest. Representative private command, from the authorized source root:

```sh
cargo +1.93.1 build --offline --locked --target wasm32-unknown-unknown --profile release-test --lib -j3 --features onedit-private-nested-valign-v1,onedit-private-rhw91-scope,onedit-private-rhw92-selection-target-lite-v1,onedit-private-rhw92-owner-batch-v1,onedit-private-rhw102-format-snapshot-v1
wasm-bindgen <compiled-rhwp.wasm> --out-dir <matched4> --target web
```

Build/source/Cargo/home prefixes were remapped to virtual paths. Binding generation was repeated against the same compiled module and the four outputs compared. The packaged JS and declaration outputs include a deterministic documentation-path normalization. A second independent Cargo compilation is not asserted by this packet. A maintainer with authorized source access can check the source-inventory and lockfile digests, then compare all four resulting files. Public users verify and reuse the quartet; they do not need Cargo or the private Rust source.

## Public build mapping

The source-only archive can rebuild the UI using the exact quartet and locked Node toolchain/dependencies. It is not a second implementation of Core. The current scripts derive asset names from a content hash over sorted build inputs, including the compiler/bundler scripts and Core manifest. There is no supported flag to force an older asset prefix. A different namespace or a different WASM hash is not resolved by renaming a JS file: pin checks and manifests must match the actual bytes. The local replay procedure compares the actual generated UI assets and the pinned runtime.

The complete browser archive is the supported standalone distribution. The SDK archive is optional for an embedded Host. See README.md for local startup, offline verification, and the distinction between standalone startup and an embedding authority policy.
