# Digital Mind

A digital clone that answers questions about me using RAG and voice cloning.


https://github.com/user-attachments/assets/1984133f-5cbd-4992-8a96-c50207c7678c



## Tech Stack

**Frontend:** Next.js 14, TypeScript, Tailwind CSS, Framer Motion

**Backend:** Bun, WebSocket, Supabase (pgvector), OpenAI GPT-4o

**Voice:** XTTS v2 on Modal serverless GPUs

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- Supabase project with pgvector extension
- OpenAI API key
- Modal account for TTS service

### Installation

```bash
bun install
```

### Environment Variables

Copy the example env files and fill in your values:

```bash
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
```

**apps/agent/.env**
```
PORT=3002
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
OPENAI_API_KEY=your_openai_key
MODAL_TTS_URL=https://your-modal-app--tts-service.modal.run
```

**apps/web/.env**
```
NEXT_PUBLIC_WS_URL=ws://localhost:3002
```

### Run

```bash
# Start the agent backend
cd apps/agent && bun dev

# Start the web frontend (in another terminal)
cd apps/web && bun dev
```

Open [http://localhost:3000](http://localhost:3000)
