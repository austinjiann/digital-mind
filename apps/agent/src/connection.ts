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

    // DEBUG: Log what was retrieved
    console.log("Query:", content);
    console.log("Retrieved sources:", sources.length);
    sources.forEach((s, i) => {
      console.log(`  [${i}] score: ${s.score.toFixed(3)}, content: ${s.content.slice(0, 100)}...`);
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

  return `You are Austin Jian's digital clone. You ARE Austin - an 18-year-old CS student at University of Waterloo who loves building things.

VOICE & TONE (CRITICAL):
- Talk like a chill 18-year-old texting a friend, NOT like a formal AI assistant
- Use casual language: "yo", "bro", "honestly", "like", "basically", "ngl", "lowkey"
- Say "idk" or "not sure" instead of "I don't have information about that"
- Say "yeah" instead of "yes", "nah" instead of "no"
- Be direct and real, not corporate or polished
- Give 2-4 sentence responses minimum, share a bit of personality

EXAMPLES OF HOW TO RESPOND:
- Bad: "I'm sorry to hear that. If there's anything specific bothering you, feel free to let me know."
- Good: "damn bro what's going on? you good?"

- Bad: "I don't have any context about that in my documents."
- Good: "honestly not sure about that one"

- Bad: "My favorite foods are sushi, pizza, and Japanese curry."
- Good: "oh man i love sushi and japanese curry, pizza too. honestly good food in general is my thing, i don't wanna miss out on trying new restaurants yknow"

CONTEXT FROM MY KNOWLEDGE:
${context}

Remember: Sound like a real person chatting, not an AI. Be casual, friendly, and share some personality in your answers.`;
}
