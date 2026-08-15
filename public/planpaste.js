// A PLAN SOMEONE ELSE WROTE, PASTED IN.
//
// Deciding what a big thing is made of is a judgement call about your life, and
// a person — or a proper model you can talk to — will always do that better
// than this app will. So the app shouldn't try. It should be very good at
// taking the answer.
//
// You ask Claude or whoever for a plan, you read it, you change the bits it got
// wrong about your situation, you paste it here. This turns it into real work:
// sized, dated, and handed to the same machinery that spreads everything else
// across the days you actually have.
//
// WHAT IT READS. Whatever those tools actually produce, which is markdown-ish
// and inconsistent: # or ## or bold for headings, -, *, • or 1. for steps,
// times written as "(2 hours)" or "~45 min" or "— 1h30", a deadline written
// almost any way. It is deliberately forgiving, because the input is a paste
// and nobody should have to tidy it first.
//
// TWO RULES IT DOESN'T BREAK:
//   Nothing is invented. No time given means no size — the app falls back to
//   its own guess and says it's a guess, rather than quietly making one up and
//   presenting it as yours.
//   Nothing is lost. A line it can't classify becomes a step anyway. Silently
//   dropping a line out of someone's plan is far worse than keeping an odd one.
//
// No AI. This is pattern-reading, so it works the same on the laptop that can't
// run a model — which matters, because that's where a pasted plan is MOST
// likely to be the way work arrives.
//
// Plain script (works under file://), like everything else here.

