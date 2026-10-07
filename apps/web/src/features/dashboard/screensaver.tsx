import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { useNow } from "@/components/live-clock";

export type Season = "winter" | "spring" | "summer" | "autumn";

/** Northern hemisphere seasons by month. */
export const seasonOf = (date: Date): Season => {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
};

export const SEASON_LABELS: Record<Season, string> = { winter: "Inverno", spring: "Primavera", summer: "Estate", autumn: "Autunno" };

/** A few sky palettes per season; the scene slowly cycles through them. */
const PALETTES: Record<Season, Array<[string, string, string]>> = {
  winter: [
    ["#0B1D3A", "#24426B", "#9CC3E6"],
    ["#1B1F3B", "#3E4A7A", "#C9D6EA"],
    ["#0E2A36", "#2E5E6E", "#B8DCE0"]
  ],
  spring: [
    ["#3B6E5A", "#8FC1A9", "#F6D6E3"],
    ["#4A6FA5", "#9CC5E8", "#FBE3EC"],
    ["#5B7F3A", "#B5D68A", "#FFF1C9"]
  ],
  summer: [
    ["#0F4C81", "#3FA7D6", "#FCE38A"],
    ["#FF7E5F", "#FEB47B", "#FFE8A3"],
    ["#11698E", "#19A7CE", "#F6F1E9"]
  ],
  autumn: [
    ["#4A2C2A", "#A0522D", "#F4A259"],
    ["#3D2C4F", "#8E5A6E", "#F2B880"],
    ["#2F3E46", "#7A5C3E", "#E9A24D"]
  ]
};

const PARTICLE_COLORS: Record<Season, string[]> = {
  winter: ["#FFFFFF", "#E8F1FF", "#DCE9F7"],
  spring: ["#F9C6D7", "#FFFFFF", "#F4A6C0", "#FFE3EE"],
  summer: ["#FFF6B7", "#FFE27A", "#FFFFFF"],
  autumn: ["#D9480F", "#E67700", "#F59F00", "#A61E4D", "#8D5524"]
};

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  angle: number;
  spin: number;
  sway: number;
  color: string;
}

const SCENE_MS = 45_000;
const FADE_MS = 6_000;

const lerpColor = (from: string, to: string, t: number): string => {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const a = parse(from);
  const b = parse(to);
  return `rgb(${a.map((value, index) => Math.round(value + (b[index]! - value) * t)).join(",")})`;
};

