"use client";
import { useEffect, useRef } from "react";

/* deterministic PRNG so the sky looks the same on every load */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Twinkler = { x: number; y: number; s: number; rad: number; a: number; box: [number, number, number, number]; f1: number; f2: number; p1: number; p2: number };
type Shoot = { t0: number; dur: number; x: number; y: number; vx: number; vy: number; len: number };

/**
 * Realistic night sky: a static layer (power-law field stars + a faint Milky Way with dust lanes) is rendered
 * once; ~16 bright stars scintillate on a dirty-rect overlay; rare shooting stars. DPR capped at 1.5.
 *
 * v0.4.1: every slow decoration of the page (sky drift, nebula drift, the brand orb's ring) is advanced by this
 * one ~15 fps tick instead of infinite CSS animations — a running CSS animation makes the compositor produce
 * (and, without a GPU, rasterise and re-blur under the glass bars) 60 frames a second forever. The tick pauses
 * while the page scrolls, while a modal covers it, while the tab is hidden, and never runs with reduced motion.
 * Without JS (or with reduced motion) the CSS animations stay in charge (html.sky-js switches them off).
 */
export function Starfield() {
  const skyRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current!, ov = ovRef.current!, sky = skyRef.current!;
    const ctx = cv.getContext("2d")!, oc = ov.getContext("2d")!;
    const M = 40, SPR = 32;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const COLS = ["255,255,255", "228,237,255", "208,222,255", "255,245,226", "255,224,196"];
    const sprites = COLS.map((col) => {
      const c = document.createElement("canvas");
      c.width = c.height = SPR;
      const g = c.getContext("2d")!, h = SPR / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        gr.addColorStop(t, `rgba(${col},${Math.exp(-t * t * 9).toFixed(4)})`);
      }
      g.fillStyle = gr;
      g.fillRect(0, 0, SPR, SPR);
      return c;
    });
    const pickCol = (u: number) => (u < 0.5 ? 1 : u < 0.82 ? 0 : u < 0.93 ? 2 : u < 0.985 ? 3 : 4);
    let W = 0, H = 0, dpr = 1, built = false, light = false, raf = 0, lastT = 0, nextShoot = 0, clock = 0, scrollUntil = 0;
    const root = document.documentElement, drift = sky.firstElementChild as HTMLElement, nebula = sky.parentElement!.querySelector(".nebula") as HTMLElement | null;
    let twk: Twinkler[] = [];
    let shoot: Shoot | null = null;
    let shootBox: [number, number, number, number] | null = null;
    const dot = (c: CanvasRenderingContext2D, s: number, x: number, y: number, rad: number, a: number) => {
      const d = rad * 5;
      c.globalAlpha = a;
      c.drawImage(sprites[s], x - d / 2, y - d / 2, d, d);
    };

    function build() {
      const r = rng(11), gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r());
      const base = document.createElement("canvas");
      base.width = cv.width;
      base.height = cv.height;
      const b = base.getContext("2d")!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const L = Math.hypot(W, H), w = Math.min(W, H) * 0.3, ang = -Math.atan2(H, W) * 0.85;
      const cx = W * 0.55, cy = H * 0.5, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const lanes = [
        { o: (t: number) => w * (0.05 + 0.07 * Math.sin(t / (L * 0.17) + 1.3)), s: (t: number) => w * (0.05 + 0.03 * Math.sin(t / (L * 0.1) + 0.4)) },
        { o: (t: number) => -w * (0.13 + 0.04 * Math.sin(t / (L * 0.13) + 2.1)), s: (t: number) => w * (0.022 + 0.014 * Math.sin(t / (L * 0.08))) },
      ];
      const dusty = (t: number, off: number) => {
        let k = 0;
        for (const l of lanes) {
          const s = l.s(t), d = Math.abs(off - l.o(t));
          if (d < s) k = Math.max(k, 1 - d / s);
        }
        return k;
      };
      const along = (t: number) => 0.55 + 0.45 * Math.sin(t / (L * 0.22) + 2.2);
      const S = 6, gc = document.createElement("canvas");
      gc.width = Math.ceil(W / S);
      gc.height = Math.ceil(H / S);
      const g = gc.getContext("2d")!;
      g.scale(1 / S, 1 / S);
      for (let i = 0; i < 300; i++) {
        const t = (r() - 0.5) * L, off = gauss() * w * 0.24, x = cx + dx * t + nx * off, y = cy + dy * t + ny * off, rr = w * (0.14 + r() * 0.32);
        const gr = g.createRadialGradient(x, y, 0, x, y, rr), a = 0.011 * along(t);
        gr.addColorStop(0, `rgba(196,208,238,${a})`);
        gr.addColorStop(1, "rgba(196,208,238,0)");
        g.fillStyle = gr;
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      g.globalCompositeOperation = "destination-out";
      for (const l of lanes)
        for (let i = 0; i < 90; i++) {
          const t = (i / 90 - 0.5) * L * 1.1 + gauss() * L * 0.01, off = l.o(t) + gauss() * l.s(t) * 0.25, x = cx + dx * t + nx * off, y = cy + dy * t + ny * off, rr = l.s(t) * (0.9 + r() * 0.8);
          const gr = g.createRadialGradient(x, y, 0, x, y, rr);
          gr.addColorStop(0, "rgba(0,0,0,.42)");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
      b.imageSmoothingEnabled = true;
      b.imageSmoothingQuality = "high";
      b.globalAlpha = 1;
      b.drawImage(gc, 0, 0, W, H);
      const mw = Math.max(1200, Math.min(3600, Math.round((W * H) / 650)));
      for (let i = 0; i < mw; i++) {
        const t = (r() - 0.5) * L, off = gauss() * w * 0.3;
        if (r() < dusty(t, off) * 0.8) continue;
        const u = r();
        dot(b, pickCol(r()), cx + dx * t + nx * off, cy + dy * t + ny * off, 0.3 + 0.35 * u * u * u, (0.05 + 0.2 * u * u) * (0.6 + 0.4 * along(t)));
      }
      const n = Math.max(450, Math.min(1400, Math.round((W * H) / 1700)));
      const field: { x: number; y: number; s: number; rad: number; a: number }[] = [];
      for (let i = 0; i < n; i++) {
        const mag = Math.pow(r(), 3.4), bright = r() < 0.012;
        field.push({ x: r() * W, y: r() * H, s: pickCol(r()), rad: bright ? 1.2 + r() * 0.3 : 0.4 + 0.8 * mag, a: bright ? 0.85 + r() * 0.15 : 0.12 + 0.78 * Math.pow(mag, 0.65) });
      }
      field.sort((p, q) => q.a * q.rad - p.a * p.rad);
      const nt = Math.max(12, Math.min(16, Math.round(n / 70)));
      twk = field.slice(0, nt).map((p) => {
        const h = p.rad * 5 * (p.rad > 1.1 ? 1.5 : 0.5) + 2;
        return { ...p, box: [p.x - h, p.y - h, h * 2, h * 2], f1: 6.2832 / (3500 + r() * 5500), f2: 6.2832 / (1700 + r() * 2600), p1: r() * 6.28, p2: r() * 6.28 };
      });
      for (const p of field.slice(nt)) {
        dot(b, p.s, p.x, p.y, p.rad, p.a);
        if (p.rad > 1.1) dot(b, p.s, p.x, p.y, p.rad * 3, p.a * 0.05);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(base, 0, 0);
      oc.setTransform(dpr, 0, 0, dpr, 0, 0);
      oc.clearRect(0, 0, W, H);
      shootBox = null;
      built = true;
    }
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = innerWidth + M * 2;
      H = innerHeight + M * 2;
      cv.width = ov.width = Math.round(W * dpr);
      cv.height = ov.height = Math.round(H * dpr);
      build();
      draw(performance.now());
    }
    function draw(t: number) {
      for (const s of twk) oc.clearRect(...s.box);
      if (shootBox) {
        oc.clearRect(...shootBox);
        shootBox = null;
      }
      for (const s of twk) {
        const k = reduce ? 1 : 1 + 0.12 * (0.6 * Math.sin(t * s.f1 + s.p1) + 0.4 * Math.sin(t * s.f2 + s.p2));
        dot(oc, s.s, s.x, s.y, s.rad, Math.min(1, s.a * k));
        if (s.rad > 1.1) dot(oc, s.s, s.x, s.y, s.rad * 3, s.a * 0.05 * k);
      }
      oc.globalAlpha = 1;
      if (reduce) return;
      if (!shoot && t > nextShoot) {
        const dir = Math.random() < 0.5 ? -1 : 1, a = 0.3 + Math.random() * 0.35, sp = 0.3 + Math.random() * 0.12;
        shoot = { t0: t, dur: 900 + Math.random() * 500, x: M + innerWidth * (0.15 + Math.random() * 0.7), y: M + innerHeight * (0.05 + Math.random() * 0.35), vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, len: 90 + Math.random() * 60 };
      }
      if (shoot) {
        const e = t - shoot.t0, k = e / shoot.dur;
        if (k >= 1) {
          shoot = null;
          nextShoot = t + 20000 + Math.random() * 20000;
          return;
        }
        const hx = shoot.x + shoot.vx * e, hy = shoot.y + shoot.vy * e, sp = Math.hypot(shoot.vx, shoot.vy), tl = shoot.len * Math.min(1, k * 2.5);
        const tx = hx - (shoot.vx / sp) * tl, ty = hy - (shoot.vy / sp) * tl, A = 0.38 * Math.sin(Math.PI * k);
        const gr = oc.createLinearGradient(hx, hy, tx, ty);
        gr.addColorStop(0, `rgba(236,242,255,${A.toFixed(3)})`);
        gr.addColorStop(1, "rgba(236,242,255,0)");
        oc.strokeStyle = gr;
        oc.lineWidth = 0.8;
        oc.lineCap = "round";
        oc.beginPath();
        oc.moveTo(hx, hy);
        oc.lineTo(tx, ty);
        oc.stroke();
        shootBox = [Math.min(hx, tx) - 3, Math.min(hy, ty) - 3, Math.abs(hx - tx) + 6, Math.abs(hy - ty) + 6];
      }
    }
    /* the former CSS keyframes, same paths and periods (ease-in-out, alternate) */
    const ease = (p: number) => {
      const u = p % 2 < 1 ? p % 2 : 2 - (p % 2);
      return 0.5 - 0.5 * Math.cos(Math.PI * u);
    };
    let orbs: NodeListOf<HTMLElement> | null = null, orbsAt = -1e9;
    // a style write is a full-screen composite: the drifts are written only when they moved a visible step
    let lastDrift = "", lastNeb = "";
    function decorate(t: number) {
      const d = ease(clock / 360000), nb = ease(clock / 90000);
      const q = (v: number, step: number) => (Math.round(v / step) * step).toFixed(2);
      const dr = `translate3d(${q(-12 + 24 * d, 0.5)}px,${q(7 - 14 * d, 0.5)}px,0)`;
      if (dr !== lastDrift) drift.style.transform = lastDrift = dr;
      if (nebula) {
        const nt = `translate3d(${q(-0.12 * innerWidth * nb, 1)}px,${q(0.06 * innerHeight * nb, 1)}px,0)`;
        if (nt !== lastNeb) nebula.style.transform = lastNeb = nt;
      }
      if (t - orbsAt > 2000) {
        orbs = document.querySelectorAll<HTMLElement>(".orb");
        orbsAt = t;
      }
      const deg = ((clock / 6000) * 360) % 360;
      orbs?.forEach((o) => o.style.setProperty("--orb", deg.toFixed(1) + "deg"));
    }
    function loop(t: number) {
      raf = requestAnimationFrame(loop);
      const dt = t - lastT;
      if (dt < 64 && !shoot) return; // ~15 fps is plenty for scintillation (periods of 2–9 s) and the slow drifts
      lastT = t;
      // frozen while scrolling (each frame would be one more full-screen composite) or under a modal's scrim
      if (t < scrollUntil || document.body.classList.contains("x-modal-open")) return;
      clock += Math.min(dt, 100);
      decorate(t);
      if (!light) draw(t);
    }
    const start = () => {
      if (reduce) return;
      root.classList.add("sky-js");
      if (!raf && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onScroll = () => (scrollUntil = performance.now() + 180);
    addEventListener("scroll", onScroll, { passive: true });
    const theme = () => {
      light = root.classList.contains("light");
      if (!light && !built) size();
      start();
    };
    nextShoot = performance.now() + 12000 + Math.random() * 14000;
    theme();
    const mo = new MutationObserver(theme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    let rz: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        if (light) built = false;
        else size();
      }, 150);
    };
    addEventListener("resize", onResize);
    let mx = 0, my = 0, tx = 0, ty = 0, pr = 0;
    const step = () => {
      mx += (tx - mx) * 0.08;
      my += (ty - my) * 0.08;
      sky.style.transform = `translate3d(${(-mx * M * 0.5).toFixed(2)}px,${(-my * M * 0.5).toFixed(2)}px,0)`;
      pr = Math.abs(tx - mx) + Math.abs(ty - my) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || light) return;
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
      if (!pr) pr = requestAnimationFrame(step);
    };
    const parallax = !reduce && matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (parallax) addEventListener("pointermove", onMove, { passive: true });
    return () => {
      stop();
      root.classList.remove("sky-js");
      removeEventListener("scroll", onScroll);
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("resize", onResize);
      if (parallax) removeEventListener("pointermove", onMove);
      cancelAnimationFrame(pr);
    };
  }, []);

  return (
    <div className="bg" aria-hidden="true">
      <div className="nebula" />
      <div id="sky" ref={skyRef}>
        <div className="x-drift">
          <canvas ref={cvRef} />
          <canvas ref={ovRef} />
        </div>
      </div>
      <div className="vignette" />
    </div>
  );
}
