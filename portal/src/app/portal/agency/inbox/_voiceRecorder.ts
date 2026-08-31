/**
 * The one place the Master Inbox negotiates a recording format, names the file
 * it produces and says why recording could not start.
 *
 * Every composer that records audio — the website-enquiry voice note, the
 * recorded call, the social thread and the client thread — goes through here so
 * that:
 *
 * - a browser that cannot record `audio/webm` is never handed a hardcoded
 *   `audio/webm` request (WebKit records `audio/mp4`; the constructor is
 *   permitted to throw `NotSupportedError` for a MIME it does not support);
 * - the produced file is named from the recorder's ACTUAL MIME type, not from
 *   an assumed `.webm`;
 * - a constructor or `start()` failure is reported as what it is (capability,
 *   device or runtime) instead of "microphone access was not granted"; and
 * - the microphone stream opened moments earlier is always released when the
 *   recorder cannot be started.
 */

export type RecorderFailureKind = "permission" | "capability" | "device" | "runtime";

export type RecorderFailure = { ok: false; kind: RecorderFailureKind; message: string };

export type NegotiatedRecorderMime = { ok: true; mimeType?: string } | RecorderFailure;

export type StartedRecorder = { ok: true; recorder: MediaRecorder; mimeType: string; extension: string };

export type StartedRecording = StartedRecorder & { stream: MediaStream };

/**
 * Tried in order. `audio/mp4` is Safari's recording format; when none of them
 * is declared supported the browser picks its own default rather than being
 * forced into a format it has just said it cannot record.
 */
export const RECORDER_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

const FAILURE_MESSAGES: Record<RecorderFailureKind, string> = {
  permission: "Microphone access was not granted.",
  capability: "This browser cannot record audio in a supported format.",
  device: "No usable microphone was available — check it is connected and not in use elsewhere.",
  runtime: "Audio recording could not be started.",
};

export function recorderFailure(kind: RecorderFailureKind): RecorderFailure {
  return { ok: false, kind, message: FAILURE_MESSAGES[kind] };
}

/**
 * A denied permission, an unsupported format, a missing/busy microphone and an
 * unexplained fault are four different problems with four different fixes.
 */
export function classifyRecorderError(cause: unknown): RecorderFailureKind {
  const name = typeof cause === "object" && cause !== null && "name" in cause
    ? String((cause as { name?: unknown }).name ?? "")
    : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotSupportedError" || name === "UnsupportedError" || name === "TypeError") return "capability";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") return "device";
  return "runtime";
}

/**
 * What a voice-note composer tells the operator. Every branch names the actual
 * problem AND how it is dealt with — a browser that cannot record is not the
 * same instruction as a browser that was refused the microphone.
 */
export function voiceNoteFailureMessage(failure: RecorderFailure): string {
  return failure.kind === "permission"
    ? `${failure.message} Allow microphone access for this site to record a voice note.`
    : `${failure.message} Attach an audio file instead.`;
}

/** Releases a microphone stream. Safe with a null stream or a stub without tracks. */
export function stopStreamTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks?.().forEach(track => track.stop());
}

export function negotiateRecorderMime(): NegotiatedRecorderMime {
  const constructor = typeof globalThis.MediaRecorder === "function" ? globalThis.MediaRecorder : null;
  // No MediaRecorder at all is a capability problem, never a permission one.
  if (!constructor) return recorderFailure("capability");
  if (typeof constructor.isTypeSupported !== "function") return { ok: true };
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    let supported = false;
    try {
      supported = constructor.isTypeSupported(candidate);
    } catch {
      supported = false;
    }
    if (supported) return { ok: true, mimeType: candidate };
  }
  return { ok: true };
}

/**
 * The container MIME an upload is DECLARED as.
 *
 * A recorder reports its codec as well as its container — Chrome and Firefox
 * both report `audio/webm;codecs=opus` — while the two upload routes match the
 * whole `File.type` against their audio allowlists (`AUDIO_TYPES` in
 * `api/portal/website-enquiries/calls/recording`, `ALLOWED_TYPES` in
 * `api/portal/inbox/media`). A parameterised type matches neither, so sending
 * the recorder MIME verbatim rejects every ordinary recording with a 415. The
 * container is what those routes allow and what playback needs, so that is what
 * is declared; `extensionForMime` still names the file from the same value.
 */
export function uploadContentType(mimeType: string | undefined | null): string {
  const base = ((mimeType ?? "").split(";")[0] ?? "").trim().toLowerCase();
  return base || "audio/webm";
}

/** The container extension for a recorder MIME type, so nothing is misnamed `.webm`. */
export function extensionForMime(mimeType: string | undefined | null): string {
  const value = (mimeType ?? "").toLowerCase();
  if (value.includes("webm")) return "webm";
  if (value.includes("mp4") || value.includes("m4a") || value.includes("aac")) return "m4a";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("wav")) return "wav";
  return "webm";
}

/**
 * Constructs and starts a recorder over an already-open stream. Never throws:
 * on any failure the stream's tracks are stopped and a classified failure is
 * returned, so no caller can strand a live microphone.
 */
export function startRecorder(options: {
  stream: MediaStream;
  timeslice: number;
  onData: (chunk: Blob) => void;
}): StartedRecorder | RecorderFailure {
  const negotiated = negotiateRecorderMime();
  if (!negotiated.ok) {
    stopStreamTracks(options.stream);
    return negotiated;
  }
  const constructor = globalThis.MediaRecorder;
  try {
    const recorder = negotiated.mimeType
      ? new constructor(options.stream, { mimeType: negotiated.mimeType })
      : new constructor(options.stream);
    recorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size) options.onData(event.data);
    });
    recorder.start(options.timeslice);
    const mimeType = recorder.mimeType || negotiated.mimeType || "audio/webm";
    return { ok: true, recorder, mimeType, extension: extensionForMime(mimeType) };
  } catch (cause) {
    stopStreamTracks(options.stream);
    return recorderFailure(classifyRecorderError(cause));
  }
}

/** Opens the microphone, classifying refusal, absent API and missing device apart. */
export async function requestMicrophoneStream(): Promise<{ ok: true; stream: MediaStream } | RecorderFailure> {
  const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (typeof devices?.getUserMedia !== "function") return recorderFailure("capability");
  try {
    return { ok: true, stream: await devices.getUserMedia({ audio: true }) };
  } catch (cause) {
    return recorderFailure(classifyRecorderError(cause));
  }
}

/**
 * Microphone + recorder in one step for the voice-note composers. On failure
 * nothing is left running: the stream is stopped before the failure returns.
 */
export async function beginRecording(options: {
  timeslice: number;
  onData: (chunk: Blob) => void;
}): Promise<StartedRecording | RecorderFailure> {
  const microphone = await requestMicrophoneStream();
  if (!microphone.ok) return microphone;
  const started = startRecorder({ stream: microphone.stream, timeslice: options.timeslice, onData: options.onData });
  if (!started.ok) return started;
  return { ...started, stream: microphone.stream };
}
