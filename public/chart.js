// SMALL CHARTS, DRAWN BY HAND IN SVG.
//
// No library, like everything else here — and for once that's not only about
// the zero-dependency rule. A chart you look at while a parent is on the phone
// has about two seconds to be read, and almost everything a charting library
// gives you by default (gridlines everywhere, a number on every point, eight
// colours cycling) spends that two seconds badly.
//
// THE RULES THIS FOLLOWS, and why each one is here:
//   · Recessive grid and axes. The data is the ink; the scaffolding is not.
//   · 2px lines, 8px markers, so a line is followable and a point is hittable.
//   · A legend whenever there's more than one line, AND the last point of each
//     line labelled directly — so which line is which never depends on telling
//     two colours apart. One line needs no legend; the heading names it.
//   · Never a number on every point. The end value, and the axis. That's it.
//   · A table underneath, always. It is the accessible version, it is the
//     version that survives being printed in black and white, and it is the
//     version you read out when someone asks for the actual figures.
//
// THE COLOURS ARE NOT A MATTER OF TASTE. They were run through a
// colour-vision check against this app's own background: every adjacent pair is
// far enough apart for protanopia, deuteranopia and tritanopia, and far enough
// apart for ordinary vision too, which is the check people forget. Assigned in
// a fixed order and never cycled — a fifth line does not invent a fifth colour,
// it goes grey and gets its name on it.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // Validated against #faf7f2 (this app's background). Do not reorder or extend
  // without re-running the check — adjacency is what was verified, so the ORDER
  // is part of what passed.
  const SERIES = ["#00806a", "#c06a00", "#3a6bb5", "#9c3f92"];
  const SPARE = "#726c63"; // anything past the fourth line: named, not coloured
  const INK = "#34322e";
  const SOFT = "#726c63";
  const LINE = "#ece5d9";

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const colourOf = (i) => (i < SERIES.length ? SERIES[i] : SPARE);

  // series: [{ name, points: [{ x: "YYYY-MM-DD", y: number, label? }] }]
  // opts:   { yMin, yMax, yTicks: [{v,label}], height, width, valueLabel }
  function overTime(series, opts) {
    const o = opts || {};
    const list = (Array.isArray(series) ? series : [])
      .map((s) => ({ name: String((s && s.name) || ""), points: (s && s.points) || [] }))
      .filter((s) => s.points.length);
    if (!list.length) return `<p class="muted">Nothing recorded yet.</p>`;

    const W = o.width || 520;
    const H = o.height || 190;
    const padL = 46;
    const padR = 96; // room for the direct labels at the end of each line
    const padT = 12;
    const padB = 30;

    const xs = [...new Set(list.flatMap((s) => s.points.map((p) => p.x)))].sort();
    const ys = list.flatMap((s) => s.points.map((p) => Number(p.y)).filter(Number.isFinite));
    const yMin = Number.isFinite(o.yMin) ? o.yMin : Math.min(...ys);
    const yMax = Number.isFinite(o.yMax) ? o.yMax : Math.max(...ys);
    const span = yMax - yMin || 1;
    const X = (x) => padL + (xs.length < 2 ? (W - padL - padR) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (W - padL - padR));
    const Y = (y) => padT + (1 - (Number(y) - yMin) / span) * (H - padT - padB);

    const ticks = Array.isArray(o.yTicks) && o.yTicks.length
      ? o.yTicks
      : [{ v: yMin, label: String(yMin) }, { v: yMax, label: String(yMax) }];

    let svg = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.alt || "Change over time")}">`;
    // Scaffolding first and quietly.
    ticks.forEach((t) => {
      const y = Y(t.v);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`;
      svg += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${SOFT}">${esc(t.label)}</text>`;
    });
    // Only the first and last date, or they collide.
    [xs[0], xs[xs.length - 1]].forEach((x, i) => {
      if (xs.length < 2 && i) return;
      svg += `<text x="${X(x)}" y="${H - 8}" text-anchor="${i ? "end" : "start"}" font-size="11" fill="${SOFT}">${esc(shortDate(x))}</text>`;
    });

    list.forEach((s, i) => {
      const c = colourOf(i);
      const pts = s.points
        .filter((p) => Number.isFinite(Number(p.y)))
        .sort((a, b) => String(a.x).localeCompare(String(b.x)));
      if (!pts.length) return;
      const d = pts.map((p, n) => `${n ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" ");
      svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      pts.forEach((p) => {
        // A 2px ring in the surface colour so overlapping points stay separate.
        svg += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" fill="${c}" stroke="#faf7f2" stroke-width="2">` +
          `<title>${esc(s.name)} — ${esc(shortDate(p.x))}: ${esc(p.label != null ? p.label : p.y)}</title></circle>`;
      });
      // Direct label at the end: identity never rests on colour alone.
      const last = pts[pts.length - 1];
      svg += `<text x="${(X(last.x) + 10).toFixed(1)}" y="${(Y(last.y) + 4).toFixed(1)}" font-size="11" fill="${INK}">${esc(s.name)}</text>`;
    });
    svg += `</svg>`;

    const legend =
      list.length > 1
        ? `<div class="ch-key">` +
          list.map((s, i) => `<span class="ch-k"><i style="background:${colourOf(i)}"></i>${esc(s.name)}</span>`).join("") +
          `</div>`
        : "";

    return svg + legend + table(list, xs, o);
  }

  // The same numbers, readable without seeing a single colour.
  function table(list, xs, o) {
    const head = xs.map((x) => `<th scope="col">${esc(shortDate(x))}</th>`).join("");
    const rows = list
      .map((s) => {
        const by = new Map(s.points.map((p) => [p.x, p]));
        const cells = xs
          .map((x) => {
            const p = by.get(x);
            return `<td>${p ? esc(p.label != null ? p.label : p.y) : "·"}</td>`;
          })
          .join("");
        return `<tr><th scope="row">${esc(s.name)}</th>${cells}</tr>`;
      })
      .join("");
    return (
      `<details class="ch-table"><summary>the figures</summary>` +
      `<div class="ch-scroll"><table><thead><tr><th scope="col">${esc(o.valueLabel || "")}</th>${head}</tr></thead>` +
      `<tbody>${rows}</tbody></table></div></details>`
    );
  }

  function shortDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return String(iso || "");
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  // A headline number, for the things that shouldn't be a chart at all. Most of
  // what someone asks on the phone is one fact, and a chart of one fact is a
  // worse way of showing it than the fact.
  function tile(label, value, note) {
    return (
      `<div class="ch-tile"><div class="ch-tval">${esc(value)}</div>` +
      `<div class="ch-tlab">${esc(label)}</div>` +
      (note ? `<div class="ch-tnote">${esc(note)}</div>` : "") +
      `</div>`
    );
  }

  window.OrganiserChart = { overTime, tile, SERIES, colourOf, shortDate };
})();
