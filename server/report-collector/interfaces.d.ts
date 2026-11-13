/** Shared reporting-v1 API types. This is not an editor/Core or Host protocol extension. */
export type Source =
  | "unknown"
  | "command"
  | "history"
  | "selection"
  | "input"
  | "composition"
  | "clipboard"
  | "save"
  | "load"
  | "layout"
  | "render"
  | "host"
  | "reporting"
  | "core"
  | "runtime";
export interface Build {
  product: string;
  app: string;
  wasmDeclared: string;
  wasmObserved: string | null;
}
export type DiagnosticEvent = { atMs: number } & (
  | {
      type: "command";
      commandId: string;
      phase: "queued" | "started" | "finished" | "cancelled";
      result?: "ok" | "rejected" | "failed" | "noop";
      durationMs?: number;
    }
  | {
      type: "selection";
      selectionType: "none" | "caret" | "text" | "cell" | "object";
      count: number;
    }
  | { type: "history"; revision: number; undoCount: number; redoCount: number }
  | {
      type: "focus";
      role: "editor" | "toolbar" | "menu" | "dialog" | "outside" | "unknown";
    }
  | {
      type: "queue";
      phase: "queued" | "started" | "stopped" | "drained";
      depth: number;
    }
  | {
      type: "save";
      state:
        | "idle"
        | "requested"
        | "exporting"
        | "waiting_ack"
        | "saved"
        | "failed"
        | "cancelled";
    }
);
export interface Consent {
  manualSubmission: boolean;
  automaticUpload: boolean;
  diagnostics: boolean;
  detailCapture: boolean;
  screenshot: boolean;
  document: boolean;
  file: boolean;
}
interface Common {
  schemaVersion: 1;
  clientReportId: string;
  occurredAt: string;
  build: Build;
  environment: {
    os: "windows" | "macos" | "linux" | "android" | "ios" | "other";
    browser: "edge" | "chrome" | "firefox" | "safari" | "other";
  };
  category:
    | "input"
    | "clipboard"
    | "table"
    | "layout"
    | "save"
    | "load"
    | "performance"
    | "other";
  error?: {
    code: string;
    frames: { source: Source; line: number; column: number }[];
  };
  diagnostics: {
    windowMs: number;
    detailSeconds: number;
    events: DiagnosticEvent[];
  };
  /** Fresh memory-only tab/session UUID, never a persistent device/user identifier. */
  ephemeralSessionId?: string;
}
export type Report =
  | (Common & {
      kind: "user_report";
      description: string;
      expected?: string;
      consent: Consent & { manualSubmission: true; automaticUpload: false };
    })
  | (Common & {
      kind: "automatic_error";
      description?: never;
      expected?: never;
      error: NonNullable<Common["error"]>;
      consent: Consent & {
        manualSubmission: false;
        automaticUpload: true;
        screenshot: false;
        document: false;
        file: false;
      };
    });
export interface Receipt {
  reportId: string;
  receivedAt: string;
  attachmentUploadToken?: string;
  attachmentUploadExpiresAt?: string;
}
export type ReportState =
  | "new"
  | "triaging"
  | "planned"
  | "fixed"
  | "deferred"
  | "duplicate";
export interface AdminPatch {
  state?: ReportState;
  fixedInBuild?: string | null;
  reopen?: boolean;
  regression?: boolean;
  regressionOf?: string | null;
  duplicateOf?: string | null;
}
export interface AttachmentReceipt {
  attachmentId: string;
  bytes: number;
  sha256: string;
}
export interface ApiError {
  error: { code: string };
}
