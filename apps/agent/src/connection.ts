import { ClientEvent } from "@digital-mind/shared";
import { retrieve, type RetrievedChunk } from "./services/retrieval";
import { streamLLM } from "./services/llm";
import { getTTSClient } from "./services/tts";
import { SpeechChunker } from "./services/text-chunker";

type State = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

interface ConnectionData {
  state: State;
  abortController?: AbortController;
}

export async function handleConnection(
  ws: { send: (data: string) => void; data: ConnectionData },
  rawMessage: string | Buffer
) {
  const data = ws.data;

  try {
    const message = JSON.parse(rawMessage.toString());
    const event = ClientEvent.parse(message);

    switch (event.type) {
      case "user.text":
        await handleUserText(ws, data, event.content);
        break;

      case "user.interrupt":
        handleInterrupt(ws, data);
        break;

      case "user.request_tts":
        await handleRequestTTS(ws, data, event.content);
        break;

      // Audio events handled in Day 2
      case "user.audio_chunk":
      case "user.audio_end":
      case "user.set_mode":
        // Not implemented yet
        break;
    }
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "agent.error",
        error: String(error),
        recoverable: true,
      })
    );
  }
}

async function handleUserText(
  ws: { send: (data: string) => void; data: ConnectionData },
  data: ConnectionData,
  content: string
) {
  // Cancel any ongoing response
  if (data.abortController) {
    data.abortController.abort();
  }

  data.state = "PROCESSING";
  data.abortController = new AbortController();
  const startTime = Date.now();
  const ttsClient = getTTSClient();
  const chunker = new SpeechChunker();

  let retrievalMs = 0;
  let llmFirstTokenMs = 0;
  let ttsFirstChunkMs: number | null = null;
  const ttsStartTime = Date.now();

  // Track TTS tasks
  const ttsQueue: Promise<void>[] = [];
  let audioChunkIndex = 0;

  try {
    // 1. Retrieve relevant chunks
    ws.send(JSON.stringify({ type: "agent.thinking" }));

    const retrievalStart = Date.now();
    const sources = await retrieve(content);
    retrievalMs = Date.now() - retrievalStart;

    // DEBUG: Log what was retrieved
    console.log("Query:", content);
    console.log("Retrieved sources:", sources.length);
    sources.forEach((s, i) => {
      console.log(
        `  [${i}] score: ${s.score.toFixed(3)}, content: ${s.content.slice(0, 100)}...`
      );
    });

    // Send sources
    ws.send(
      JSON.stringify({
        type: "agent.sources",
        sources: sources.map((s) => ({
          chunk_id: s.id,
          document_id: s.document_id,
          filename: s.filename,
          excerpt: s.content.slice(0, 200) + "...",
          score: s.score,
        })),
      })
    );

    // Store audio results in order
    const audioResults: (string | null)[] = [];
    let nextChunkToSend = 0;

    // Helper to process speech chunk through TTS
    const processSpeechChunk = async (text: string, chunkIndex: number) => {
      if (data.abortController?.signal.aborted) return;

      try {
        const audio = await ttsClient.synthesize(text);

        if (data.abortController?.signal.aborted) return;

        if (ttsFirstChunkMs === null) {
          ttsFirstChunkMs = Date.now() - ttsStartTime;
        }

        // Store result at correct index
        audioResults[chunkIndex] = audio;

        // Send any chunks that are ready in order
        while (audioResults[nextChunkToSend] !== undefined) {
          const audioToSend = audioResults[nextChunkToSend];
          if (audioToSend) {
            ws.send(
              JSON.stringify({
                type: "agent.audio_chunk",
                audio: audioToSend,
                chunk_index: nextChunkToSend,
                is_last: false,
              })
            );
          }
          nextChunkToSend++;
        }
      } catch (error) {
        console.error("[TTS] Error:", error);
        // Mark as failed so we don't block subsequent chunks
        audioResults[chunkIndex] = null;
      }
    };

    // 2. Stream LLM response + TTS
    const llmStart = Date.now();
    let accumulated = "";

    const systemPrompt = buildSystemPrompt(sources);

    data.state = "SPEAKING";

    for await (const token of streamLLM(
      systemPrompt,
      content,
      data.abortController.signal
    )) {
      if (!llmFirstTokenMs) {
        llmFirstTokenMs = Date.now() - llmStart;
      }

      accumulated += token;

      // Send text token
      ws.send(
        JSON.stringify({
          type: "agent.token",
          token,
          accumulated,
        })
      );

      // Check for speakable chunk
      const speechChunk = chunker.addToken(token);
      if (speechChunk) {
        // Start TTS in parallel with assigned index
        const chunkIndex = audioChunkIndex++;
        ttsQueue.push(processSpeechChunk(speechChunk, chunkIndex));
      }
    }

    const llmTotalMs = Date.now() - llmStart;

    // Flush remaining text
    const finalChunk = chunker.flush();
    if (finalChunk) {
      const chunkIndex = audioChunkIndex++;
      ttsQueue.push(processSpeechChunk(finalChunk, chunkIndex));
    }

    // Signal text is complete (so UI can stop showing streaming indicator)
    ws.send(
      JSON.stringify({
        type: "agent.text_complete",
        content: accumulated,
      })
    );

    // Wait for all TTS to complete
    await Promise.all(ttsQueue);

    // Send final audio marker
    ws.send(
      JSON.stringify({
        type: "agent.audio_chunk",
        audio: "",
        chunk_index: audioChunkIndex,
        is_last: true,
      })
    );

    // 3. Done
    data.state = "IDLE";

    ws.send(
      JSON.stringify({
        type: "agent.done",
        latency: {
          retrieval_ms: retrievalMs,
          llm_first_token_ms: llmFirstTokenMs,
          llm_total_ms: llmTotalMs,
          tts_first_chunk_ms: ttsFirstChunkMs || 0,
          tts_total_ms: Date.now() - ttsStartTime,
          total_ms: Date.now() - startTime,
        },
      })
    );
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return; // Interrupted, don't send error
    }
    throw error;
  }
}

