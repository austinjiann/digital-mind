import { z } from "zod";

// Client events
export const UserTextEvent = z.object({
  type: z.literal("user.text"),
  content: z.string().min(1),
  conversation_id: z.string().uuid().optional(),
});

export const UserInterruptEvent = z.object({
  type: z.literal("user.interrupt"),
});

export const UserAudioChunkEvent = z.object({
  type: z.literal("user.audio_chunk"),
  audio: z.string(), // base64
});

export const UserAudioEndEvent = z.object({
  type: z.literal("user.audio_end"),
});

export const UserSetModeEvent = z.object({
  type: z.literal("user.set_mode"),
  mode: z.enum(["voice", "text", "both"]),
});

export const UserRequestTTSEvent = z.object({
  type: z.literal("user.request_tts"),
  content: z.string().min(1),
});

export const ClientEvent = z.discriminatedUnion("type", [
  UserTextEvent,
  UserInterruptEvent,
  UserAudioChunkEvent,
  UserAudioEndEvent,
  UserSetModeEvent,
  UserRequestTTSEvent,
]);

export type ClientEvent = z.infer<typeof ClientEvent>;

// Server events
export const AgentThinkingEvent = z.object({
  type: z.literal("agent.thinking"),
});

export const AgentTranscriptEvent = z.object({
  type: z.literal("agent.transcript"),
  content: z.string(),
  is_final: z.boolean(),
});

export const AgentTokenEvent = z.object({
  type: z.literal("agent.token"),
  token: z.string(),
  accumulated: z.string(),
});

export const AgentSourcesEvent = z.object({
  type: z.literal("agent.sources"),
  sources: z.array(
    z.object({
      chunk_id: z.string(),
      document_id: z.string(),
      filename: z.string(),
      excerpt: z.string(),
      score: z.number(),
    })
  ),
});

export const AgentAudioChunkEvent = z.object({
  type: z.literal("agent.audio_chunk"),
  audio: z.string(),
  chunk_index: z.number(),
  is_last: z.boolean(),
});

export const AgentTextCompleteEvent = z.object({
  type: z.literal("agent.text_complete"),
  content: z.string(),
});

export const AgentDoneEvent = z.object({
  type: z.literal("agent.done"),
  latency: z.object({
    stt_ms: z.number().optional(),
    retrieval_ms: z.number(),
    llm_first_token_ms: z.number(),
    llm_total_ms: z.number(),
    tts_first_chunk_ms: z.number().optional(),
    tts_total_ms: z.number().optional(),
    total_ms: z.number(),
  }),
});

export const AgentErrorEvent = z.object({
  type: z.literal("agent.error"),
  error: z.string(),
  recoverable: z.boolean(),
});

export const AgentInterruptedEvent = z.object({
  type: z.literal("agent.interrupted"),
});

export type ServerEvent =
  | z.infer<typeof AgentThinkingEvent>
  | z.infer<typeof AgentTranscriptEvent>
  | z.infer<typeof AgentTokenEvent>
  | z.infer<typeof AgentSourcesEvent>
  | z.infer<typeof AgentAudioChunkEvent>
  | z.infer<typeof AgentTextCompleteEvent>
  | z.infer<typeof AgentDoneEvent>
  | z.infer<typeof AgentErrorEvent>
  | z.infer<typeof AgentInterruptedEvent>;
