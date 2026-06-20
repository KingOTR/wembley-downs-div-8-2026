/**
 * PNG lineup export aligned with public FotMob view (same setup + row spacing + chips).
 */
import {
  prepareLineupDisplay,
  clamp01,
  pitchMarkup,
} from "./lineup-fotmob.js?tag=v145";

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

function drawPitchBackground(ctx, x, y, w, h) {
  var grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#1b5e38");
  grad.addColorStop(0.48, "#174a2e");
  grad.addColorStop(1, "#1b5e38");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
}

function drawPitchMarkings(ctx, x, y, w, h) {
  var inset = Math.max(10, w * 0.032);
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

function drawFotmobChip(ctx, px, py, unit, pitchW) {
  var ringR = Math.max(16, pitchW * 0.028);
  var ringY = py - ringR * 0.15;

  if (unit.badge) {
    ctx.font = "900 9px Segoe UI, system-ui, sans-serif";
    var bw = 18;
    var bh = 14;
    var bx = px + ringR * 0.35;
    var by = ringY - ringR * 0.75;
    roundRect(ctx, bx, by, bw, bh, 4);
    ctx.fillStyle = unit.badge === "C" ? "#EE2B33" : unit.badge === "VC" ? "#1e3a5f" : "#0f766e";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(unit.badge, bx + (bw - ctx.measureText(unit.badge).width) / 2, by + 11);
  }

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.arc(px, ringY, ringR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(17,24,39,0.92)";
  ctx.font = "900 11px Segoe UI, system-ui, sans-serif";
  var rt = String(unit.ringText).slice(0, 3);
  ctx.fillText(rt, px - ctx.measureText(rt).width / 2, ringY + 4);

  var label = String(unit.label).slice(0, 16);
  ctx.font = "800 10px Segoe UI, system-ui, sans-serif";
  var lw = Math.max(44, ctx.measureText(label).width + 14);
  var lh = 18;
  var lx = px - lw / 2;
  var ly = ringY + ringR - 2;
  roundRect(ctx, lx, ly, lw, lh, 6);
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(17,24,39,0.92)";
  ctx.fillText(label, px - ctx.measureText(label).width / 2, ly + 13);
}

function drawSubChip(ctx, x, y, name, maxW) {
  var label = String(name).slice(0, 18);
  ctx.font = "700 12px Segoe UI, system-ui, sans-serif";
  var w = Math.min(maxW, ctx.measureText(label).width + 20);
  var h = 24;
  roundRect(ctx, x, y, w, h, 999);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(238,43,51,0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(17,24,39,0.9)";
  ctx.fillText(label, x + 10, y + 16);
  return w + 8;
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
  var H = 1400;
  var MAX_DIM = 4096;
  if (W > MAX_DIM || H > MAX_DIM) {
    var sc = Math.min(MAX_DIM / W, MAX_DIM / H);
    W = Math.floor(W * sc);
    H = Math.floor(H * sc);
  }
  var canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  var ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, W, H);

  var pad = 48;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(238,43,51,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  var tx = pad + 28;
  var ty = pad + 24;
  if (logo.complete && logo.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(tx + 28, ty + 28, 28, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, tx, ty, 56, 56);
    ctx.restore();
  }

  ctx.fillStyle = "#EE2B33";
  ctx.font = "900 30px Segoe UI, system-ui, sans-serif";
  ctx.fillText(team.name || "Wembley Downs", tx + 68, ty + 36);

  var vs = entry.opponent ? "vs " + entry.opponent : "";
  ctx.fillStyle = "rgba(17,24,39,0.92)";
  ctx.font = "700 22px Segoe UI, system-ui, sans-serif";
  if (vs) ctx.fillText(vs, tx + 68, ty + 64);

  var meta = [round, formatDate(entry.date, entry.kickoff), groundLine(entry), entry.suburb || ""]
    .filter(Boolean)
    .join(" · ");
  ctx.fillStyle = "rgba(17,24,39,0.62)";
  ctx.font = "600 16px Segoe UI, system-ui, sans-serif";
  if (meta) ctx.fillText(meta.slice(0, 95), tx, ty + 94);

  ctx.fillStyle = "#EE2B33";
  ctx.font = "900 14px Segoe UI, system-ui, sans-serif";
  ctx.fillText(view.setupLabel.toUpperCase() + " · " + view.formLabel, tx, ty + 118);

  var pitchX = pad + 28;
  var pitchY = pad + 138;
  var pitchW = W - pad * 2 - 56;
  var pitchH = Math.floor(H - pad * 2 - 320);
  drawPitchBackground(ctx, pitchX, pitchY, pitchW, pitchH);
  drawPitchMarkings(ctx, pitchX, pitchY, pitchW, pitchH);

  view.units.forEach(function (u) {
    var px = pitchX + (u.leftPct / 100) * pitchW;
    var py = pitchY + (u.topPct / 100) * pitchH;
    drawFotmobChip(ctx, px, py, u, pitchW);
  });

  var subsY = pitchY + pitchH + 22;
  ctx.fillStyle = "rgba(17,24,39,0.55)";
  ctx.font = "900 13px Segoe UI, system-ui, sans-serif";
  ctx.fillText("SUBSTITUTES", pitchX, subsY);

  var subs = view.subs.length ? view.subs : [];
  var chipX = pitchX;
  var chipY = subsY + 14;
  var rowW = pitchW;
  subs.slice(0, 12).forEach(function (name) {
    var used = drawSubChip(ctx, chipX, chipY, name, rowW - (chipX - pitchX));
    chipX += used;
    if (chipX > pitchX + rowW - 80) {
      chipX = pitchX;
      chipY += 32;
    }
  });
  if (!subs.length) {
    ctx.fillStyle = "rgba(17,24,39,0.45)";
    ctx.font = "600 14px Segoe UI, system-ui, sans-serif";
    ctx.fillText("—", pitchX, chipY + 16);
  }

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
