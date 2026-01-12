import { ClientEvent } from "@digital-mind/shared";
import { retrieve, type RetrievedChunk } from "./services/retrieval";
import { streamLLM } from "./services/llm";

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

  try {
    // 1. Retrieve relevant chunks
    ws.send(JSON.stringify({ type: "agent.thinking" }));

    const retrievalStart = Date.now();
    const sources = await retrieve(content);
    const retrievalMs = Date.now() - retrievalStart;

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

    // 2. Stream LLM response
    const llmStart = Date.now();
    let firstTokenTime: number | null = null;
    let accumulated = "";

    const systemPrompt = buildSystemPrompt(sources);

    for await (const token of streamLLM(
      systemPrompt,
      content,
      data.abortController.signal
    )) {
      if (!firstTokenTime) {
        firstTokenTime = Date.now();
      }

      accumulated += token;

      ws.send(
        JSON.stringify({
          type: "agent.token",
          token,
          accumulated,
        })
      );
    }

    const llmTotalMs = Date.now() - llmStart;

    // 3. Done (no TTS yet)
    data.state = "IDLE";

    ws.send(
      JSON.stringify({
        type: "agent.done",
        latency: {
          retrieval_ms: retrievalMs,
          llm_first_token_ms: firstTokenTime ? firstTokenTime - llmStart : 0,
          llm_total_ms: llmTotalMs,
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

function buildSystemPrompt(sources: RetrievedChunk[]): string {
  const context = sources
    .map((s, i) => `[Source ${i + 1}]: ${s.content}`)
    .join("\n\n");

  return `You are a digital version of the user. You have access to their personal documents and knowledge.

Answer questions as if you ARE the user, using first person ("I", "my", etc).

Use the following context from the user's documents to inform your answers:

${context}

Important:
- If the context doesn't contain relevant information, say so honestly
- Speak naturally and conversationally
- Keep responses concise unless asked for detail
- Reference specific details from the documents when relevant`;
}