/** Animated seasonal scene drawn on a canvas: no image downloads, works offline on wall panels. */
const SeasonCanvas = ({ season }: { season: Season }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const colors = PARTICLE_COLORS[season];
    const palettes = PALETTES[season];
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    const started = performance.now();

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -20,
      size: season === "winter" ? 1.5 + Math.random() * 3.5 : season === "summer" ? 2 + Math.random() * 4 : 6 + Math.random() * 10,
      speedY: season === "summer" ? -0.15 - Math.random() * 0.25 : 0.4 + Math.random() * 1.1,
      speedX: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.03,
      sway: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)]!
    });

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.round((width * height) / (season === "winter" ? 9000 : 22000));
      particles = Array.from({ length: Math.min(count, 220) }, () => spawn(true));
    };

    const drawSky = (elapsed: number) => {
      const position = (elapsed / SCENE_MS) % palettes.length;
      const index = Math.floor(position);
      const fade = Math.min(1, Math.max(0, ((position - index) * SCENE_MS - (SCENE_MS - FADE_MS)) / FADE_MS));
      const current = palettes[index]!;
      const next = palettes[(index + 1) % palettes.length]!;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, lerpColor(current[0], next[0], fade));
      gradient.addColorStop(0.6, lerpColor(current[1], next[1], fade));
      gradient.addColorStop(1, lerpColor(current[2], next[2], fade));
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      // Season accents: sun glow in summer, moon in winter, soft hills otherwise.
      if (season === "summer") {
        const glow = context.createRadialGradient(width * 0.8, height * 0.22, 0, width * 0.8, height * 0.22, height * 0.45);
        glow.addColorStop(0, "rgba(255,244,190,0.95)");
        glow.addColorStop(0.15, "rgba(255,226,140,0.6)");
        glow.addColorStop(1, "rgba(255,226,140,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, width, height);
      } else if (season === "winter") {
        context.fillStyle = "rgba(255,255,255,0.85)";
        context.beginPath();
        context.arc(width * 0.82, height * 0.2, Math.min(width, height) * 0.05, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = season === "winter" ? "rgba(240,246,255,0.9)" : "rgba(0,0,0,0.18)";
      context.beginPath();
      context.moveTo(0, height);
      for (let x = 0; x <= width; x += 20) {
        context.lineTo(x, height * 0.82 + Math.sin(x / 180 + 1.3) * 22 + Math.sin(x / 70) * 6);
      }
      context.lineTo(width, height);
      context.fill();
    };

    const drawParticle = (particle: Particle) => {
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      if (season === "autumn") {
        // Leaf: two arcs and a stem.
        context.beginPath();
        context.moveTo(0, -particle.size);
        context.quadraticCurveTo(particle.size, 0, 0, particle.size);
        context.quadraticCurveTo(-particle.size, 0, 0, -particle.size);
        context.fill();
        context.strokeStyle = "rgba(60,30,10,0.45)";
        context.beginPath();
        context.moveTo(0, -particle.size);
        context.lineTo(0, particle.size * 1.3);
        context.stroke();
      } else if (season === "spring") {
        context.globalAlpha = 0.85;
        context.beginPath();
        context.ellipse(0, 0, particle.size * 0.55, particle.size * 0.35, 0, 0, Math.PI * 2);
        context.fill();
      } else if (season === "summer") {
        context.globalAlpha = 0.35 + 0.35 * Math.sin(particle.sway);
        context.shadowColor = particle.color;
        context.shadowBlur = 12;
        context.beginPath();
        context.arc(0, 0, particle.size, 0, Math.PI * 2);
        context.fill();
      } else {
        context.globalAlpha = 0.9;
        context.beginPath();
        context.arc(0, 0, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const render = (time: number) => {
      const elapsed = Math.max(0, time - started);
      drawSky(elapsed);
      for (const particle of particles) {
        if (!reduceMotion) {
          particle.sway += 0.01;
          particle.y += particle.speedY;
          particle.x += particle.speedX + Math.sin(particle.sway) * (season === "winter" ? 0.3 : 0.8);
          particle.angle += particle.spin;
        }
        if (particle.y > height + 30 || particle.y < -40 || particle.x < -40 || particle.x > width + 40) {
          Object.assign(particle, spawn(false), season === "summer" ? { y: height + 10 } : {});
        }
        drawParticle(particle);
      }
      frame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [season]);

  return <canvas ref={canvasRef} className="screensaver__canvas" aria-hidden="true" />;
};

interface ScreensaverProps {
  onExit: () => void;
}

const timeOf = (date: Date) => date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** "Next: Piscina Sofia alle 17:00", from today's events, refreshed every 5 minutes. */
const useNextEventCaption = (now: Date): string | null => {
  const [events, setEvents] = useState<Array<{ title: string; start: Date; end: Date }>>([]);
  const day = now.toDateString();

  useEffect(() => {
    let active = true;
    const load = () => {
      const from = new Date(new Date(day).setHours(0, 0, 0, 0));
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
      api
        .getCalendar(from.toISOString(), to.toISOString())
        .then((response) => {
          if (active) {
            setEvents(
              response.calendars
                .filter((calendar) => (calendar.kind ?? "events") === "events")
                .flatMap((calendar) => calendar.events)
                .filter((event) => !event.allDay && !event.redacted)
                .map((event) => ({ title: event.title, start: new Date(event.startAt), end: new Date(event.endAt) }))
            );
          }
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [day]);

  const next = events.filter((event) => event.end > now).sort((left, right) => left.start.getTime() - right.start.getTime())[0];
  if (!next) {
    return null;
  }
  return next.start <= now ? `Adesso: ${next.title}` : `Prossimo: ${next.title} alle ${timeOf(next.start)}`;
};

/**
 * Full-screen seasonal screensaver with a large clock. Any tap or key closes it.
 * The clock slowly drifts to avoid burn-in on always-on panels; a wake lock keeps the screen on.
 */
export const Screensaver = ({ onExit }: ScreensaverProps) => {
  const now = useNow();
  const caption = useNextEventCaption(now);
  const season = seasonOf(now);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    void root?.requestFullscreen?.().catch(() => undefined);
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        wakeLock = lock;
      })
      .catch(() => undefined);

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onExit();
      }
    };
    const onKey = () => onExit();
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
      void wakeLock?.release().catch(() => undefined);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [onExit]);

  // Position drifts every minute within a small box.
  const minute = now.getHours() * 60 + now.getMinutes();
  const offsetX = Math.sin(minute / 7) * 6;
  const offsetY = Math.cos(minute / 11) * 6;

  return (
    <div ref={rootRef} className="screensaver" role="dialog" aria-label="Screensaver" onClick={onExit} onTouchStart={onExit}>
      <SeasonCanvas season={season} />
      <div className="screensaver__clock" style={{ transform: `translate(calc(-50% + ${offsetX}vw), calc(-50% + ${offsetY}vh))` }}>
        <strong>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</strong>
        <span>{now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span>
        {caption ? <em>{caption}</em> : null}
      </div>
      <span className="screensaver__hint">{SEASON_LABELS[season]} · tocca per tornare</span>
    </div>
  );
};
