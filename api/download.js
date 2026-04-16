export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: { "Accept": "image/jpeg,image/*" }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream error: ${response.status}` });
    }

    const safeFilename = (filename || "cena.jpg").replace(/[^a-z0-9_.\-]/gi, "_");
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const contentLength = response.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.status(200).end(buffer);
  } catch (e) {
    console.error("Download error:", e.message);
    res.status(500).json({ error: e.message });
  }
}
