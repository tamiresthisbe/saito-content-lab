export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const response = await fetch("https://api.freepik.com/v1/ai/text-to-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": process.env.REACT_APP_FREEPIK_KEY
      },
      body: JSON.stringify({
        prompt: req.body.prompt,
        negative_prompt: "watermark, text overlay, low quality, blurry, distorted, amateur, pixelated",
        guidance_scale: 7,
        num_images: 1,
        image: { size: "widescreen_16_9" },
        styling: { style: "photo" },
        resolution: "2k"
      })
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
