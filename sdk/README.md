# 온편집 Host SDK source

This MIT workspace contains the TypeScript client entry and implementation, versioned request/response schemas, contract tests and a loopback sample. The release SDK archive is a separate installable package. This workspace does not contain the editor or its Core binaries.

From the application source root, install the locked dependencies with `npm ci --ignore-scripts --no-audit --no-fund`. Run `npm --prefix sdk run build`, then `npm --prefix sdk test`. The browser sample requires the same release's verified runtime; see [Quickstart](QUICKSTART.md). Contract tests run from this source workspace or the unpacked SDK archive.

The client is `OneditHostClient`; wire protocol `onedit-host`, transport 2, API 1.0, application contract `onedit-ai/1.0`. The [API reference](API_REFERENCE.md) lists 20 methods and eight events. No old aliases, npm registry publication, hosted authorization, or A04 internal sample are included. [LICENSE](LICENSE) and [NOTICE](NOTICE) govern the first-party SDK files.
