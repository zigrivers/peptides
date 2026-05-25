'use client';

import React, { useState } from 'react';
import type { DoseAmount } from '@/lib/tracker/domain/types';

type SerializedDoseLog = {
  id: string;
  protocolId: string;
  compoundId: string;
  scheduledDate: string;
  amount: DoseAmount;
  status: 'LOGGED' | 'SKIPPED' | 'PENDING' | 'RESCHEDULED';
};

type SerializedOutcomeLog = {
  id: string;
  scheduledDate: string;
  overallRating: number;
  tags: string[];
  note: string | null;
};

interface Props {
  doseLogs: SerializedDoseLog[];
  outcomeLogs: SerializedOutcomeLog[];
  compounds: Record<string, { name: string; slug: string }>;
  referenceDate?: string;
  onSelectDate?: (dateStr: string) => void;
}

const PADDING_LEFT = 40;
const PADDING_TOP = 20;
const CHART_WIDTH = 540;
const CHART_HEIGHT = 180;

function getCapColor(compoundSlug: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': '--compound-tirzepatide',
    'semaglutide': '--compound-semaglutide',
    'bpc-157': '--compound-bpc157',
  };
  if (knownColors[compoundSlug]) return `hsl(var(${knownColors[compoundSlug]}))`;
  return 'hsl(215 16% 47%)';
}

