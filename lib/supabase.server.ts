import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

let client: SupabaseClient | null = null;

/**
 * Client Supabase com a chave SERVICE_ROLE — SOMENTE server-side.
 * Nunca importar de componentes client ("use client") nem expor a chave.
 * A chave bypassa RLS (que bloqueia o acesso direto anônimo).
 */
export async function getSupabase(): Promise<SupabaseClient> {
  await connection();
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}