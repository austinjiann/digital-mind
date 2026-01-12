import OpenAI from "openai";

const openai = new OpenAI();

export async function* streamLLM(
  systemPrompt: string,
  userMessage: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const token = chunk.choices[0]?.delta?.content;
    if (token) {
      yield token;
    }
  }
}
