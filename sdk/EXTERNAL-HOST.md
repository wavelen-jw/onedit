# Connect an existing chat service

Use the Onedit Host SDK and compatible editor runtime from the same distribution. The editor opens and edits the document in its iframe. The chat service owns authentication, the user approval screen and the call to its model.

Run the SDK package's local reference example with the packaged browser runtime.

```sh
node sample/stage-editor.mjs /path/to/onedit-runtime/runtime ./editor
node sample/local.mjs ./editor
```

The example serves two loopback origins, uses synthetic fixtures and simulates the model. Open the URL printed by the server and select **연결**. Use the **파일 열기** and **파일 열기 검토** controls to approve a fixture, edit it in the iframe, select text, capture the selection, review the proposal, and download HWPX.

## Bring your own server

Use the exact editor and host origins. Issue a short-lived session proof and authorize the requested scopes on the editor server. Enable checked open on the server and include `checkedOpen: true` in `OneditHostClient.connect`. Check `getCapabilities` for `openDocument` before enabling the file action.

For `openDocument`, calculate the byte length and SHA-256 of the original file. Use `openApprovalDigest` with the operation ID, current binding, file metadata and expiry. Have your server issue the proof after the user confirms. The native checked parser must accept the file before the iframe adopts it. An unsuitable file leaves the current document in place.

After the user edits and selects text, provide the current binding to `captureSelection`, then call `readSelection`. Pass the selected text and any user-authorized context to your existing model server. Keep its credentials on that server. Use the returned replacement in `previewEdits` and show the before/after text to the user. Issue approval bound to the exact proposal digest and document revision, then call `applyProposal`. `revisePinnedSelection` in the local example uses these same methods and accepts a callback for your model server.

The supported multi-paragraph selection stays in one body flow or one cell, including a merged cell. Supply one replacement line per selected paragraph. Each paragraph keeps its own character and paragraph formatting. A range spanning different character styles within one paragraph, separate cells, or structural controls is refused. Use a fresh capture after another edit changes the document revision.

Use `undo` and `redo` with a fresh binding. With `exportDocument({format: 'hwpx'})`, verify the returned byte length and SHA-256 before persisting. Send `acknowledgeSave` only after your own persistent storage accepts that revision. A browser download alone does not acknowledge the save. The local example's `tests/browser.mjs` exercises the SDK and browser with synthetic files.
