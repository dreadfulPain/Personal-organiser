import http from "node:http";
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c));
  req.on("end", () => {
    const body = JSON.parse(b || "{}");
    const sys = (body.messages || []).find((m) => m.role === "system")?.content || "";
    let out = {};
    if (/router inside a calm personal organiser/.test(sys)) {
      out = { entries: [{
        kind: "task", title: "Wait for SHSID's reply about next school year wording",
        item_type: "task", date: "", time: "", deadline: "", importance: "normal", effort: "quick",
        tags: [], when_text: "", goal_link: "", open_loop: true, promised_to: "Helen",
        who: "", note_type: "", summary: "", topic: "", level: "", follow_up: false,
        follow_up_date: "", standard: "", person: "", direction: "", note: "",
      }] };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { content: JSON.stringify(out) } }));
  });
}).listen(11498, () => console.log("up"));
