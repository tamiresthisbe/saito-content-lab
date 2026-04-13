import { useState, useRef } from "react";

const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;

const C = {
  bg: "#080c12",
  surface: "#0d1420",
  card: "#111b2a",
  border: "#1e2d45",
  purple: "#3d8ef5",
  purpleLight: "#7ab8ff",
  purpleDim: "#0f2a55",
  text: "#ddeeff",
  muted: "#5a7a99",
  faint: "#1e3050",
  success: "#3dd68c",
  warn: "#f0a500",
  error: "#f04f4f",
};

const MODELS_IMG = [
  { id: "flux-2-pro", label: "Flux 2 Pro", desc: "cinematográfico editorial — recomendado", cost: "$0.04/img" },
  { id: "mystic", label: "Mystic", desc: "fotorrealista detalhado", cost: "$0.04/img" },
  { id: "seedream-4-5", label: "Seedream 4.5", desc: "alta velocidade, boa qualidade", cost: "$0.02/img" },
];

const TABS = [
  { id: "roteiro", label: "Roteiro", icon: "✦" },
  { id: "validar", label: "Validar", icon: "◈" },
  { id: "gerar", label: "Gerar", icon: "◉" },
  { id: "video", label: "Vídeo", icon: "▶" },
  { id: "log", label: "Log", icon: "≡" },
];

const Tag = ({ children, color = C.purple }) => (
  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `0.5px solid ${color}`, color, letterSpacing: "0.05em" }}>{children}</span>
);

const Btn = ({ children, onClick, disabled, accent, small }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 14px" : "10px 22px",
    fontSize: small ? 12 : 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 8,
    border: `1px solid ${accent ? C.purple : C.border}`,
    background: accent ? C.purpleDim : "transparent",
    color: disabled ? C.muted : (accent ? C.purpleLight : C.text),
    letterSpacing: "0.03em",
    opacity: disabled ? 0.5 : 1,
  }}>{children}</button>
);

