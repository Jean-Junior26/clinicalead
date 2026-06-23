// ============================================================
// CLINICALEAD — Edge Function "brian" (Atendente IA — Fase 1: sugerir)
// Lê o histórico da conversa + contexto da clínica, chama a API da
// Claude (Anthropic) e devolve uma SUGESTÃO de resposta. O humano
// revisa e envia. Trava de segurança: nunca inventa preço/data/saúde.
// Requer secret ANTHROPIC_API_KEY no projeto Supabase.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

// Modelo: Sonnet = ótima qualidade. Pra baratear, troque por "claude-haiku-4-5-20251001".
const MODEL = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

function textoDe(m: any): string {
  if (m.type === "text" || !m.type) return (m.content || "").trim();
  const map: Record<string, string> = { image: "[imagem]", audio: "[áudio]", sticker: "[figurinha]", video: "[vídeo]", document: "[documento]" };
  return map[m.type] || (m.content || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!ANTHROPIC_KEY) return json({ ok: false, erro: "Configure a chave da IA (ANTHROPIC_API_KEY) nas secrets do Supabase." }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ ok: false, erro: "Sem autenticação." }, 401);
    const auth = createClient(URL_SB, ANON, { global: { headers: { Authorization: authHeader } } });
    const svc = createClient(URL_SB, SERVICE);

    const { data: u } = await auth.auth.getUser();
    if (!u?.user) return json({ ok: false, erro: "Usuário inválido." }, 401);

    const body = await req.json();
    if (body.action !== "sugerir") return json({ ok: false, erro: "Ação desconhecida." }, 400);
    const clinicId = body.clinic_id;
    const phone = String(body.phone || "").replace(/\D/g, "");
    if (!clinicId || !phone) return json({ ok: false, erro: "Faltou clinic_id ou phone." }, 400);

    // valida acesso do usuário à clínica (RLS) e pega dados básicos
    const { data: clinica } = await auth.from("clinicas").select("id, nome, endereco, telefone").eq("id", clinicId).maybeSingle();
    if (!clinica) return json({ ok: false, erro: "Sem acesso a esta clínica." }, 403);

    // contexto + nome do atendente configurados do Brian
    const { data: cfg } = await svc.from("brian_config").select("contexto, nome_atendente").eq("clinic_id", clinicId).maybeSingle();
    const contextoExtra = (cfg && cfg.contexto) ? cfg.contexto : "";
    const nomeAtendente = (cfg && cfg.nome_atendente && cfg.nome_atendente.trim()) ? cfg.nome_atendente.trim() : "Brian";

    // últimas mensagens da conversa
    const { data: msgsDesc } = await svc.from("mensagens")
      .select("content, from_me, type, created_at")
      .eq("clinic_id", clinicId).eq("phone", phone)
      .order("created_at", { ascending: false }).limit(30);
    const msgs = (msgsDesc || []).slice().reverse();

    // monta os turnos (lead = user, clínica = assistant), mesclando consecutivos
    const raw = msgs.map((m: any) => ({ role: m.from_me ? "assistant" : "user", content: textoDe(m) })).filter((x: any) => x.content);
    const merged: any[] = [];
    for (const m of raw) {
      if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += "\n" + m.content;
      else merged.push({ ...m });
    }
    while (merged.length && merged[0].role === "assistant") merged.shift();
    if (!merged.length) merged.push({ role: "user", content: "(O cliente iniciou a conversa.)" });

    const system = `Você é o ${nomeAtendente}, atendente virtual da clínica odontológica "${clinica.nome || "a clínica"}". Você atende leads e pacientes pelo WhatsApp de forma calorosa, educada e profissional, em português do Brasil, com mensagens curtas e naturais (estilo WhatsApp, pode usar 1 emoji quando fizer sentido).

REGRAS INVIOLÁVEIS:
- NUNCA invente preços, valores, descontos, datas ou horários disponíveis. Se isso não estiver no CONTEXTO abaixo, diga que vai confirmar com a equipe.
- NUNCA dê diagnóstico, prescrição ou qualquer orientação clínica/de saúde. Oriente a agendar uma avaliação.
- Só afirme informações que estejam no CONTEXTO DA CLÍNICA. Se não souber algo, seja honesto e ofereça encaminhar para um atendente humano.
- Não invente endereço, telefone, nomes de profissionais ou procedimentos não listados.
- Seu objetivo é acolher, tirar dúvidas e incentivar o agendamento de uma avaliação — sem prometer nada não autorizado.

CONTEXTO DA CLÍNICA:
Nome: ${clinica.nome || "—"}
Endereço: ${clinica.endereco || "não informado"}
Telefone: ${clinica.telefone || "não informado"}
${contextoExtra ? "Informações adicionais fornecidas pela clínica:\n" + contextoExtra : "(A clínica ainda não cadastrou informações adicionais — seja mais cauteloso e encaminhe ao humano quando faltar informação.)"}

Gere APENAS a próxima mensagem do atendente (${nomeAtendente}) respondendo ao paciente. Não inclua rótulos, aspas, nem explicações — só o texto da mensagem, pronto pra enviar.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, temperature: 0.7, system, messages: merged }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return json({ ok: false, erro: data?.error?.message || "Falha na IA.", status: resp.status }, 400);
    }
    const sugestao = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();

    // registra uso (base pra cobrança)
    try {
      await svc.from("brian_uso").insert({
        clinic_id: clinicId,
        tokens_in: data.usage?.input_tokens || 0,
        tokens_out: data.usage?.output_tokens || 0,
      });
    } catch (e) { /* não bloqueia a resposta */ }

    return json({ ok: true, sugestao });
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});
