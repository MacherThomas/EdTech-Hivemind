import type { ContentOrigin, VerificationState } from "@prisma/client";

/** Provenance is always shown as text, never colour alone. */
export function OriginBadge({ origin, verification }: { origin: ContentOrigin; verification?: VerificationState }) {
  return (
    <span className="cluster" style={{ gap: 4 }}>
      {origin === "AI_DRAFTED" && (
        <span className="badge badge-ai" title="Written by the AI">
          <span aria-hidden="true">✦</span> AI-drafted
        </span>
      )}
      {origin === "COMMUNITY" && (
        <span className="badge badge-community" title="Written by a student">
          <span aria-hidden="true">●</span> Community
        </span>
      )}
      {origin === "TUTOR" && (
        <span className="badge badge-tutor" title="Written by a student tutor">
          <span aria-hidden="true">★</span> Tutor
        </span>
      )}
      {verification === "COMMUNITY_VERIFIED" && (
        <span className="badge badge-verified" title="Confirmed by the course community">
          <span aria-hidden="true">✓</span> Community-verified
        </span>
      )}
      {verification === "UNVERIFIED" && origin === "AI_DRAFTED" && (
        <span className="badge badge-inferred" title="Not yet confirmed by students">
          Unverified
        </span>
      )}
    </span>
  );
}

export function GateBadge({ reason, uncertain }: { reason: string; uncertain?: boolean }) {
  return (
    <span className="badge badge-gated" title={reason}>
      <span aria-hidden="true">⚠</span> {uncertain ? "May be live" : "Possibly live"}
    </span>
  );
}

export function Notice({ kind = "info", title, children }: { kind?: "info" | "warning" | "error" | "success"; title?: string; children: React.ReactNode }) {
  const icon = { info: "ℹ", warning: "⚠", error: "✖", success: "✓" }[kind];
  const label = { info: "Info", warning: "Warning", error: "Error", success: "Success" }[kind];
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="visually-hidden">{label}: </span>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}