(function () {
  "use strict";

  // "2 hours", "45 min", "1h30", "1.5h", "90m", "half an hour"
  const TIME = new RegExp(
    "(?:^|[\\s(~—–\\-:])(?:" +
      "(\\d+(?:\\.\\d+)?)\\s*(?:h|hr|hrs|hour|hours)\\s*(\\d+)?\\s*(?:m|min|mins|minutes)?" +
      "|(\\d+)\\s*(?:m|min|mins|minutes)\\b" +
      "|(half an hour)" +
    ")",
    "i"
  );

  function minutesIn(text) {
    const m = TIME.exec(String(text || ""));
    if (!m) return 0;
    if (m[4]) return 30; // the groups are: hours, mins-after-hours, bare mins, the phrase
    if (m[1]) return Math.round(parseFloat(m[1]) * 60 + (Number(m[2]) || 0));
    if (m[3]) return Number(m[3]);
    return 0;
  }
  // Take the time phrase back out of the title — it's a fact about the job now,
  // not part of its name.
  function stripTime(text) {
    return String(text || "")
      .replace(/[（(\[]\s*(?:~|about |approx\.? )?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes)[^)\]）]*[）)\]]/gi, "")
      .replace(/\s*[—–-]\s*(?:~|about |approx\.? )?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes)\b.*$/i, "")
      .replace(/\s*[—–-]?\s*half an hour\b/i, "")
      // A trailing time with no bracket and no dash — "…what didn't land ~90
      // mins" — which is how people actually type it.
      .replace(/\s*~?\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes)\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const BULLET = /^\s*(?:[-*•·]|\d+[.)]|[a-z][.)])\s+/i;
  const HEADING = /^\s*(#{1,6})\s+(.*)$/;
  // "Phase 1: ...", "Step 2 —", "Week 3:", "Milestone 1" — a heading without a #.
  const NUMBERED_SECTION = /^\s*(?:phase|stage|step|part|week|milestone|month)\s*\d*\s*[:.\-—]\s*(.+)$/i;
  const BOLD_LINE = /^\s*\*\*(.+?)\*\*\s*:?\s*$/;
  // The deadline is written for a person, not a parser: "Deadline: 4 December",
// but also "Needs to be done by 20 November" tucked at the end of a plan.
const DEADLINE = /^\s*(?:deadline|due|target)\s*[:\-—]\s*(.+)$/i;
const DEADLINE_LOOSE = /\b(?:needs? to be (?:done|finished|in|submitted)|due|finish(?:ed)?|complete[d]?|submit(?:ted)?|hand(?:ed)? in)\s+(?:by|on|before)\s+(.+)$/i;

  // Turn a pasted plan into { title, date, milestones:[{title, steps:[{title,minutes}]}] }
  function parse(text, opts) {
    const o = opts || {};
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const out = { title: "", date: "", milestones: [], unread: [] };
    let current = null;
    let topSeen = false;

    const startMilestone = (t) => {
      const title = t.trim().slice(0, 80);
      if (!title) return;
      current = { title, steps: [] };
      out.milestones.push(current);
    };

    lines.forEach((raw) => {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) return;
      if (/^\s*([-=_*])\1{2,}\s*$/.test(line)) return; // a rule, not content

      // A deadline can appear anywhere, including inside a bullet.
      const bare = line.replace(BULLET, "");
      const dl = DEADLINE.exec(bare) || DEADLINE_LOOSE.exec(bare);
      if (dl && !out.date) {
        const when = readDate(dl[1], o.today);
        if (when) {
          out.date = when;
          return;
        }
      }

      const h = HEADING.exec(line);
      if (h) {
        const level = h[1].length;
        const t = clean(h[2]);
        // The first and shallowest heading is the goal; the rest are milestones.
        if (!topSeen && (level === 1 || !out.milestones.length)) {
          out.title = t.slice(0, 80);
          topSeen = true;
        } else startMilestone(t);
        return;
      }

      const b = BOLD_LINE.exec(line);
      if (b) {
        const t = clean(b[1]);
        if (!topSeen && !out.milestones.length) {
          out.title = t.slice(0, 80);
          topSeen = true;
        } else startMilestone(t);
        return;
      }

      const bullet = BULLET.test(line);
      const body = clean(line.replace(BULLET, ""));
      if (!body) return;

      const ns = NUMBERED_SECTION.exec(body);
      // "Phase 1: x" is a section — unless it's bulleted, in which case someone
      // is listing phases as steps and meant them as steps.
      if (ns && !bullet) {
        startMilestone(clean(ns[1]));
        return;
      }

      if (bullet) {
        if (!current) startMilestone(o.defaultSection || "To do");
        current.steps.push({ title: stripTime(body).slice(0, 160), minutes: minutesIn(body) });
        return;
      }

      // An unbulleted line with no heading marks. If nothing has started yet
      // it's the title; otherwise it's prose — kept as a step rather than
      // thrown away, because losing a line out of someone's plan is worse than
      // keeping an odd one.
      if (!topSeen) {
        out.title = body.slice(0, 80);
        topSeen = true;
        return;
      }
      if (!current) startMilestone(o.defaultSection || "To do");
      current.steps.push({ title: stripTime(body).slice(0, 160), minutes: minutesIn(body) });
    });

    // A milestone with no steps under it isn't a milestone, it's a step that
    // happened to be written on its own line.
    const empties = out.milestones.filter((m) => !m.steps.length);
    if (empties.length && empties.length === out.milestones.length && out.milestones.length > 1) {
      out.milestones = [{ title: o.defaultSection || "To do", steps: empties.map((m) => ({ title: m.title, minutes: 0 })) }];
    } else {
      out.milestones = out.milestones.filter((m) => m.steps.length);
    }
    return out;
  }

  function clean(s) {
    return String(s || "")
      .replace(/\*\*/g, "")
      .replace(/^[#\s]+|[:\s]+$/g, "")
      .trim();
  }

  // Dates in a pasted plan are written for humans. Reuse the pattern reader the
  // rest of the app already uses rather than inventing a second one that drifts.
  function readDate(text, today) {
    const Q = window.OrganiserQuickParse;
    if (!Q) return "";
    const w = Q.readWhen(String(text || ""));
    return w && w.date ? w.date : "";
  }

  // How big the whole thing is, in the minutes it actually stated.
  function totalMinutes(plan) {
    return (plan && plan.milestones ? plan.milestones : []).reduce(
      (n, m) => n + m.steps.reduce((k, s) => k + (Number(s.minutes) || 0), 0),
      0
    );
  }
  function stepCount(plan) {
    return (plan && plan.milestones ? plan.milestones : []).reduce((n, m) => n + m.steps.length, 0);
  }
  function sized(plan) {
    return (plan && plan.milestones ? plan.milestones : []).reduce(
      (n, m) => n + m.steps.filter((s) => Number(s.minutes) > 0).length, 0);
  }

  window.OrganiserPlanPaste = { parse, minutesIn, stripTime, totalMinutes, stepCount, sized };
})();
