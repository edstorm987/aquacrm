import assert from "node:assert/strict";
import test from "node:test";

import {
  RECORDER_MIME_CANDIDATES,
  beginRecording,
  classifyRecorderError,
  extensionForMime,
  negotiateRecorderMime,
  requestMicrophoneStream,
  startRecorder,
  stopStreamTracks,
  uploadContentType,
  voiceNoteFailureMessage,
} from "@/app/portal/agency/inbox/_voiceRecorder";

// Executable MediaRecorder lifecycle coverage for the Master Inbox composers
// (issues #145 / tests.md). Every environment below is a real browser the
// composers must survive, and every forced failure is one that previously
// stranded a live microphone, a busy UI or an active call.

type Track = { stop: () => void; stopped: boolean };

function fakeStream(count = 1) {
  const tracks: Track[] = Array.from({ length: count }, () => {
    const track: Track = { stopped: false, stop: () => { track.stopped = true; } };
    return track;
  });
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

type StubOptions = {
  /** MIME types the environment declares recordable. */
  supported?: readonly string[];
  /** Omit isTypeSupported entirely (an older recorder implementation). */
  withoutIsTypeSupported?: boolean;
  /** Thrown by the constructor. */
  constructError?: Error;
  /** Thrown by start(). */
  startError?: Error;
  /** What the constructed recorder reports as its actual MIME. */
  actualMime?: (requested: string | undefined) => string;
};

type StubRecorder = { mimeType: string; started: number[]; listeners: string[] };

function installRecorder(options: StubOptions): { constructed: Array<string | undefined>; recorders: StubRecorder[] } {
  const constructed: Array<string | undefined> = [];
  const recorders: StubRecorder[] = [];
  class Stub {
    mimeType: string;
    started: number[] = [];
    listeners: string[] = [];
    constructor(_stream: unknown, config?: { mimeType?: string }) {
      constructed.push(config?.mimeType);
      if (options.constructError) throw options.constructError;
      this.mimeType = options.actualMime ? options.actualMime(config?.mimeType) : config?.mimeType ?? "";
      recorders.push(this);
    }
    addEventListener(name: string) { this.listeners.push(name); }
    start(timeslice: number) {
      if (options.startError) throw options.startError;
      this.started.push(timeslice);
    }
    static isTypeSupported(value: string) { return (options.supported ?? []).includes(value); }
  }
  if (options.withoutIsTypeSupported) Reflect.deleteProperty(Stub, "isTypeSupported");
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = Stub;
  return { constructed, recorders };
}

function clearRecorder() {
  Reflect.deleteProperty(globalThis as { MediaRecorder?: unknown }, "MediaRecorder");
}

function named(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

test.afterEach(() => {
  clearRecorder();
  Reflect.deleteProperty(globalThis as { navigator?: unknown }, "navigator");
});

test("format negotiation walks Opus-WebM, plain WebM, MP4, then the browser default", () => {
  installRecorder({ supported: ["audio/webm;codecs=opus", "audio/webm"] });
  assert.deepEqual(negotiateRecorderMime(), { ok: true, mimeType: "audio/webm;codecs=opus" });

  // Plain WebM only: the old code forced audio/webm without ever testing it —
  // here it is tested, and it is genuinely the supported one.
  installRecorder({ supported: ["audio/webm"] });
  assert.deepEqual(negotiateRecorderMime(), { ok: true, mimeType: "audio/webm" });

  // Safari: no WebM at all. The old code still requested audio/webm.
  installRecorder({ supported: ["audio/mp4"] });
  assert.deepEqual(negotiateRecorderMime(), { ok: true, mimeType: "audio/mp4" });

  // Nothing declared: let the browser choose rather than force a refused format.
  installRecorder({ supported: [] });
  assert.deepEqual(negotiateRecorderMime(), { ok: true });

  installRecorder({ withoutIsTypeSupported: true });
  assert.deepEqual(negotiateRecorderMime(), { ok: true });

  // No recorder at all is a capability problem, never a permission one.
  clearRecorder();
  const absent = negotiateRecorderMime();
  assert.equal(absent.ok, false);
  assert.equal(absent.ok === false && absent.kind, "capability");
  assert.equal(RECORDER_MIME_CANDIDATES[0], "audio/webm;codecs=opus");
});

test("the uploaded file is named from the recorder's actual MIME, never assumed .webm", () => {
  assert.equal(extensionForMime("audio/webm;codecs=opus"), "webm");
  assert.equal(extensionForMime("audio/webm"), "webm");
  assert.equal(extensionForMime("audio/mp4"), "m4a");
  assert.equal(extensionForMime("audio/mp4;codecs=mp4a.40.2"), "m4a");
  assert.equal(extensionForMime("audio/ogg;codecs=opus"), "ogg");
  assert.equal(extensionForMime("audio/mpeg"), "mp3");
  assert.equal(extensionForMime("audio/x-wav"), "wav");
  assert.equal(extensionForMime(""), "webm");
  assert.equal(extensionForMime(undefined), "webm");
});

test("the declared upload type is the container, not the recorder's codec string", () => {
  // The recorder reports the codec too; the upload routes allowlist containers.
  assert.equal(uploadContentType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(uploadContentType("audio/mp4;codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(uploadContentType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(uploadContentType("AUDIO/WEBM"), "audio/webm");
  assert.equal(uploadContentType("audio/mp4"), "audio/mp4");
  // Nothing recorded a type: the negotiated default is still declared honestly.
  assert.equal(uploadContentType(""), "audio/webm");
  assert.equal(uploadContentType(undefined), "audio/webm");
  // Stripping the codec must not change what the file is called.
  for (const mime of ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/ogg;codecs=opus"]) {
    assert.equal(extensionForMime(uploadContentType(mime)), extensionForMime(mime));
  }
});

test("each format environment starts a recorder carrying its own MIME and extension", () => {
  const environments: Array<{ label: string; supported: string[]; requested: string | undefined; actual: string; extension: string }> = [
    { label: "Opus WebM", supported: ["audio/webm;codecs=opus"], requested: "audio/webm;codecs=opus", actual: "audio/webm;codecs=opus", extension: "webm" },
    { label: "plain WebM", supported: ["audio/webm"], requested: "audio/webm", actual: "audio/webm", extension: "webm" },
    { label: "MP4", supported: ["audio/mp4"], requested: "audio/mp4", actual: "audio/mp4", extension: "m4a" },
  ];
  for (const environment of environments) {
    const { constructed } = installRecorder({ supported: environment.supported });
    const { stream, tracks } = fakeStream();
    const started = startRecorder({ stream, timeslice: 1_000, onData: () => {} });
    assert.equal(started.ok, true, environment.label);
    assert.deepEqual(constructed, [environment.requested], environment.label);
    if (started.ok) {
      assert.equal(started.mimeType, environment.actual, environment.label);
      assert.equal(started.extension, environment.extension, environment.label);
      assert.deepEqual((started.recorder as unknown as StubRecorder).started, [1_000], environment.label);
    }
    assert.equal(tracks[0].stopped, false, environment.label);
  }

  // Browser default: constructed with no mimeType, and the extension follows
  // whatever the browser actually chose.
  const { constructed } = installRecorder({ supported: [], actualMime: () => "audio/mp4" });
  const { stream } = fakeStream();
  const started = startRecorder({ stream, timeslice: 750, onData: () => {} });
  assert.deepEqual(constructed, [undefined]);
  assert.equal(started.ok && started.mimeType, "audio/mp4");
  assert.equal(started.ok && started.extension, "m4a");
});

test("a no-supported-recorder environment fails as capability and releases the microphone", () => {
  clearRecorder();
  const { stream, tracks } = fakeStream(2);
  const started = startRecorder({ stream, timeslice: 1_000, onData: () => {} });
  assert.equal(started.ok, false);
  assert.equal(started.ok === false && started.kind, "capability");
  assert.equal(started.ok === false && /cannot record audio/i.test(started.message), true);
  assert.deepEqual(tracks.map(track => track.stopped), [true, true]);
});

test("constructor and start failures are classified apart from denied permission and stop the stream", () => {
  const cases: Array<{ label: string; options: StubOptions; kind: string }> = [
    { label: "unsupported MIME", options: { supported: ["audio/webm"], constructError: named("NotSupportedError") }, kind: "capability" },
    { label: "invalid MIME", options: { supported: ["audio/webm"], constructError: named("TypeError") }, kind: "capability" },
    { label: "blocked by policy", options: { supported: ["audio/webm"], constructError: named("SecurityError") }, kind: "permission" },
    { label: "microphone busy", options: { supported: ["audio/webm"], constructError: named("NotReadableError") }, kind: "device" },
    { label: "unexplained fault", options: { supported: ["audio/webm"], constructError: named("InvalidStateError") }, kind: "runtime" },
    { label: "start() throws", options: { supported: ["audio/webm"], startError: named("UnknownError") }, kind: "runtime" },
  ];
  for (const scenario of cases) {
    installRecorder(scenario.options);
    const { stream, tracks } = fakeStream();
    const started = startRecorder({ stream, timeslice: 1_000, onData: () => {} });
    assert.equal(started.ok, false, scenario.label);
    assert.equal(started.ok === false && started.kind, scenario.kind, scenario.label);
    assert.equal(tracks[0].stopped, true, `${scenario.label} must release the microphone`);
  }
});

test("microphone refusal, missing device and absent API are three different answers", async () => {
  const install = (getUserMedia: unknown) => {
    (globalThis as { navigator?: unknown }).navigator = { mediaDevices: getUserMedia ? { getUserMedia } : {} };
  };

  install(() => Promise.reject(named("NotAllowedError")));
  const refused = await requestMicrophoneStream();
  assert.equal(refused.ok === false && refused.kind, "permission");

  install(() => Promise.reject(named("NotFoundError")));
  const missing = await requestMicrophoneStream();
  assert.equal(missing.ok === false && missing.kind, "device");

  install(null);
  const unavailable = await requestMicrophoneStream();
  assert.equal(unavailable.ok === false && unavailable.kind, "capability");

  const { stream } = fakeStream();
  install(() => Promise.resolve(stream));
  const granted = await requestMicrophoneStream();
  assert.equal(granted.ok, true);
});

test("beginRecording never leaves a stream running when the recorder cannot start", async () => {
  const { stream, tracks } = fakeStream();
  (globalThis as { navigator?: unknown }).navigator = { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } };

  // The exact bug: permission was GRANTED, the constructor failed, and the old
  // code reported "Microphone access was not granted" while the stream stayed open.
  installRecorder({ supported: ["audio/webm"], constructError: named("NotSupportedError") });
  const failed = await beginRecording({ timeslice: 750, onData: () => {} });
  assert.equal(failed.ok, false);
  assert.equal(failed.ok === false && failed.kind, "capability");
  assert.equal(failed.ok === false && /not granted/i.test(failed.message), false);
  assert.equal(tracks[0].stopped, true);

  const fresh = fakeStream();
  (globalThis as { navigator?: unknown }).navigator = { mediaDevices: { getUserMedia: () => Promise.resolve(fresh.stream) } };
  installRecorder({ supported: ["audio/mp4"] });
  const ok = await beginRecording({ timeslice: 750, onData: () => {} });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok === true && ok.extension, "m4a");
  assert.equal(fresh.tracks[0].stopped, false);
});

test("every failure message states how it is dealt with", () => {
  assert.match(voiceNoteFailureMessage({ ok: false, kind: "permission", message: "Microphone access was not granted." }), /Allow microphone access/);
  assert.match(voiceNoteFailureMessage({ ok: false, kind: "capability", message: "No format." }), /Attach an audio file instead/);
  assert.match(voiceNoteFailureMessage({ ok: false, kind: "device", message: "No microphone." }), /Attach an audio file instead/);
  assert.equal(classifyRecorderError(undefined), "runtime");
  assert.equal(classifyRecorderError({ name: "NotAllowedError" }), "permission");
});

test("stopStreamTracks tolerates a null stream and stops every track", () => {
  stopStreamTracks(null);
  stopStreamTracks(undefined);
  const { stream, tracks } = fakeStream(3);
  stopStreamTracks(stream);
  assert.deepEqual(tracks.map(track => track.stopped), [true, true, true]);
});
