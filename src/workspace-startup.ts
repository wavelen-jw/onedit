import {installReportUI} from './diagnostics/report-ui.js';
import {freezeDiagnostic} from './diagnostics/runtime.js';
import {startupMark} from './startup-timing.js';
startupMark('entry');
try { installReportUI(document); } catch { /* Optional reporting must never prevent editor startup or report itself. */ }
// Initial HTML retains source controls for existing owners. Publish them only
// after the same UI bootstrap has finished; no editable legacy fallback.
const root = document.documentElement;
const startup = document.getElementById("workspace-startup")!;
const status = document.getElementById("workspace-startup-status")!;
const failed = () => {
  root.dataset.workspaceStartup = "failed";
  status.textContent = "편집기를 시작하지 못했습니다. 다시 불러오세요.";
  status.setAttribute("role", "alert");
};
// Menu owners finish construction in existing microtasks. Their exceptions
// must not reveal a half-mounted workspace or disappear behind a loading view.
const onError = (event: ErrorEvent) => { if (event.error) failed(); };
window.addEventListener("error", onError);
try {
  await import("./ui.js");
  await new Promise<void>(resolve => queueMicrotask(resolve));
  if (root.dataset.workspaceStartup !== "failed") {
    if (!document.querySelector("#pages > .page > svg, #pages > .page > canvas") ||
        (window.parent === window && !document.querySelector(".workspace-modern #workspace-document-identity")))
      throw Error("편집기 화면 구성이 완료되지 않았습니다.");
    const returnFocus = document.activeElement === document.body || startup.contains(document.activeElement);
    startup.hidden = true;
    delete root.dataset.workspaceStartup;
    startupMark('ready');
    if (returnFocus && window.parent === window)
      document.getElementById("input")?.focus({preventScroll: true});
  }
} catch (error) {
  freezeDiagnostic('STARTUP_FAILED','workspace-startup');
  failed();
  console.error("RHWP Edit 시작 실패", error);
} finally {
  window.removeEventListener("error", onError);
}
