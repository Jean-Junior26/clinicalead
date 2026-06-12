// ============================================================
// CLINICALEAD — LIMPEZA AUTOMÁTICA DE MÍDIAS
// Apaga do Storage as mídias com mais de DIAS_RETENCAO dias
// (buckets: midias e audios) e marca as mensagens antigas
// como "mídia indisponível" no Inbox.
// Chamado por um cron 1x por dia.
// ============================================================

const DIAS_RETENCAO = 7; // ← mude aqui quantos dias as mídias ficam guardadas

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const TOKEN = process.env.LEMBRETES_TOKEN;

  // ── Segurança ──────────────────────────────────────────────
  const tokenRecebido = req.query?.token || req.headers['x-token'];
  if (!TOKEN || tokenRecebido !== TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  const corte = new Date(Date.now() - DIAS_RETENCAO * 24 * 3600 * 1000);
  const corteISO = corte.toISOString();

  // ── Limpa um bucket: lista arquivos antigos e apaga em lote ─
  async function limparBucket(bucket) {
    let apagados = 0;
    let erros = 0;

    // Pagina a listagem (até 1000 por página)
    for (let pagina = 0; pagina < 20; pagina++) {
      const listResp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          prefix: '',
          limit: 1000,
          offset: 0, // sempre 0: a cada rodada os antigos já foram removidos
          sortBy: { column: 'created_at', order: 'asc' },
        }),
      });
      if (!listResp.ok) { erros++; break; }
      const arquivos = await listResp.json();
      if (!Array.isArray(arquivos) || !arquivos.length) break;

      // Só os mais antigos que o corte
      const antigos = arquivos
        .filter(a => a.name && a.created_at && new Date(a.created_at) < corte)
        .map(a => a.name);

      if (!antigos.length) break; // listagem em ordem crescente: se a página não tem antigos, acabou

      // Apaga em lote
      const delResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: sbHeaders,
        body: JSON.stringify({ prefixes: antigos }),
      });
      if (delResp.ok) {
        apagados += antigos.length;
      } else {
        erros++;
        break;
      }

      if (antigos.length < arquivos.length) break; // já chegou nos arquivos recentes
    }

    return { apagados, erros };
  }

  try {
    const midias = await limparBucket('midias');
    const audios = await limparBucket('audios');

    // ── Marca as mensagens antigas como sem mídia (Inbox mostra placeholder) ─
    const patchResp = await fetch(
      `${SUPABASE_URL}/rest/v1/mensagens?media_url=not.is.null&created_at=lt.${encodeURIComponent(corteISO)}`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ media_url: null }),
      }
    );

    return res.status(200).json({
      ok: true,
      retencao_dias: DIAS_RETENCAO,
      apagado_antes_de: corteISO,
      midias_apagadas: midias.apagados,
      audios_apagados: audios.apagados,
      mensagens_atualizadas: patchResp.ok,
      erros: midias.erros + audios.erros,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
