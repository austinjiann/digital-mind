import { Hono } from "hono";
import { supabase } from "../db/client";
import { processDocument } from "../services/processor";

const docs = new Hono();

// Upload document
docs.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // Upload to Supabase Storage
  const storagePath = `documents/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file);

  if (uploadError) {
    return c.json({ error: uploadError.message }, 500);
  }

  // Create document record
  const { data: doc, error: dbError } = await supabase
    .from("documents")
    .insert({
      filename: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      status: "pending",
    })
    .select()
    .single();

  if (dbError) {
    return c.json({ error: dbError.message }, 500);
  }

  // Process async (in real app, use a job queue)
  processDocument(doc.id).catch(console.error);

  return c.json({ document: doc });
});

// List documents
docs.get("/", async (c) => {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ documents: data });
});

// Get single document
docs.get("/:id", async (c) => {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ document: data });
});

// Get document chunks
docs.get("/:id/chunks", async (c) => {
  const { data, error } = await supabase
    .from("chunks")
    .select("*")
    .eq("document_id", c.req.param("id"))
    .order("chunk_index");

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ chunks: data });
});

// Delete document
docs.delete("/:id", async (c) => {
  const docId = c.req.param("id");

  // Get the document first to get storage path
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", docId)
    .single();

  if (fetchError) {
    return c.json({ error: fetchError.message }, 500);
  }

  // Delete from storage
  if (doc?.storage_path) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
  }

  // Delete from database (chunks will cascade)
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", docId);

  if (deleteError) {
    return c.json({ error: deleteError.message }, 500);
  }

  return c.json({ success: true });
});

export { docs };