function handleInterrupt(
  ws: { send: (data: string) => void; data: ConnectionData },
  data: ConnectionData
) {
  if (data.abortController) {
    data.abortController.abort();
  }
  data.state = "IDLE";
  ws.send(JSON.stringify({ type: "agent.interrupted" }));
}

async function handleRequestTTS(
  ws: { send: (data: string) => void; data: ConnectionData },
  data: ConnectionData,
  content: string
) {
  // Cancel any ongoing response
  if (data.abortController) {
    data.abortController.abort();
  }

  data.state = "SPEAKING";
  data.abortController = new AbortController();
  const ttsClient = getTTSClient();
  // Use chunker without "Um," fillers for read-aloud of prepared text
  const chunker = new SpeechChunker(false);

  let audioChunkIndex = 0;
  const audioResults: (string | null)[] = [];
  let nextChunkToSend = 0;

  const processSpeechChunk = async (text: string, chunkIndex: number) => {
    if (data.abortController?.signal.aborted) return;

    try {
      const audio = await ttsClient.synthesize(text);
      if (data.abortController?.signal.aborted) return;

      audioResults[chunkIndex] = audio;

      while (audioResults[nextChunkToSend] !== undefined) {
        const audioToSend = audioResults[nextChunkToSend];
        if (audioToSend) {
          ws.send(
            JSON.stringify({
              type: "agent.audio_chunk",
              audio: audioToSend,
              chunk_index: nextChunkToSend,
              is_last: false,
            })
          );
        }
        nextChunkToSend++;
      }
    } catch (error) {
      console.error("[TTS] Error:", error);
      audioResults[chunkIndex] = null;
    }
  };

  try {
    // Split content into speakable chunks
    const ttsQueue: Promise<void>[] = [];
    const chunks: string[] = [];

    // First, collect all chunks
    for (const char of content) {
      const speechChunk = chunker.addToken(char);
      if (speechChunk) {
        chunks.push(speechChunk);
      }
    }

    const finalChunk = chunker.flush();
    if (finalChunk) {
      chunks.push(finalChunk);
    }

    // Process chunks with pauses for natural spacing (like streaming)
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      // Add pause marker for non-final chunks to create natural breaks
      // Using ". . ." with spaces prevents the cleanText collapse and creates a pause
      if (i < chunks.length - 1) {
        chunk = chunk.trimEnd() + " . . .";
      }
      const chunkIndex = audioChunkIndex++;
      ttsQueue.push(processSpeechChunk(chunk, chunkIndex));
    }

    await Promise.all(ttsQueue);

    // Send final audio marker
    ws.send(
      JSON.stringify({
        type: "agent.audio_chunk",
        audio: "",
        chunk_index: audioChunkIndex,
        is_last: true,
      })
    );

    data.state = "IDLE";
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return;
    }
    throw error;
  }
}

function buildSystemPrompt(sources: RetrievedChunk[]): string {
  const context = sources
    .map((s, i) => `[Source ${i + 1}]: ${s.content}`)
    .join("\n\n");

  return `You are Austin Jian's digital clone. You ARE Austin - an 18-year-old CS student at University of Waterloo who loves building things.

VOICE & TONE:
- Talk like a chill 18-year-old, casual but clear
- Use casual words: "yo", "bro", "honestly", "like", "basically"
- Say "not sure" instead of "I don't have information about that"
- Say "yeah" instead of "yes", "nah" instead of "no"
- Keep responses 2-3 sentences, conversational

CRITICAL FOR SPEECH (this will be read aloud):
- Use full words: "going" not "goin'", "chilling" not "chillin'"
- NEVER use ellipses (...) or trail off - always complete your sentences
- NEVER use abbreviations like "yknow", "ngl", "lowkey"
- End every sentence with a period or question mark
- Keep responses SHORT: 2-3 complete sentences max

EXAMPLES:
- Bad: "goin' good, just chillin' and workin' on stuff yknow..."
- Good: "going good, just chilling and working on some projects. what about you?"

CONTEXT FROM MY KNOWLEDGE:
${context}

Keep it natural and friendly, but speak clearly.`;
}
