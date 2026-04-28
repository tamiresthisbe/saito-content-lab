export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const key = process.env.REACT_APP_FREEPIK_KEY;

  if (req.method === "GET") {
    const { taskId } = req.query;
    if (!taskId) return res.status(400).json({ error: "taskId required" });
    try {
      const poll = await fetch(`https://api.freepik.com/v1/ai/text-to-image/flux-2-pro/${taskId}`, {
        headers: { "x-freepik-api-key": key }
      });
      const data = await poll.json();
      return res.status(poll.status).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).end();

  try {
    const response = await fetch("https://api.freepik.com/v1/ai/text-to-image/flux-2-pro", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": key
      },
      body: JSON.stringify({
        prompt: req.body.prompt,
        aspect_ratio: "widescreen_16_9"
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
