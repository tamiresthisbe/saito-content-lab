export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const response = await fetch("https://api.freepik.com/v1/ai/text-to-image/flux-2-pro", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": process.env.REACT_APP_FREEPIK_KEY
      },
      body: JSON.stringify({
        prompt: req.body.prompt,
        negative_prompt: "watermark, text overlay, low quality, blurry, distorted, amateur, pixelated, overexposed, washed out, artifacts",
        aspect_ratio: "widescreen_16_9",
        resolution: "2k"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const taskId = data?.data?.task_id;
    if (!taskId) return res.status(200).json(data);

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await fetch(`https://api.freepik.com/v1/ai/text-to-image/flux-2-pro/${taskId}`, {
        headers: { "x-freepik-api-key": process.env.REACT_APP_FREEPIK_KEY }
      });
      const pollData = await poll.json();
      const status = pollData?.data?.status;
      if (status === "completed") return res.status(200).json(pollData);
      if (status === "failed") return res.status(500).json(pollData);
    }

    res.status(504).json({ error: "Timeout aguardando geração" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
