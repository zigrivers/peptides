'use client';

import React, { useEffect, useRef } from 'react';

interface Props {
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const COLORS = [
  '#f43f5e', // rose
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#eab308', // yellow
  '#f97316', // orange
];

export function ConfettiCanvas({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize 150 confetti particles
    const particles: Particle[] = Array.from({ length: 150 }).map(() => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100, // start above the screen
      size: 5 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speedX: -2 + Math.random() * 4,
      speedY: 2 + Math.random() * 5,
      rotation: Math.random() * 360,
      rotationSpeed: -3 + Math.random() * 6,
      opacity: 1,
    }));

    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let allFaded = true;

      particles.forEach((p) => {
        // Physics update
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;

        // Gravity and wind friction
        p.speedY += 0.08;
        p.speedX *= 0.99;

        // Fade out near the bottom
        if (p.y > canvas.height * 0.7) {
          p.opacity -= 0.015;
        }

        if (p.opacity > 0) {
          allFaded = false;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;

          // Draw a rectangular confetti paper strip
          ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 1.5);
          ctx.restore();
        }
      });

      if (!allFaded) {
        animationFrameId = requestAnimationFrame(updateAndDraw);
      } else {
        if (onComplete) onComplete();
      }
    };

    animationFrameId = requestAnimationFrame(updateAndDraw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50 w-full h-full"
      style={{ mixBlendMode: 'normal' }}
    />
  );
}

export default ConfettiCanvas;
