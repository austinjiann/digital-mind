import { encode } from "gpt-tokenizer";

interface ChunkOptions {
  maxTokens: number;
  overlap: number;
}

interface Chunk {
  content: string;
  tokenCount: number;
  metadata: {
    startChar: number;
    endChar: number;
  };
}

export function chunkText(text: string, options: ChunkOptions): Chunk[] {
  const { maxTokens } = options;
  const chunks: Chunk[] = [];

  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let currentTokens = 0;
  let startChar = 0;
  let currentStartChar = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    const paraTokens = encode(trimmedPara).length;

    // If adding this paragraph would exceed max tokens, save current chunk
    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens,
        metadata: {
          startChar: currentStartChar,
          endChar: startChar + currentChunk.length,
        },
      });

      // Start new chunk with overlap (keep last ~10% of words)
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(words.length * 0.1));
      currentChunk = overlapWords.join(" ") + "\n\n" + trimmedPara;
      currentTokens = encode(currentChunk).length;
      currentStartChar = startChar + currentChunk.length - overlapWords.join(" ").length;
    } else {
      // Add to current chunk
      if (currentChunk) {
        currentChunk += "\n\n" + trimmedPara;
      } else {
        currentChunk = trimmedPara;
        currentStartChar = startChar;
      }
      currentTokens = encode(currentChunk).length;
    }

    startChar += para.length + 2; // +2 for the \n\n we split on
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: currentTokens,
      metadata: {
        startChar: currentStartChar,
        endChar: startChar,
      },
    });
  }

  return chunks;
}
