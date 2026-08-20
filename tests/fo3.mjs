// A stand-in Ollama whose /api/tags can be made to list a different model.
import http from "node:http";
const MODELS = (process.env.FAKE_MODELS || "qwen3:14b").split(",").filter(Boolean).map((n) => ({ name: n }));
http.createServer((req, res) => {
  if (/\/api\/tags/.test(req.url)) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ models: MODELS }));
  }
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { content: JSON.stringify({ entries: [] }) } }));
  });
}).listen(Number(process.env.PORT || 11497));