export default function App() {
  const [tab, setTab] = useState("roteiro");
  const [script, setScript] = useState("");
  const [imgModel, setImgModel] = useState("flux-2-pro");
  const [videoDuration, setVideoDuration] = useState(5);
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState(null);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const logRef = useRef(null);

  const addLog = (msg, type = "info") => {
    setLog(l => [...l, { msg, type, ts: new Date().toLocaleTimeString("pt-BR") }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 60);
  };

  const callClaude = async (prompt) => {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const d = await res.json();
    return d.content?.[0]?.text || "";
  };

  const calcScenes = (m) => Math.round(m * 60 / 6);
  const approvedCount = scenes.filter(s => s.approved).length;
  const doneCount = scenes.filter(s => s.status === "done").length;
  const costPerImg = imgModel === "seedream-4-5" ? 0.02 : 0.04;
  const estCost = (approvedCount * costPerImg).toFixed(2);
  const targetScenes = calcScenes(videoDuration);

  const updateScene = (idx, field, val) =>
    setScenes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const segmentScript = async () => {
    if (!script.trim()) return;
    const wordCount = script.trim().split(/\s+/).length;
    setBusy(true); setScenes([]); setLog([]); setProgress(0);
    addLog(`Roteiro: ~${wordCount} palavras · Duração: ${videoDuration}min · Meta: ${targetScenes} cenas`);
    try {
      const words = script.trim().split(/\s+/);
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < words.length; i += chunkSize)
        chunks.push(words.slice(i, i + chunkSize).join(" "));
      const scenesPerChunk = Math.ceil(targetScenes / chunks.length);
      addLog(`Processando em ${chunks.length} partes (~${scenesPerChunk} cenas cada)...`);
      let allScenes = [], sceneCounter = 1;

      for (let c = 0; c < chunks.length; c++) {
        addLog(`Parte ${c + 1} de ${chunks.length}...`);
        setProgress(Math.round(((c + 1) / chunks.length) * 100));

        const raw = await callClaude(`
You are an expert art director and prompt engineer specializing in faceless YouTube channels — where the HOST does not appear, but the video can freely include people, faces, hands, environments, and any visual elements that serve the story.

Your job is to analyze the script excerpt and create cinematic, editorial-quality image prompts that visually bring the content to life. Think like a premium brand campaign director: every frame should feel intentional, beautiful, and contextually matched to the script's theme and emotion.

VISUAL STYLE GUIDE by theme (adapt freely based on actual script content):
- Health/Beauty: warm editorial lighting, marble surfaces, luxury products, close-up textures, people seen from behind or at angle, golden hour tones
- Finance/Business: clean office environments, data visualizations, hands on documents, architectural shots, confident compositions
- Psychology/Mind: conceptual imagery, abstract light patterns, human silhouettes, contemplative environments, depth of field
- Technology/AI: interfaces, screens with code, human-machine interaction, blue/white tones, modern workspaces
- Sports/Movement: dynamic angles, motion blur, athletic environments, energy and tension
- Philosophy/Science: macro details, natural phenomena, cosmic scale, timeless environments

For each scene generate:
1. scene_desc: short description in Portuguese of what the scene represents (1 line)
2. narration: exact lines from the script for that scene
3. img_prompt: a detailed, professional English image prompt. Include: subject, setting, lighting, mood, camera angle, color palette, visual style. End every prompt with: "sharp focus, professional photography, high resolution, natural exposure, clean composition." Match the quality level of a premium editorial or brand campaign. The host never appears — but other people, faces, environments are welcome when they serve the story.
4. vid_prompt: short English motion prompt (slow zoom, parallax, pan, light shift). 1 sentence.

RULES:
- Generate EXACTLY ${scenesPerChunk} scenes.
- Start scene numbering from ${sceneCounter}.
- Think of scenes as a visual story arc: establish context early, build in the middle, resolve or inspire at the end.
- Each img_prompt must be unique and specific to that script moment — no generic shots.
- Respond ONLY with a valid JSON array. No markdown, no explanation. Start with [ end with ].

FORMAT: [{"scene":${sceneCounter},"scene_desc":"...","narration":"...","img_prompt":"...","vid_prompt":"..."}]

SCRIPT EXCERPT:
${chunks[c]}`);

        const match = raw.match(/\[[\s\S]*?\]/);
        if (!match) { addLog(`Parte ${c + 1}: JSON não encontrado.`, "warn"); continue; }
        try {
          const parsed = JSON.parse(match[0]);
          allScenes = [...allScenes, ...parsed];
          sceneCounter += parsed.length;
          addLog(`Parte ${c + 1}: ${parsed.length} cenas.`, "success");
        } catch { addLog(`Parte ${c + 1}: erro de parse.`, "warn"); }

        if (c < chunks.length - 1) await new Promise(r => setTimeout(r, 5000));
      }

      if (!allScenes.length) throw new Error("Nenhuma cena gerada.");
      allScenes = allScenes.map((s, i) => ({ ...s, scene: i + 1 }));
      setScenes(allScenes.map(s => ({ ...s, approved: true, imgUrl: null, status: "pending", editMode: false })));
      addLog(`${allScenes.length} cenas criadas com sucesso.`, "success");
      setTab("validar");
    } catch (e) {
      addLog("Erro: " + e.message, "error");
      setTab("log");
    }
    setBusy(false);
  };

  const generateImage = async (sc, idx) => {
    try {
      setGeneratingIdx(idx);
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, status: "generating" } : s));

      const res = await fetch("/api/freepik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: sc.img_prompt })
      });

      addLog(`[Cena ${sc.scene}] HTTP ${res.status}`);
      const d = await res.json();

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${d?.message || d?.error || JSON.stringify(d)}`);

      const taskId = d?.data?.task_id;
      if (!taskId) {
        addLog(`[Cena ${sc.scene}] Sem task_id: ${JSON.stringify(d).slice(0, 150)}`, "warn");
        throw new Error("Sem task_id na resposta");
      }

      addLog(`[Cena ${sc.scene}] Task ${taskId} — aguardando...`);

      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const poll = await fetch(`/api/freepik?taskId=${taskId}`);
        const pd = await poll.json();
        const status = pd?.data?.status;
        addLog(`[Cena ${sc.scene}] Poll ${i + 1}: ${status}`);

        if (status === "completed" || status === "COMPLETED") {
          const base64 = pd?.data?.base64 || pd?.data?.[0]?.base64;
          const rawUrl = pd?.data?.url || pd?.data?.[0]?.url || pd?.data?.images?.[0]?.url;
          const imgUrl = base64 ? `data:image/jpeg;base64,${base64}` : rawUrl || null;
          setScenes(prev => prev.map((s, i) => i === idx ? { ...s, imgUrl, status: imgUrl ? "done" : "error" } : s));
          if (imgUrl) addLog(`[Cena ${sc.scene}] Imagem pronta.`, "success");
          else addLog(`[Cena ${sc.scene}] Sem imagem no retorno: ${JSON.stringify(pd).slice(0, 200)}`, "warn");
          return !!imgUrl;
        }
        if (status === "failed" || status === "FAILED") {
          throw new Error(`Geração falhou: ${JSON.stringify(pd).slice(0, 150)}`);
        }
      }
      throw new Error("Timeout: imagem não ficou pronta em 160 segundos");
    } catch (e) {
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, status: "error" } : s));
      addLog(`[Cena ${sc.scene}] ERRO: ${e.message}`, "error");
      return false;
    }
  };

  const runPipeline = async () => {
    const toGen = scenes.filter(s => s.approved && s.status !== "done");
    if (!toGen.length) return;
    setBusy(true); setTab("gerar");
    addLog(`Iniciando geração de ${toGen.length} imagens com ${imgModel}...`);
    let done = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (!scenes[i].approved || scenes[i].status === "done") continue;
      await generateImage(scenes[i], i);
      done++;
      setProgress(Math.round((done / toGen.length) * 100));
      await new Promise(r => setTimeout(r, 800));
    }
    setGeneratingIdx(null);
    addLog(`Concluído! ${done} imagens geradas.`, "success");
    setBusy(false);
  };

  const downloadImage = (sc) => {
    if (!sc.imgUrl) return;
    const a = document.createElement("a");
    a.href = sc.imgUrl;
    a.download = `cena_${String(sc.scene).padStart(2, "0")}.jpg`;
    a.click();
  };

  const downloadAll = () => scenes.filter(s => s.imgUrl).forEach((s, i) => setTimeout(() => downloadImage(s), i * 300));
  const copyText = (t) => navigator.clipboard.writeText(t);

  const logColor = { info: C.muted, success: C.success, error: C.error, warn: C.warn };
  const statusCfg = {
    pending: [C.faint, "Aguardando"],
    generating: [C.warn, "Gerando..."],
    done: [C.success, "Pronta"],
    error: [C.error, "Erro"]
  };

  const S = {
    page: { background: C.bg, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: C.text },
    header: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 },
    logoMark: { width: 32, height: 32, borderRadius: 8, background: C.purpleDim, border: `1px solid ${C.purple}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.purpleLight },
    nav: { display: "flex", gap: 2, background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` },
    navBtn: (active) => ({ padding: "6px 14px", fontSize: 12, fontWeight: active ? 500 : 400, cursor: "pointer", borderRadius: 7, border: "none", background: active ? C.purpleDim : "transparent", color: active ? C.purpleLight : C.muted, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6 }),
    main: { padding: "24px 24px 40px" },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 22px", marginBottom: 16 },
    label: { fontSize: 11, color: C.muted, letterSpacing: "0.08em", marginBottom: 6, display: "block" },
    textarea: { width: "100%", minHeight: 200, fontSize: 13, lineHeight: 1.7, padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "inherit" },
    row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    stat: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 100 },
    progressBar: { height: 3, background: C.border, borderRadius: 2, overflow: "hidden", marginBottom: 20 },
    progressFill: { height: "100%", background: C.purple, borderRadius: 2, transition: "width 0.4s" },
    sceneCard: (approved) => ({ background: C.surface, border: `1px solid ${approved ? C.border : C.faint}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }),
    imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
    imgCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" },
    vidCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" },
    logBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", maxHeight: 420, overflowY: "auto" },
    sectionTitle: { fontSize: 12, fontWeight: 500, color: C.muted, letterSpacing: "0.08em", marginBottom: 14 },
  };

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>

      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.logoMark}>TS</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "0.02em" }}>Saito Content Lab</div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em" }}>VIDEO PIPELINE</div>
          </div>
        </div>
        <nav style={S.nav}>
          {TABS.map(t => {
            const count = t.id === "validar" && scenes.length ? ` ${approvedCount}/${scenes.length}` :
                          t.id === "gerar" && doneCount ? ` ${doneCount}/${scenes.length}` : "";
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={S.navBtn(tab === t.id)}>
                <span style={{ fontSize: 10 }}>{t.icon}</span>{t.label}{count}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={S.main}>

        {tab === "roteiro" && (
          <div>
            <div style={S.card}>
              <span style={S.label}>ROTEIRO DO EPISÓDIO</span>
              <textarea style={S.textarea} value={script} onChange={e => setScript(e.target.value)}
                placeholder="Cole o roteiro completo aqui..." />
            </div>

            <div style={S.card}>
              <p style={S.sectionTitle}>DURAÇÃO DO VÍDEO</p>
              <div style={{ ...S.row, marginBottom: 14 }}>
                <div style={S.stat}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{videoDuration}<span style={{ fontSize: 13, color: C.muted }}>min</span></div>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>DURAÇÃO</div>
                </div>
                <div style={S.stat}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{targetScenes}</div>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>CENAS</div>
                </div>
                <div style={S.stat}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: C.success }}>${(targetScenes * costPerImg).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>EST. API</div>
                </div>
              </div>
              <input type="range" min="1" max="20" step="1" value={videoDuration}
                onChange={e => setVideoDuration(Number(e.target.value))}
                style={{ width: "100%", accentColor: C.purple }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint, marginTop: 4 }}>
                {[1, 5, 10, 15, 20].map(v => <span key={v}>{v}min</span>)}
              </div>
            </div>

            <div style={S.card}>
              <p style={S.sectionTitle}>MODELO DE IMAGEM</p>
              {MODELS_IMG.map(m => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "10px 14px", borderRadius: 8, border: `1px solid ${imgModel === m.id ? C.purple : C.border}`, background: imgModel === m.id ? C.purpleDim + "66" : "transparent", marginBottom: 8 }}>
                  <input type="radio" name="img" value={m.id} checked={imgModel === m.id} onChange={() => setImgModel(m.id)} style={{ accentColor: C.purple }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.label}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{m.desc}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.success, fontWeight: 500 }}>{m.cost}</span>
                </label>
              ))}
            </div>

            <Btn onClick={segmentScript} disabled={busy || !script.trim()} accent>
              {busy ? "Analisando roteiro..." : `Segmentar com Claude — ${targetScenes} cenas`}
            </Btn>
          </div>
        )}

        {tab === "validar" && (
          <div>
            {!scenes.length ? (
              <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <p style={{ color: C.muted, fontSize: 14 }}>Nenhuma cena ainda. Vá para Roteiro e segmente primeiro.</p>
              </div>
            ) : (
              <>
                <div style={{ ...S.row, marginBottom: 16 }}>
                  <div style={S.stat}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{approvedCount}</div>
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>APROVADAS</div>
                  </div>
                  <div style={S.stat}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: C.success }}>${estCost}</div>
                    <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>CUSTO EST.</div>
                  </div>
                  <Btn onClick={() => setScenes(s => s.map(sc => ({ ...sc, approved: true })))} small>Aprovar todas</Btn>
                  <Btn onClick={() => setScenes(s => s.map(sc => ({ ...sc, approved: false })))} small>Desmarcar</Btn>
                </div>
                {scenes.map((s, i) => (
                  <div key={i} style={S.sceneCard(s.approved)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: s.editMode ? 12 : 0 }}>
                      <input type="checkbox" checked={s.approved} onChange={e => updateScene(i, "approved", e.target.checked)}
                        style={{ accentColor: C.purple, width: 15, height: 15, cursor: "pointer" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>#{String(s.scene).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{s.scene_desc}</span>
                      <button onClick={() => updateScene(i, "editMode", !s.editMode)}
                        style={{ fontSize: 11, padding: "3px 10px", cursor: "pointer", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>
                        {s.editMode ? "Fechar" : "Editar"}
                      </button>
                    </div>
                    {s.editMode && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        <span style={S.label}>PROMPT DE IMAGEM</span>
                        <textarea value={s.img_prompt} onChange={e => updateScene(i, "img_prompt", e.target.value)}
                          style={{ ...S.textarea, minHeight: 80, fontSize: 12 }} />
                        <span style={S.label}>NARRAÇÃO</span>
                        <textarea value={s.narration} onChange={e => updateScene(i, "narration", e.target.value)}
                          style={{ ...S.textarea, minHeight: 50, fontSize: 12 }} />
                        <span style={S.label}>PROMPT DE VÍDEO</span>
                        <textarea value={s.vid_prompt} onChange={e => updateScene(i, "vid_prompt", e.target.value)}
                          style={{ ...S.textarea, minHeight: 50, fontSize: 12 }} />
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <Btn onClick={runPipeline} disabled={busy || !approvedCount} accent>
                    Gerar {approvedCount} imagens (~${estCost}) →
                  </Btn>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "gerar" && (
          <div>
            {busy && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 8 }}>
                  <span>Gerando imagens via Freepik API ({imgModel})...</span>
                  <span style={{ color: C.purpleLight, fontWeight: 600 }}>{progress}%</span>
                </div>
                <div style={S.progressBar}><div style={{ ...S.progressFill, width: `${progress}%` }} /></div>
              </div>
            )}
            <div style={{ ...S.row, marginBottom: 16 }}>
              <div style={S.stat}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{doneCount}</div>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>GERADAS</div>
              </div>
              <div style={S.stat}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.error }}>{scenes.filter(s => s.status === "error").length}</div>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>ERROS</div>
              </div>
              <div style={S.stat}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.muted }}>{scenes.filter(s => s.status === "pending" || s.status === "generating").length}</div>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>PENDENTES</div>
              </div>
              {doneCount > 0 && <Btn onClick={downloadAll} small>Baixar todas ({doneCount})</Btn>}
            </div>
            <div style={S.imgGrid}>
              {scenes.map((s, i) => {
                const [stColor, stLabel] = statusCfg[s.status] || statusCfg.pending;
                return (
                  <div key={i} style={S.imgCard}>
                    {s.imgUrl
                      ? <img src={s.imgUrl} alt={`cena ${s.scene}`} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                      : <div style={{ width: "100%", aspectRatio: "16/9", background: C.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {generatingIdx === i && <div style={{ width: 20, height: 20, border: `2px solid ${C.purpleDim}`, borderTop: `2px solid ${C.purple}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                          <span style={{ fontSize: 11, color: stColor }}>{generatingIdx === i ? "Gerando..." : stLabel}</span>
                        </div>
                    }
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>#{String(s.scene).padStart(2, "0")}</span>
                        <Tag color={stColor}>{stLabel}</Tag>
                      </div>
                      <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px", lineHeight: 1.4 }}>{s.scene_desc}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {s.imgUrl && <Btn onClick={() => downloadImage(s)} small>Baixar</Btn>}
                        {(s.status === "done" || s.status === "error") && (
                          <Btn onClick={async () => { setBusy(true); await generateImage(s, i); setGeneratingIdx(null); setBusy(false); }} disabled={busy} small>
                            {s.status === "error" ? "Tentar" : "Regerar"}
                          </Btn>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "video" && (
          <div>
            <div style={{ ...S.card, marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Baixe as imagens geradas → acesse freepik.com → Gerador de vídeo → suba a imagem e cole o prompt abaixo. Coberto pelo seu Premium+.
              </p>
            </div>
            {!scenes.length
              ? <p style={{ color: C.muted }}>Nenhuma cena ainda.</p>
              : scenes.map((s, i) => (
                <div key={i} style={S.vidCard}>
                  {s.imgUrl
                    ? <img src={s.imgUrl} alt="" style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: `1px solid ${C.border}` }} />
                    : <div style={{ width: 64, height: 36, background: C.card, borderRadius: 6, flexShrink: 0, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 10, color: C.faint }}>#{s.scene}</span>
                      </div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>#{String(s.scene).padStart(2, "0")}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{s.scene_desc}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.5 }}>{s.vid_prompt}</p>
                  </div>
                  <button onClick={() => copyText(s.vid_prompt)}
                    style={{ fontSize: 11, padding: "5px 12px", cursor: "pointer", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, flexShrink: 0 }}>
                    Copiar
                  </button>
                </div>
              ))
            }
          </div>
        )}

        {tab === "log" && (
          <div ref={logRef} style={S.logBox}>
            {!log.length
              ? <p style={{ fontSize: 13, color: C.faint, margin: 0 }}>Nenhum log ainda.</p>
              : log.map((l, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 6, display: "flex", gap: 12, fontFamily: "monospace" }}>
                  <span style={{ color: C.faint, minWidth: 70, flexShrink: 0 }}>{l.ts}</span>
                  <span style={{ color: logColor[l.type] }}>{l.msg}</span>
                </div>
              ))
            }
          </div>
        )}

      </div>
    </div>
  );
}
