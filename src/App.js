import { useState, useRef } from "react";

const C = {
  bg: "#080c12", surface: "#0d1420", card: "#111b2a", border: "#1e2d45",
  purple: "#3d8ef5", purpleLight: "#7ab8ff", purpleDim: "#0f2a55",
  text: "#ddeeff", muted: "#5a7a99", faint: "#1e3050",
  success: "#3dd68c", warn: "#f0a500", error: "#f04f4f",
};

const CONTENT_TYPES = [
  { id: "realista", label: "Realista", desc: "Fotográfico, cinematográfico, editorial", icon: "◈" },
  { id: "explicativo", label: "Explicativo", desc: "Whiteboard, infográfico, stick figure, diagrama", icon: "◻" },
];

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
  { id: "historico", label: "Histórico", icon: "◷" },
  { id: "log", label: "Log", icon: "≡" },
];

const Tag = ({ children, color = C.purple }) => (
  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `0.5px solid ${color}`, color, letterSpacing: "0.05em" }}>{children}</span>
);

const Btn = ({ children, onClick, disabled, accent, small }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 14px" : "10px 22px", fontSize: small ? 12 : 13, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer", borderRadius: 8,
    border: `1px solid ${accent ? C.purple : C.border}`,
    background: accent ? C.purpleDim : "transparent",
    color: disabled ? C.muted : (accent ? C.purpleLight : C.text),
    letterSpacing: "0.03em", opacity: disabled ? 0.5 : 1,
  }}>{children}</button>
);