export function DoseOutcomeChart({ doseLogs, outcomeLogs, compounds, referenceDate, onSelectDate }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Keep track of active filters
  const uniqueProtocols = Object.entries(compounds);
  const [selectedProtocolIds, setSelectedProtocolIds] = useState<string[]>(() =>
    uniqueProtocols.map(([id]) => id)
  );

  // Generate date array for the last 30 days (UTC)
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const dateArray: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    dateArray.push(d.toISOString().split('T')[0]);
  }

  // Filter doses based on checkbox choices
  const filteredDoseLogs = doseLogs.filter((l) => selectedProtocolIds.includes(l.protocolId));

  // Map outcome rating points
  const ratingPoints = dateArray
    .map((dateStr, idx) => {
      const outcome = outcomeLogs.find((o) => o.scheduledDate.startsWith(dateStr));
      if (!outcome) return null;
      const x = PADDING_LEFT + (idx / 29) * CHART_WIDTH;
      const y = PADDING_TOP + CHART_HEIGHT - ((outcome.overallRating - 1) / 4) * CHART_HEIGHT;
      return { x, y, rating: outcome.overallRating, dateStr, tags: outcome.tags, note: outcome.note };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Map filtered doses
  const dosesByDate = dateArray.map((dateStr, idx) => {
    const dayLogs = filteredDoseLogs.filter((l) => l.scheduledDate.startsWith(dateStr) && l.status === 'LOGGED');
    const x = PADDING_LEFT + (idx / 29) * CHART_WIDTH;
    return { x, dateStr, dayLogs };
  });

  // Construct SVG paths
  let linePathD = '';
  let areaPathD = '';
  if (ratingPoints.length >= 1) {
    linePathD = `M ${ratingPoints[0].x} ${ratingPoints[0].y} ` + ratingPoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
    areaPathD = `${linePathD} L ${ratingPoints[ratingPoints.length - 1].x} ${PADDING_TOP + CHART_HEIGHT} L ${ratingPoints[0].x} ${PADDING_TOP + CHART_HEIGHT} Z`;
  }

  // Hover calculations
  const activeHoverData = hoveredIdx !== null ? (() => {
    const dateStr = dateArray[hoveredIdx];
    const outcome = outcomeLogs.find((o) => o.scheduledDate.startsWith(dateStr));
    const dayLogs = filteredDoseLogs.filter((l) => l.scheduledDate.startsWith(dateStr) && l.status === 'LOGGED');
    const x = PADDING_LEFT + (hoveredIdx / 29) * CHART_WIDTH;
    return { x, dateStr, outcome, dayLogs };
  })() : null;

  return (
    <div className="border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm space-y-4 relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <span>📈</span>
            <span>Outcome & Dosage Trends</span>
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Correlation of compound dosing and daily ratings over the last 30 days. Click a point to drill down.</p>
        </div>
      </div>

      {/* Screen Reader Visually Hidden Data Table */}
      <table className="sr-only">
        <caption>Dosage and Rating Correlation Table</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Doses Logged</th>
            <th scope="col">Overall Rating</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {dateArray.map((dateStr) => {
            const outcome = outcomeLogs.find((o) => o.scheduledDate.startsWith(dateStr));
            const dayLogs = filteredDoseLogs.filter((l) => l.scheduledDate.startsWith(dateStr) && l.status === 'LOGGED');
            const dosesStr = dayLogs.map((l) => {
              const comp = compounds[l.protocolId] ?? { name: 'Compound' };
              return `${l.amount.amount} ${l.amount.unit} ${comp.name}`;
            }).join(', ');
            return (
              <tr key={dateStr}>
                <td>{new Date(dateStr).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })}</td>
                <td>{dosesStr || 'None'}</td>
                <td>{outcome ? `${outcome.overallRating}/5` : 'None'}</td>
                <td>{outcome?.note || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Interactive Chart Area */}
      <div className="relative">
        <svg
          viewBox="0 0 600 240"
          className="w-full h-auto overflow-visible select-none"
          role="graphics-document"
          aria-label="Dosage and rating correlation graph over the last 30 days"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clientX = e.clientX - rect.left - PADDING_LEFT;
            const ratio = clientX / CHART_WIDTH;
            const idx = Math.min(29, Math.max(0, Math.round(ratio * 29)));
            setHoveredIdx(idx);
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines (Y axis) */}
          {[1, 2, 3, 4, 5].map((val) => {
            const y = PADDING_TOP + CHART_HEIGHT - ((val - 1) / 4) * CHART_HEIGHT;
            return (
              <g key={`grid-y-${val}`}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={PADDING_LEFT + CHART_WIDTH}
                  y2={y}
                  className="stroke-border/40"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={y + 3}
                  className="text-[9px] font-medium fill-muted-foreground font-sans"
                  textAnchor="end"
                >
                  {val}★
                </text>
              </g>
            );
          })}

          {/* X Axis base line */}
          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP + CHART_HEIGHT}
            x2={PADDING_LEFT + CHART_WIDTH}
            y2={PADDING_TOP + CHART_HEIGHT}
            className="stroke-border/60"
            strokeWidth="1"
          />

          {/* X Axis tick dates */}
          {dateArray.map((dateStr, idx) => {
            if (idx % 6 !== 0 && idx !== 29) return null;
            const x = PADDING_LEFT + (idx / 29) * CHART_WIDTH;
            const formatted = new Date(dateStr).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
            return (
              <text
                key={`grid-x-${dateStr}`}
                x={x}
                y={PADDING_TOP + CHART_HEIGHT + 14}
                className="text-[8px] font-medium fill-muted-foreground font-sans"
                textAnchor="middle"
              >
                {formatted}
              </text>
            );
          })}

          {/* Plotted Area Gradient */}
          {areaPathD && (
            <path d={areaPathD} fill="url(#area-grad)" className="pointer-events-none" />
          )}

          {/* Plotted Line */}
          {linePathD && (
            <path
              d={linePathD}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Plotted Dots */}
          {ratingPoints.map((pt, idx) => (
            <circle
              key={`dot-${idx}`}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              className="fill-card stroke-primary cursor-pointer"
              strokeWidth="1.5"
              onClick={() => onSelectDate && onSelectDate(pt.dateStr)}
            />
          ))}

          {/* Compound dose markers */}
          {dosesByDate.map((day) => {
            if (day.dayLogs.length === 0) return null;
            return day.dayLogs.map((log, logIdx) => {
              const comp = compounds[log.protocolId] ?? { name: 'Compound', slug: 'unknown' };
              const color = getCapColor(comp.slug);
              const yOffset = PADDING_TOP + CHART_HEIGHT + 24 + logIdx * 8;
              return (
                <circle
                  key={`dose-marker-${log.id}`}
                  cx={day.x}
                  cy={yOffset}
                  r="3"
                  style={{ fill: color }}
                  className="stroke-background cursor-pointer"
                  strokeWidth="0.5"
                  onClick={() => onSelectDate && onSelectDate(day.dateStr)}
                />
              );
            });
          })}

          {/* Hover guideline */}
          {activeHoverData && (
            <line
              x1={activeHoverData.x}
              y1={PADDING_TOP}
              x2={activeHoverData.x}
              y2={PADDING_TOP + CHART_HEIGHT + 35}
              className="stroke-muted-foreground/30"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Keyboard accessible invisible hover bars */}
          {dateArray.map((dateStr, idx) => {
            const x = PADDING_LEFT + (idx / 29) * CHART_WIDTH;
            const width = CHART_WIDTH / 29;
            return (
              <rect
                key={`tab-bar-${idx}`}
                x={x - width / 2}
                y={PADDING_TOP}
                width={width}
                height={CHART_HEIGHT + 40}
                className="fill-transparent outline-none cursor-pointer focus:fill-primary/5 focus:stroke-primary/20"
                tabIndex={0}
                role="button"
                aria-haspopup="dialog"
                aria-label={`View data for ${new Date(dateStr).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', day: 'numeric' })}`}
                aria-describedby={`chart-tooltip-content`}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
                onClick={() => onSelectDate && onSelectDate(dateStr)}
              />
            );
          })}
        </svg>

        {/* Dynamic Glassmorphic Tooltip Overlay */}
        {activeHoverData && (
          <div
            id="chart-tooltip-content"
            className="absolute top-2 bg-card/90 border border-border rounded-lg p-2.5 shadow-lg text-xs space-y-1.5 pointer-events-none backdrop-blur-md z-10 animate-[fadeIn_0.15s_ease-out]"
            style={{
              left: `${Math.min(80, Math.max(2, ((activeHoverData.x - PADDING_LEFT) / CHART_WIDTH) * 100))}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="font-bold text-foreground">
              {new Date(activeHoverData.dateStr).toLocaleDateString(undefined, {
                timeZone: 'UTC',
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </p>

            <div className="space-y-1 border-t border-border pt-1">
              {/* Rating info */}
              {activeHoverData.outcome ? (
                <div>
                  <p className="text-muted-foreground font-medium">
                    Rating: <span className="font-bold text-primary">{activeHoverData.outcome.overallRating}/5 ★</span>
                  </p>
                  {activeHoverData.outcome.tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {activeHoverData.outcome.tags.map((t) => (
                        <span key={t} className="bg-primary/5 text-primary text-[8px] font-semibold px-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                  {activeHoverData.outcome.note && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-2">
                      &ldquo;{activeHoverData.outcome.note}&rdquo;
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-[10px]">No outcome rated</p>
              )}

              {/* Doses info */}
              {activeHoverData.dayLogs.length > 0 ? (
                <div className="space-y-0.5 pt-0.5 border-t border-border">
                  <p className="text-[10px] font-semibold text-muted-foreground">Logged Doses:</p>
                  {activeHoverData.dayLogs.map((log) => {
                    const comp = compounds[log.protocolId] ?? { name: 'Compound', slug: 'unknown' };
                    return (
                      <div key={log.id} className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: getCapColor(comp.slug) }}
                        />
                        <span className="text-foreground text-[10px]">
                          {log.amount.amount} {log.amount.unit} &middot; {comp.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-[10px] pt-0.5 border-t border-border">No doses logged</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter Checkboxes */}
      {uniqueProtocols.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-border/60">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Show Doses for:</span>
          <div className="flex flex-wrap gap-3">
            {uniqueProtocols.map(([protoId, comp]) => {
              const isChecked = selectedProtocolIds.includes(protoId);
              const color = getCapColor(comp.slug);
              return (
                <label key={protoId} className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold select-none text-foreground/80 hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      setSelectedProtocolIds((prev) =>
                        prev.includes(protoId) ? prev.filter((id) => id !== protoId) : [...prev, protoId]
                      );
                    }}
                    className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {comp.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DoseOutcomeChart;
