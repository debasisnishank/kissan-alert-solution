import { useRef, useState } from "preact/hooks";

interface VoiceLogResult {
  transcript: string;
  language: string;
  sttProvider: string;
  analysis: {
    category: string;
    severity: string;
    summary: string;
    cropMentioned: string | null;
    recommendations: string[];
  };
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-700",
};

const LANGUAGES = [
  { code: "or-IN", label: "ଓଡ଼ିଆ (Odia)" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
  { code: "en-IN", label: "English" },
];

type Phase = "idle" | "recording" | "recorded" | "sending" | "done";

export default function VoiceLogger(
  { cropType }: { cropType?: string },
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [language, setLanguage] = useState("or-IN");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceLogResult | null>(null);
  const [ticketRaised, setTicketRaised] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const startRecording = async () => {
    setError(null);
    setResult(null);
    setTicketRaised(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        blobRef.current = new Blob(chunksRef.current, { type: mimeType });
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(blobRef.current);
        setPhase("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      timerRef.current = setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      ) as unknown as number;
      setPhase("recording");
    } catch {
      setError(
        "Microphone access denied. Allow mic permission in your browser and try again.",
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const submit = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("sending");
    setError(null);
    try {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const base64 = btoa(binary);

      const res = await fetch("/api/voice-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          mimeType: blob.type,
          language,
          cropType,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setResult(await res.json());
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("recorded");
    }
  };

  const raiseTicket = async () => {
    if (!result) return;
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Voice report: ${result.analysis.summary}`.slice(0, 200),
          description: `Voice note transcript (${result.language}):\n` +
            `"${result.transcript}"\n\n` +
            `AI assessment: ${result.analysis.summary} ` +
            `(category: ${result.analysis.category}, severity: ${result.analysis.severity})`,
          category: ["pest", "disease", "nutrient", "irrigation"].includes(
              result.analysis.category,
            )
            ? result.analysis.category
            : "general",
        }),
      });
      if (!res.ok) throw new Error(`Ticket failed (${res.status})`);
      setTicketRaised(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise ticket");
    }
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setError(null);
    setTicketRaised(false);
  };

  const mmss = `${Math.floor(seconds / 60)}:${
    String(seconds % 60).padStart(2, "0")
  }`;

  return (
    <div class="space-y-3">
      {phase === "idle" && (
        <div class="flex items-center gap-3">
          <select
            class="text-sm border rounded-lg px-2 py-2 bg-white"
            value={language}
            onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={startRecording}
            class="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium"
          >
            🎙 Record voice note
          </button>
        </div>
      )}

      {phase === "recording" && (
        <button
          type="button"
          onClick={stopRecording}
          class="w-full flex items-center justify-center gap-2 bg-gray-800 text-white rounded-lg py-2.5 text-sm font-medium"
        >
          <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          Recording {mmss} — tap to stop
        </button>
      )}

      {(phase === "recorded" || phase === "sending") && (
        <div class="space-y-2">
          {audioUrlRef.current && (
            <audio controls src={audioUrlRef.current} class="w-full h-10" />
          )}
          <div class="flex gap-2">
            <button
              type="button"
              onClick={startRecording}
              disabled={phase === "sending"}
              class="flex-1 border rounded-lg py-2 text-sm text-gray-700 disabled:opacity-50"
            >
              Re-record
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={phase === "sending"}
              class="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {phase === "sending" ? "Transcribing…" : "Analyze voice note"}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div class="space-y-2">
          <div class="bg-gray-50 rounded-lg p-3">
            <p class="text-xs text-gray-400 mb-1">
              Transcript ({result.language} · via {result.sttProvider})
            </p>
            <p class="text-sm text-gray-800">"{result.transcript}"</p>
          </div>
          <div class="border rounded-lg p-3 space-y-2">
            <div class="flex items-center gap-2">
              <span
                class={`px-2 py-0.5 text-xs rounded-full capitalize ${
                  SEVERITY_STYLES[result.analysis.severity] ||
                  SEVERITY_STYLES.medium
                }`}
              >
                {result.analysis.severity} severity
              </span>
              <span class="text-xs text-gray-500 capitalize">
                {result.analysis.category}
                {result.analysis.cropMentioned
                  ? ` · ${result.analysis.cropMentioned}`
                  : ""}
              </span>
            </div>
            <p class="text-sm text-gray-800">{result.analysis.summary}</p>
            {result.analysis.recommendations.length > 0 && (
              <ul class="text-xs text-gray-600 space-y-1">
                {result.analysis.recommendations.map((r) => (
                  <li key={r} class="flex gap-2">
                    <span class="text-green-500">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={reset}
              class="flex-1 border rounded-lg py-2 text-sm text-gray-700"
            >
              New voice note
            </button>
            <button
              type="button"
              onClick={raiseTicket}
              disabled={ticketRaised}
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
            >
              {ticketRaised ? "✓ Sent to expert" : "Send to expert"}
            </button>
          </div>
        </div>
      )}

      {error && <p class="text-xs text-red-600">{error}</p>}
    </div>
  );
}