export default function App() {
  const [tab, setTab] = useState("roteiro");
  const [script, setScript] = useState("");
  const [contentType, setContentType] = useState("realista");
  const [imgModel, setImgModel] = useState("flux-2-pro");
  const [videoDuration, setVideoDuration] = useState(5);
  const [customScenes, setCustomScenes] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState(null);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [regenList, setRegenList] = useState([]);
  const [historico, setHistorico] = useState(() => {
    try {
      const raw = localStorage.getItem("scl_historico");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const semana = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return parsed.filter(h => h.timestamp > semana);
    } catch { return []; }
  });
  const [historicoAberto, setHistoricoAberto] = useState(null);
  const logRef = useRef(null);

  const addLog = (msg, type = "info") => {
    setLog(l => [...l, { msg, type, ts: new Date().toLocaleTimeString("pt-BR") }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 60);
  };

  const callClaude = async (prompt) => {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: prompt }] })
    });
    const d = await res.json();
    return d.content?.[0]?.text || "";
  };

  const calcScenes = (m) => Math.round(m * 60 / 6);
  const approvedCount = scenes.filter(s => s.approved).length;
  const doneCount = scenes.filter(s => s.status === "done").length;
  const costPerImg = imgModel === "seedream-4-5" ? 0.02 : 0.04;
  const estCost = (approvedCount * costPerImg).toFixed(2);
  const targetScenes = customScenes !== null ? customScenes : calcScenes(videoDuration);

  const updateScene = (idx, field, val) =>
    setScenes(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const toggleRegen = (idx) =>
    setRegenList(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);

  const salvarHistorico = (scenesData, scriptText) => {
    try {
      const titulo = scriptText.trim().split("\n")[0].slice(0, 60) || "Episódio sem título";
      const entrada = {
        id: Date.now(), timestamp: Date.now(),
        titulo, contentType,
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        cenas: scenesData.map(s => ({
          scene: s.scene, scene_desc: s.scene_desc,
          narration: s.narration, vid_prompt: s.vid_prompt,
        }))
      };
      const semana = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const anterior = (() => {
        try { return JSON.parse(localStorage.getItem("scl_historico") || "[]"); } catch { return []; }
      })().filter(h => h.timestamp > semana);
      const novo = [entrada, ...anterior].slice(0, 30);
      localStorage.setItem("scl_historico", JSON.stringify(novo));
      setHistorico(novo);
      addLog(`Histórico salvo: "${titulo}"`, "success");
    } catch (e) { addLog(`Erro ao salvar histórico: ${e.message}`, "warn"); }
  };

  const deletarHistorico = (id) => {
    const novo = historico.filter(h => h.id !== id);
    localStorage.setItem("scl_historico", JSON.stringify(novo));
    setHistorico(novo);
    if (historicoAberto?.id === id) setHistoricoAberto(null);
  };

  const buildPrompt = (chunks, c, scenesPerChunk, sceneCounter) => {
    const base = `
RULES:
- Generate EXACTLY ${scenesPerChunk} scenes.
- Start scene numbering from ${sceneCounter}.
- Think of scenes as a visual story arc: establish context early, build in the middle, resolve or inspire at the end.
- Each img_prompt must be unique and specific to that script moment.
- Respond ONLY with a valid JSON array. No markdown, no explanation. Start with [ end with ].
FORMAT: [{"scene":${sceneCounter},"scene_desc":"...","narration":"...","img_prompt":"...","vid_prompt":"..."}]
SCRIPT EXCERPT:
${chunks[c]}`;

    if (contentType === "explicativo") {
      return `You are an expert art director specializing in whiteboard animation and explainer video content for educational YouTube channels.

Your job is to analyze the script excerpt and create image prompts in the style of whiteboard animation — clean, simple, expressive illustrations on white background, hand-drawn black ink style, like a skilled educator drawing on a whiteboard in real time.

VISUAL ELEMENTS you can use depending on the script content:
- Stick figures with expressive faces and body language (sad, confused, happy, thinking, running, pointing)
- Simple diagrams: flowcharts, arrows, boxes, circles, timelines, bar charts, pie charts
- Infographic-style layouts: numbered steps, icons, labels, comparison tables
- Whiteboard sketches: light bulb for ideas, gears for systems, brain for thinking, magnifier for analysis
- Speech bubbles, thought clouds, question marks, exclamation points
- Simple scenery: house, office desk, city skyline — all in minimalist line art
- Text elements: short keywords, numbers, labels in clean handwriting style (max 4 words)

STYLE RULES (always apply):
- Pure white background
- Black or dark gray ink lines, hand-drawn style
- Minimalist and clean — no color fills unless a single accent color (blue, red, or green) is needed for emphasis
- Characters are stick figures — simple circle head, line body, expressive posture
- Every scene should feel like a frame from a whiteboard animation video

For each scene generate:
1. scene_desc: short description in Portuguese of what the scene represents (1 line)
2. narration: exact lines from the script for that scene
3. img_prompt: detailed English prompt describing the whiteboard illustration. Start with "Whiteboard animation style, black ink on pure white background," — then describe exactly what is drawn: the stick figure pose and expression, what diagram or visual element appears, any text labels. End with "clean hand-drawn illustration, educational explainer video style."
4. vid_prompt: short English motion prompt for subtle animation (drawing-on effect, elements appearing, slow zoom). 1 sentence.
${base}`;
    }

    return `You are an expert art director and prompt engineer specializing in faceless YouTube channels — where the HOST does not appear, but the video can freely include people, faces, hands, environments, and any visual elements that serve the story.

Your job is to analyze the script excerpt and create cinematic, editorial-quality image prompts that visually bring the content to life. Think like a premium brand campaign director: every frame should feel intentional, beautiful, and contextually matched to the script's theme and emotion.

VISUAL STYLE GUIDE by theme:
- Health/Beauty: warm editorial lighting, marble surfaces, luxury products, close-up textures, golden hour tones
- Finance/Business: clean office environments, data visualizations, hands on documents, architectural shots
- Psychology/Mind: conceptual imagery, abstract light patterns, human silhouettes, contemplative environments
- Technology/AI: interfaces, screens, human-machine interaction, blue/white tones, modern workspaces
- Sports/Movement: dynamic angles, motion blur, athletic environments, energy and tension
- Philosophy/Science: macro details, natural phenomena, cosmic scale, timeless environments

For each scene generate:
1. scene_desc: short description in Portuguese of what the scene represents (1 line)
2. narration: exact lines from the script for that scene
3. img_prompt: detailed, professional English image prompt. Include: subject, setting, lighting, mood, camera angle, color palette, visual style. End with: "sharp focus, professional photography, high resolution, natural exposure, clean composition." IMPORTANT TEXT RULE: avoid generic random text on screens. If text is relevant, specify EXACT short words (max 4), e.g. screen showing "Context. Task. Rules." in clean white typography.
4. vid_prompt: short English motion prompt (slow zoom, parallax, pan, light shift). 1 sentence.
${base}`;
  };

  const segmentScript = async () => {
    if (!script.trim()) return;
    const wordCount = script.trim().split(/\s+/).length;
    setBusy(true); setScenes([]); setLog([]); setProgress(0); setRegenList([]);
    addLog(`Roteiro: ~${wordCount} palavras · Tipo: ${contentType} · Meta: ${targetScenes} cenas`);
    try {
      const words = script.trim().split(/\s+/);
      const chunks = [];
      for (let i = 0; i < words.length; i += 100)
        chunks.push(words.slice(i, i + 100).join(" "));
      const scenesPerChunk = Math.ceil(targetScenes / chunks.length);
      addLog(`Processando em ${chunks.length} partes (~${scenesPerChunk} cenas cada)...`);
      let allScenes = [], sceneCounter = 1;

      for (let c = 0; c < chunks.length; c++) {
        addLog(`Parte ${c + 1} de ${chunks.length}...`);
        setProgress(Math.round(((c + 1) / chunks.length) * 100));
        const raw = await callClaude(buildPrompt(chunks, c, scenesPerChunk, sceneCounter));
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
      salvarHistorico(allScenes, script);
      setTab("validar");
    } catch (e) { addLog("Erro: " + e.message, "error"); setTab("log"); }
    setBusy(false);
  };

  const generateImage = async (sc, idx, isRetry = false) => {
    try {
      setGeneratingIdx(idx);
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, status: "generating" } : s));
      if (isRetry) addLog(`[Cena ${sc.scene}] Retentando...`, "warn");

      const res = await fetch("/api/freepik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: sc.img_prompt })
      });
      addLog(`[Cena ${sc.scene}] HTTP ${res.status}`);
      const d = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${d?.message || d?.error || JSON.stringify(d)}`);

      const taskId = d?.data?.task_id;
      if (!taskId) throw new Error(`Sem task_id: ${JSON.stringify(d).slice(0, 150)}`);
      addLog(`[Cena ${sc.scene}] Task ${taskId} — aguardando...`);

      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const poll = await fetch(`/api/freepik?taskId=${taskId}`);
        const pd = await poll.json();
        const status = pd?.data?.status;
        addLog(`[Cena ${sc.scene}] Poll ${i + 1}: ${status}`);

        if (status === "completed" || status === "COMPLETED") {
          const base64 = pd?.data?.base64 || pd?.data?.[0]?.base64;
          const rawUrl = pd?.data?.url || pd?.data?.[0]?.url
            || pd?.data?.images?.[0]?.url
            || pd?.data?.generated?.[0]
            || pd?.data?.generated;
          const imgUrl = base64
            ? `data:image/jpeg;base64,${base64}`
            : (typeof rawUrl === "string" ? rawUrl : null);
          setScenes(prev => prev.map((s, i) => i === idx ? { ...s, imgUrl, status: imgUrl ? "done" : "error" } : s));
          if (imgUrl) addLog(`[Cena ${sc.scene}] Imagem pronta.`, "success");
          else addLog(`[Cena ${sc.scene}] Sem imagem no retorno.`, "warn");
          return !!imgUrl;
        }
        if (status === "failed" || status === "FAILED") {
          if (!isRetry) {
            addLog(`[Cena ${sc.scene}] Falhou — retentando em 5s...`, "warn");
            await new Promise(r => setTimeout(r, 5000));
            return await generateImage(sc, idx, true);
          }
          throw new Error("Falhou novamente. Edite o prompt na aba Validar e clique em Tentar.");
        }
      }
      throw new Error("Timeout após 160 segundos.");
    } catch (e) {
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, status: "error" } : s));
      addLog(`[Cena ${sc.scene}] ERRO: ${e.message}`, "error");
      return false;
    }
  };

  const runPipeline = async () => {
    const toGen = scenes.filter(s => s.approved && s.status !== "done");
    if (!toGen.length) return;
    setBusy(true); setTab("gerar"); setProgress(0);
    addLog(`Iniciando geração de ${toGen.length} imagens...`);
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

  const regenSelected = async () => {
    if (!regenList.length) return;
    setBusy(true); setProgress(0);
    addLog(`Regerando ${regenList.length} imagens...`);
    let done = 0;
    for (const idx of regenList) {
      await generateImage(scenes[idx], idx);
      done++;
      setProgress(Math.round((done / regenList.length) * 100));
      await new Promise(r => setTimeout(r, 800));
    }
    setRegenList([]);
    setGeneratingIdx(null);
    addLog("Regeração concluída!", "success");
    setBusy(false);
  };

  const openImage = (sc) => { if (sc.imgUrl) window.open(sc.imgUrl, "_blank"); };
  const openAll = () => scenes.filter(s => s.imgUrl).forEach((s, i) => setTimeout(() => openImage(s), i * 600));
  const copyText = (t) => navigator.clipboard.writeText(t);

  const logColor = { info: C.muted, success: C.success, error: C.error, warn: C.warn };
  const statusCfg = {
    pending: [C.faint, "Aguardando"], generating: [C.warn, "Gerando..."],
    done: [C.success, "Pronta"], error: [C.error, "Erro"],
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
    imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
    imgCard: (selected) => ({ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", outline: selected ? `2px solid ${C.purple}` : "none", outlineOffset: 2 }),
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
              <textarea style={S.textarea} value={script} onChange={e => setScript(e.target.value)} placeholder="Cole o roteiro completo aqui..." />
            </div>

            <div style={S.card}>
              <p style={S.sectionTitle}>TIPO DE CONTEÚDO</p>
              <div style={{ display: "flex", gap: 10 }}>
                {CONTENT_TYPES.map(ct => (
                  <div key={ct.id} onClick={() => setContentType(ct.id)} style={{ flex: 1, cursor: "pointer", padding: "14px 16px", borderRadius: 10, border: `1px solid ${contentType === ct.id ? C.purple : C.border}`, background: contentType === ct.id ? C.purpleDim + "66" : C.surface }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, color: contentType === ct.id ? C.purpleLight : C.muted }}>{ct.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: contentType === ct.id ? C.purpleLight : C.text }}>{ct.label}</span>
                      {contentType === ct.id && <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.purpleDim, color: C.purpleLight, border: `1px solid ${C.purple}` }}>ATIVO</span>}
                    </div>
                    <span style={{ fontSize: 12, color: C.muted }}>{ct.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <p style={S.sectionTitle}>DURAÇÃO DO VÍDEO</p>
              <div style={{ ...S.row, marginBottom: 14 }}>
                <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{videoDuration}<span style={{ fontSize: 13, color: C.muted }}>min</span></div><div style={{ fontSize: 11, color: C.muted }}>DURAÇÃO</div></div>
                <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{targetScenes}</div><div style={{ fontSize: 11, color: C.muted }}>CENAS</div></div>
                <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.success }}>${(targetScenes * costPerImg).toFixed(2)}</div><div style={{ fontSize: 11, color: C.muted }}>EST. API</div></div>
              </div>
              <input type="range" min="1" max="20" step="1" value={videoDuration}
                onChange={e => { setVideoDuration(Number(e.target.value)); setCustomScenes(null); }}
                style={{ width: "100%", accentColor: C.purple }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint, marginTop: 4 }}>
                {[1,5,10,15,20].map(v => <span key={v}>{v}min</span>)}
              </div>
            </div>

            <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16 }}>
              <div>
                <p style={{ ...S.sectionTitle, marginBottom: 4 }}>NÚMERO DE CENAS</p>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Ajuste manualmente se quiser menos ou mais cenas</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 }}>
                <button onClick={() => setCustomScenes(Math.max(1, targetScenes - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <input type="number" min="1" max="200" value={targetScenes}
                  onChange={e => setCustomScenes(Math.max(1, Math.min(200, Number(e.target.value))))}
                  style={{ width: 64, textAlign: "center", fontSize: 16, fontWeight: 600, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.purple}`, background: C.surface, color: C.purpleLight }} />
                <button onClick={() => setCustomScenes(Math.min(200, targetScenes + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                {customScenes !== null && <button onClick={() => setCustomScenes(null)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}>Reset</button>}
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
                  <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{approvedCount}</div><div style={{ fontSize: 11, color: C.muted }}>APROVADAS</div></div>
                  <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.success }}>${estCost}</div><div style={{ fontSize: 11, color: C.muted }}>CUSTO EST.</div></div>
                  <Btn onClick={() => setScenes(s => s.map(sc => ({ ...sc, approved: true })))} small>Aprovar todas</Btn>
                  <Btn onClick={() => setScenes(s => s.map(sc => ({ ...sc, approved: false })))} small>Desmarcar</Btn>
                </div>
                {scenes.map((s, i) => (
                  <div key={i} style={S.sceneCard(s.approved)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: s.editMode ? 12 : 0 }}>
                      <input type="checkbox" checked={s.approved} onChange={e => updateScene(i, "approved", e.target.checked)} style={{ accentColor: C.purple, width: 15, height: 15, cursor: "pointer" }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>#{String(s.scene).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{s.scene_desc}</span>
                      <button onClick={() => updateScene(i, "editMode", !s.editMode)} style={{ fontSize: 11, padding: "3px 10px", cursor: "pointer", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>
                        {s.editMode ? "Fechar" : "Editar"}
                      </button>
                    </div>
                    {s.editMode && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        <span style={S.label}>PROMPT DE IMAGEM</span>
                        <textarea value={s.img_prompt} onChange={e => updateScene(i, "img_prompt", e.target.value)} style={{ ...S.textarea, minHeight: 80, fontSize: 12 }} />
                        <span style={S.label}>NARRAÇÃO</span>
                        <textarea value={s.narration} onChange={e => updateScene(i, "narration", e.target.value)} style={{ ...S.textarea, minHeight: 50, fontSize: 12 }} />
                        <span style={S.label}>PROMPT DE VÍDEO</span>
                        <textarea value={s.vid_prompt} onChange={e => updateScene(i, "vid_prompt", e.target.value)} style={{ ...S.textarea, minHeight: 50, fontSize: 12 }} />
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
              <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.purpleLight }}>{doneCount}</div><div style={{ fontSize: 11, color: C.muted }}>GERADAS</div></div>
              <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.error }}>{scenes.filter(s => s.status === "error").length}</div><div style={{ fontSize: 11, color: C.muted }}>ERROS</div></div>
              <div style={S.stat}><div style={{ fontSize: 20, fontWeight: 600, color: C.muted }}>{scenes.filter(s => s.status === "pending" || s.status === "generating").length}</div><div style={{ fontSize: 11, color: C.muted }}>PENDENTES</div></div>
              {doneCount > 0 && <Btn onClick={openAll} small>Abrir todas ({doneCount})</Btn>}
            </div>

            {scenes.length > 0 && (
              <div style={{ ...S.row, marginBottom: 14, padding: "10px 14px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {regenList.length > 0 ? `${regenList.length} selecionadas para regerar` : "Clique nas imagens para selecionar e regerar em lote"}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {scenes.some(s => s.status === "error") && (
                    <Btn onClick={() => setRegenList(scenes.reduce((a, s, i) => s.status === "error" ? [...a, i] : a, []))} small>Selecionar erros</Btn>
                  )}
                  <Btn onClick={() => setRegenList(scenes.map((_, i) => i))} small>Selecionar todas</Btn>
                  {regenList.length > 0 && (
                    <>
                      <Btn onClick={() => setRegenList([])} small>Limpar</Btn>
                      <Btn onClick={regenSelected} disabled={busy} accent small>Regerar {regenList.length}</Btn>
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={S.imgGrid}>
              {scenes.map((s, i) => {
                const [stColor, stLabel] = statusCfg[s.status] || statusCfg.pending;
                const selected = regenList.includes(i);
                return (
                  <div key={i} style={S.imgCard(selected)}>
                    <div style={{ position: "relative" }}>
                      {s.imgUrl
                        ? <img src={s.imgUrl} alt={`cena ${s.scene}`} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
                        : <div style={{ width: "100%", aspectRatio: "16/9", background: C.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {generatingIdx === i && <div style={{ width: 20, height: 20, border: `2px solid ${C.purpleDim}`, borderTop: `2px solid ${C.purple}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                            <span style={{ fontSize: 11, color: stColor }}>{generatingIdx === i ? "Gerando..." : stLabel}</span>
                          </div>
                      }
                      <div onClick={() => toggleRegen(i)} style={{ position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? C.purple : "rgba(255,255,255,0.5)"}`, background: selected ? C.purple : "rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {selected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>#{String(s.scene).padStart(2, "0")}</span>
                        <Tag color={stColor}>{stLabel}</Tag>
                      </div>
                      <p style={{ fontSize: 11, color: C.muted, margin: "0 0 8px", lineHeight: 1.4 }}>{s.scene_desc}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {s.imgUrl && <Btn onClick={() => openImage(s)} small>Abrir</Btn>}
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
                Abra as imagens geradas → salve com botão direito → acesse freepik.com → Gerador de vídeo → suba a imagem e cole o prompt abaixo.
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
                  <button onClick={() => copyText(s.vid_prompt)} style={{ fontSize: 11, padding: "5px 12px", cursor: "pointer", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, flexShrink: 0 }}>
                    Copiar
                  </button>
                </div>
              ))
            }
          </div>
        )}

        {tab === "historico" && (
          <div>
            {!historico.length ? (
              <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>◷</div>
                <p style={{ color: C.muted, fontSize: 14 }}>Nenhum histórico ainda. Os prompts de vídeo serão salvos automaticamente ao segmentar um roteiro.</p>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 280, flexShrink: 0 }}>
                  <p style={{ ...S.sectionTitle, marginBottom: 12 }}>EPISÓDIOS ({historico.length})</p>
                  {historico.map(h => (
                    <div key={h.id} onClick={() => setHistoricoAberto(h)}
                      style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${historicoAberto?.id === h.id ? C.purple : C.border}`, background: historicoAberto?.id === h.id ? C.purpleDim + "44" : C.surface, cursor: "pointer", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: C.text, margin: 0, lineHeight: 1.4, flex: 1 }}>{h.titulo}</p>
                        <button onClick={e => { e.stopPropagation(); deletarHistorico(h.id); }}
                          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", flexShrink: 0 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: h.contentType === "explicativo" ? "#1a3a1a" : C.purpleDim, color: h.contentType === "explicativo" ? C.success : C.purpleLight, border: `1px solid ${h.contentType === "explicativo" ? C.success : C.purple}` }}>
                          {h.contentType === "explicativo" ? "Explicativo" : "Realista"}
                        </span>
                        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{h.data} · {h.cenas.length} cenas</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {!historicoAberto ? (
                    <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
                      <p style={{ color: C.muted, fontSize: 14 }}>Selecione um episódio para ver os prompts de vídeo.</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ ...S.card, marginBottom: 16 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>{historicoAberto.titulo}</p>
                        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{historicoAberto.data} às {historicoAberto.hora} · {historicoAberto.cenas.length} cenas · salvo por 7 dias</p>
                      </div>
                      {historicoAberto.cenas.map((c, i) => (
                        <div key={i} style={S.vidCard}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: C.purpleDim, border: `1px solid ${C.purple}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.purpleLight }}>{String(c.scene).padStart(2, "0")}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 4px" }}>{c.scene_desc}</p>
                            <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.5 }}>{c.vid_prompt}</p>
                          </div>
                          <button onClick={() => copyText(c.vid_prompt)} style={{ fontSize: 11, padding: "5px 12px", cursor: "pointer", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, flexShrink: 0 }}>
                            Copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
