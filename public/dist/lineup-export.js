/**
 * PNG lineup export aligned with public FotMob view (same setup + row spacing).
 */
import {
  prepareLineupDisplay,
  clamp01,
  pitchMarkup,
} from "./lineup-fotmob.js?tag=v138";

function roundRect(ctx, x, y, w, h, r) {
  var rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawPitch(ctx, x, y, w, h) {
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#1b5e38");
  grad.addColorStop(0.48, "#174a2e");
  grad.addColorStop(1, "#1b5e38");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  var inset = Math.max(8, w * 0.028);
  var lx = x + inset;
  var ly = y + inset;
  var lw = w - inset * 2;
  var lh = h - inset * 2;
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = Math.max(2, w * 0.004);
  ctx.strokeRect(lx, ly, lw, lh);

  ctx.beginPath();
  ctx.moveTo(lx, ly + lh / 2);
  ctx.lineTo(lx + lw, ly + lh / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(lx + lw / 2, ly + lh / 2, lw * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  var penH = lh * 0.157;
  var penW = lw * 0.59;
  ctx.strokeRect(lx + (lw - penW) / 2, ly, penW, penH);
  ctx.strokeRect(lx + (lw - penW) / 2, ly + lh - penH, penW, penH);
}

function formatDate(dateStr, kickoff) {
  if (kickoff) {
    try {
      return new Date(kickoff).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {}
  }
  return dateStr || "";
}

function groundLine(entry) {
  var ground = (entry && entry.groundName) || (entry && entry.venue) || "";
  var pitch = entry && entry.pitchNumber ? String(entry.pitchNumber).trim() : "";
  if (ground && pitch) return ground + ", Pitch " + pitch;
  return ground;
}

/**
 * @param {object} opts
 * @param {object} opts.team
 * @param {string} opts.round
 * @param {object} opts.entry - match entry (opponent, date, lineup, etc.)
 * @param {string} opts.setupKey - "def" | "att"
 */
export async function exportLineupPng(opts) {
  var team = opts.team || {};
  var round = opts.round || "Round";
  var entry = opts.entry || {};
  var lineup = entry.lineup;
  if (!lineup || !lineup.starters || !lineup.starters.length) {
    throw new Error("No lineup to export for this round.");
  }

  var setupKey = opts.setupKey === "att" ? "att" : "def";
  var view = prepareLineupDisplay(lineup, setupKey, clamp01);

  var logo = new Image();
  logo.crossOrigin = "anonymous";
  logo.src = "/wembley-downs-logo.png";
  await new Promise(function (resolve) {
    logo.onload = resolve;
    logo.onerror = resolve;
  });

  var W = 1080;
  var H = 1350;
  var canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, W, H);

  var pad = 56;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(185,28,28,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();

  var tx = pad + 34;
  var ty = pad + 30;
  if (logo.complete && logo.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(tx + 32, ty + 32, 32, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, tx, ty, 64, 64);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(127,29,29,0.92)";
  ctx.font = "900 34px Segoe UI, system-ui, sans-serif";
  ctx.fillText(team.name || "Wembley Downs", tx + 80, ty + 42);

  var vs = entry.opponent ? "vs " + entry.opponent : "";
  ctx.fillStyle = "rgba(17,24,39,0.92)";
  ctx.font = "700 26px Segoe UI, system-ui, sans-serif";
  if (vs) ctx.fillText(vs, tx + 80, ty + 76);

  var meta = [round, formatDate(entry.date, entry.kickoff), groundLine(entry), entry.suburb || ""]
    .filter(Boolean)
    .join(" · ");
  ctx.fillStyle = "rgba(127,29,29,0.7)";
  ctx.font = "600 18px Segoe UI, system-ui, sans-serif";
  if (meta) ctx.fillText(meta.slice(0, 90), tx, ty + 110);

  ctx.fillStyle = "rgba(127,29,29,0.82)";
  ctx.font = "900 16px Segoe UI, system-ui, sans-serif";
  ctx.fillText(view.setupLabel.toUpperCase() + " · " + view.formLabel, tx, ty + 138);

  var score =
    entry.ourScore != null || entry.oppScore != null
      ? String(entry.ourScore != null ? entry.ourScore : "–") +
        " : " +
        String(entry.oppScore != null ? entry.oppScore : "–")
      : "";
  if (score) {
    var sw = 220;
    var sh = 78;
    var sx = pad + (W - pad * 2) - sw - 34;
    roundRect(ctx, sx, ty + 10, sw, sh, 999);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(185,28,28,0.18)";
    ctx.stroke();
    ctx.fillStyle = "rgba(17,24,39,0.92)";
    ctx.font = "950 42px Segoe UI, system-ui, sans-serif";
    var mw = ctx.measureText(score).width;
    ctx.fillText(score, sx + (sw - mw) / 2, ty + 62);
  }

  var pitchX = pad + 34;
  var pitchY = pad + 170;
  var pitchW = Math.floor((W - pad * 2 - 68) * 0.62);
  var pitchH = Math.floor(H - pad * 2 - 250);
  drawPitch(ctx, pitchX, pitchY, pitchW, pitchH);

  view.units.forEach(function (u) {
    var px = pitchX + (u.leftPct / 100) * pitchW;
    var py = pitchY + (u.topPct / 100) * pitchH;
    var ring = Math.max(28, pitchW * 0.055);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.arc(px, py - ring * 0.55, ring / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(185,28,28,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(17,24,39,0.92)";
    ctx.font = "900 14px Segoe UI, system-ui, sans-serif";
    var rt = String(u.ringText).slice(0, 3);
    ctx.fillText(rt, px - ctx.measureText(rt).width / 2, py - ring * 0.55 + 5);

    var label = String(u.label).slice(0, 14);
    var lw = Math.max(56, ctx.measureText(label).width + 18);
    var lh = 22;
    var lx = px - lw / 2;
    var ly = py - ring * 0.55 + ring / 2 + 2;
    roundRect(ctx, lx, ly, lw, lh, 8);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fill();
    ctx.strokeStyle = "rgba(185,28,28,0.15)";
    ctx.stroke();
    ctx.fillStyle = "rgba(17,24,39,0.92)";
    ctx.font = "700 13px Segoe UI, system-ui, sans-serif";
    ctx.fillText(label, px - ctx.measureText(label).width / 2, ly + 15);
  });

  var subsX = pitchX + pitchW + 26;
  var subsY = pitchY;
  var subsW = W - pad - 34 - subsX;
  roundRect(ctx, subsX, subsY, subsW, pitchH, 18);
  ctx.fillStyle = "rgba(185,28,28,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(185,28,28,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(127,29,29,0.82)";
  ctx.font = "900 18px Segoe UI, system-ui, sans-serif";
  ctx.fillText("SUBSTITUTES", subsX + 18, subsY + 34);

  var subs = view.subs.length ? view.subs : ["—"];
  ctx.fillStyle = "rgba(17,24,39,0.86)";
  ctx.font = "650 18px Segoe UI, system-ui, sans-serif";
  subs.slice(0, 20).forEach(function (name, i) {
    ctx.fillText(i + 1 + ". " + String(name).slice(0, 22), subsX + 18, subsY + 70 + i * 28);
  });

  var blob = await new Promise(function (resolve) {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("PNG export failed");

  var a = document.createElement("a");
  var fname = ((team.name || "team") + " " + round + " lineup.png").replace(/[\\/:*?"<>|]+/g, "_");
  a.download = fname;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    try {
      URL.revokeObjectURL(a.href);
      a.remove();
    } catch {}
  }, 500);
}
