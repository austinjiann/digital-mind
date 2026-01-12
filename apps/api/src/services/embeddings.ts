import OpenAI from "openai";

const openai = new OpenAI();

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Batch in groups of 100 (API limit)
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  return response.data[0].embedding;
}
