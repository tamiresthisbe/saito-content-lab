export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const response = await fetch(decodeURIComponent(url));
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const chunks = [];
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    const safeFilename = (filename || "cena.jpg").replace(/[^a-z0-9_.\-]/gi, "_");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.status(200).end(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
