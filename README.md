# 온편집 (onedit)

> **Source preview.** This repository currently publishes the application source only. The browser runtime and Host SDK release assets are still being prepared and are not published here yet. The instructions below describe how to use those assets when they become available.

This is the source-only release candidate snapshot. Onedit-owned application source is MIT; fonts and other components keep their separate terms in THIRD_PARTY_NOTICES.md. This archive contains no Git history, Core binaries, collector implementation, QA files, signing keys, or deployment configuration. The declaration file under server/ is a client build contract only.

## Licensing for forks

The MIT license allows commercial use and redistribution of the Onedit-owned source, including commercial forks, subject to its notice requirements. The bundled HCR Batang and HCR Dotum font files are governed separately. Hancom's conditions, reproduced on [Noonnu's HCR Batang page](https://noonnu.cc/font_page/654) and [HCR Dotum page](https://noonnu.cc/font_page/123), do not permit distributing or modifying the fonts for commercial purposes. Commercial forks must omit the HCR files or obtain permission from Hancom before bundling them for commercial redistribution. [Hancom's own FAQ](https://www.hancom.com/support/faqCenter/faq/detail/2427) also restricts unauthorized font modification and for-profit redistribution of the font itself. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the separate HCR and Noto terms.

For an offline build use the pinned Node/npm versions and lockfiles with an already populated trusted package cache. Provide the matching four separately supplied Core files under development/core/ and verify their SHA256 values against development-runtime.json. Do not publish your local Core inputs or build metadata with this source snapshot. From a disposable copy, run npm ci --offline --ignore-scripts --no-audit --no-fund, npm run typecheck, and npm run build:development. The browser bundle requires the separately pinned runtime. Development output includes private build metadata and must not be used directly as a web document root.

Publication is separate from this snapshot. No deployment or package publication command is provided here.

## Run the editor and use Host SDK v1

Download the browser runtime archive and SHA256SUMS from the same release. After checking the hashes, extract the archive, run `node start-ai-editor.mjs 4173` inside it, and open `http://127.0.0.1:4173/`. The runtime archive contains the pinned Core WASM, its JavaScript glue, and AI-BROWSER-CHANNEL.md. The source archive does not contain the WASM. The browser editor does not need an online SDK service.

The top-level editor has an existing origin-based feature toggle for `https://edit.govpress.cloud`. It controls format snapshots and table track features, does not authenticate the SDK, and does not contact that host. The original toggle is retained in this release. Other origins do not acquire these defaults. Embedding is denied by default. To enable authorized Host SDK embedding, configure exact parent/editor origins and your own authorization policy as described in AI-BROWSER-CHANNEL.md. No production authorization provider or TLS service is included.

Install `onedit-ai-host-sdk-1.0.0-rc2.tgz` locally with `npm install --ignore-scripts ./onedit-ai-host-sdk-1.0.0-rc2.tgz`. Import `OneditHostClient` from `onedit-ai-host-sdk`. Use the matching Onedit browser runtime; the package supports only `onedit-host` (transport 2, API 1.0) and the `onedit-ai/1.0` application contract. The SDK remains local-install only and contains 20 methods and eight events. See the package quickstart for the standalone sample.
