import { useEffect, useRef } from "preact/hooks";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  baseAlpha: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Check for reduced motion preferences
    const prefersReducedMotion = globalThis.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const mouse = {
      x: null as number | null,
      y: null as number | null,
      radius: 220,
    };

    // Styling colors: shades of emerald, forest green, neon lime, gold, and white
    const colors = [
      "rgba(16, 185, 129, ", // emerald
      "rgba(52, 211, 153, ", // emerald light
      "rgba(163, 230, 53, ", // lime
      "rgba(251, 191, 36, ", // amber/gold
      "rgba(255, 255, 255, ", // white
    ];

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        width = parent.offsetWidth;
        height = parent.offsetHeight;
      } else {
        width = globalThis.innerWidth;
        height = globalThis.innerHeight;
      }
      canvas.width = width * globalThis.devicePixelRatio;
      canvas.height = height * globalThis.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(globalThis.devicePixelRatio, globalThis.devicePixelRatio);
      initParticles();
    };

    const initParticles = () => {
      // Scale particle count with screen size, cap max particles
      const particleDensity = Math.min(
        Math.floor((width * height) / 6000),
        prefersReducedMotion ? 15 : 120,
      );
      particles = [];

      for (let i = 0; i < particleDensity; i++) {
        const baseAlpha = Math.random() * 0.4 + 0.15;
        const colorIndex = Math.floor(Math.random() * colors.length);
        const radius = Math.random() * 1.8 + 0.8;

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: prefersReducedMotion ? 0 : (Math.random() - 0.5) * 1.8,
          vy: prefersReducedMotion ? 0 : (Math.random() - 0.5) * 1.8,
          radius,
          color: colors[colorIndex],
          alpha: baseAlpha,
          baseAlpha,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.touches[0].clientX - rect.left;
        mouse.y = e.touches[0].clientY - rect.top;
      }
    };

    const handleTouchEnd = () => {
      mouse.x = null;
      mouse.y = null;
    };

    // Attach event listeners
    resizeCanvas();
    globalThis.addEventListener("resize", resizeCanvas);

    const parentElement = canvas.parentElement || window;
    parentElement.addEventListener(
      "mousemove",
      handleMouseMove as EventListener,
    );
    parentElement.addEventListener("mouseleave", handleMouseLeave);
    parentElement.addEventListener(
      "touchmove",
      handleTouchMove as EventListener,
      { passive: true },
    );
    parentElement.addEventListener("touchend", handleTouchEnd);

    // Dynamic animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw connecting lines between particles
      if (!prefersReducedMotion) {
        const connectionDist = 135;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < connectionDist) {
              const alpha = (1 - dist / connectionDist) * 0.22;
              ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
              ctx.lineWidth = 0.75;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      // 2. Update and draw particles
      particles.forEach((p) => {
        // Move particle
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Mouse gravity influence
        if (mouse.x !== null && mouse.y !== null && !prefersReducedMotion) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouse.radius) {
            // Draw interactive connector to mouse
            const lineAlpha = (1 - dist / mouse.radius) * 0.25;
            ctx.strokeStyle = `rgba(251, 191, 36, ${lineAlpha})`; // Golden connections to mouse
            ctx.lineWidth = 0.95;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();

            // Attract particles gently to cursor
            const force = (mouse.radius - dist) / mouse.radius;
            p.x += (dx / dist) * force * 1.5;
            p.y += (dy / dist) * force * 1.5;
            p.alpha = Math.min(0.85, p.baseAlpha + force * 0.45);
          } else {
            p.alpha = p.baseAlpha;
          }
        } else {
          p.alpha = p.baseAlpha;
        }

        // Render particle
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      globalThis.removeEventListener("resize", resizeCanvas);
      parentElement.removeEventListener(
        "mousemove",
        handleMouseMove as EventListener,
      );
      parentElement.removeEventListener("mouseleave", handleMouseLeave);
      parentElement.removeEventListener(
        "touchmove",
        handleTouchMove as EventListener,
      );
      parentElement.removeEventListener("touchend", handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      class="absolute inset-0 w-full h-full pointer-events-none block z-0"
      aria-hidden="true"
    />
  );
}
