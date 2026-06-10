'use client';

import React, { useState } from 'react';
import { type WellbeingSentimentInsightsData } from '@/lib/tracker/application/OutcomeLogService';
import { Smile, Tag, FileText, BarChart2 } from 'lucide-react';

interface Props {
  insights: WellbeingSentimentInsightsData;
}

export function WellbeingSentimentInsights({ insights }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'compounds' | 'tags' | 'notes'>('overview');

  const { averageRating, tagFrequencies, notesSummary, compoundCorrelations } = insights;

  // Helpers for styling ratings
  const getRatingColor = (rating: number) => {
    if (rating >= 4.0) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (rating >= 3.0) return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
    return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
  };

  const getRatingFill = (rating: number) => {
    if (rating >= 4.0) return 'bg-emerald-500';
    if (rating >= 3.0) return 'bg-indigo-500';
    return 'bg-amber-500';
  };

  const hasData = averageRating !== null || tagFrequencies.length > 0 || notesSummary.length > 0 || compoundCorrelations.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card text-card-foreground p-6 text-center shadow-sm">
        <Smile className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
        <h3 className="text-base font-semibold text-foreground">No Wellbeing Insights Yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Log outcomes daily on the calendar to see sentiment correlations over time.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="border-b border-border bg-muted/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Smile className="w-5 h-5 text-primary" />
            Wellbeing Sentiment Insights
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">180-day historical correlation analysis</p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/50 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-9 min-w-9 px-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1 ${
              activeTab === 'overview' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Overview"
          >
            <Smile className="w-4 h-4" />
            <span className="hidden md:inline">Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compounds')}
            className={`min-h-9 min-w-9 px-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1 ${
              activeTab === 'compounds' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Compound Correlations"
          >
            <BarChart2 className="w-4 h-4" />
            <span className="hidden md:inline">Compounds</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tags')}
            className={`min-h-9 min-w-9 px-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1 ${
              activeTab === 'tags' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Tag Frequencies"
          >
            <Tag className="w-4 h-4" />
            <span className="hidden md:inline">Tags</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`min-h-9 min-w-9 px-2 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1 ${
              activeTab === 'notes' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Recent Notes"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden md:inline">Notes</span>
          </button>
        </div>
      </div>

      {/* Card Content Panels */}
      <div className="p-5">
        {activeTab === 'overview' && (
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Big Sentiment Score Circle */}
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="40" className="stroke-muted fill-none" strokeWidth="6" />
                {averageRating !== null && (
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    className="stroke-primary fill-none transition-all duration-500 ease-out"
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - averageRating / 5)}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-foreground">
                  {averageRating !== null ? averageRating.toFixed(1) : '-'}
                </span>
                <span className="text-[10px] text-muted-foreground block font-bold tracking-wide">OUT OF 5</span>
              </div>
            </div>

            {/* Quick Summary list */}
            <div className="flex-1 space-y-3 w-full">
              <h3 className="text-sm font-semibold text-foreground">Wellbeing Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your average wellbeing score over the last 180 days is{' '}
                <span className="font-bold text-foreground">
                  {averageRating !== null ? averageRating.toFixed(2) : 'N/A'}
                </span>
                .
                {tagFrequencies.length > 0 && (
                  <>
                    {' '}The tag you record most frequently is{' '}
                    <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      {tagFrequencies[0].tag}
                    </span>
                    , which correlates with an average wellbeing rating of{' '}
                    <span className="font-bold text-foreground">
                      {tagFrequencies[0].avgRating.toFixed(1)}
                    </span>
                    .
                  </>
                )}
              </p>

              {/* Tag mini preview */}
              {tagFrequencies.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-1.5">Top Sentiment Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagFrequencies.slice(0, 3).map(({ tag, count, avgRating }) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-xs font-medium ${getRatingColor(
                          avgRating
                        )}`}
                      >
                        {tag} <span className="opacity-60 text-[10px]">({count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'compounds' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Dosing vs Non-Dosing Correlations</h3>
            {compoundCorrelations.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 italic text-center py-4">No active compound protocols recorded.</p>
            ) : (
              <div className="space-y-4">
                {compoundCorrelations.map((c) => {
                  const hasDosed = c.averageRatingOnDosedDays !== null;
                  const hasNotDosed = c.averageRatingOnNotDosedDays !== null;
                  
                  return (
                    <div key={c.compoundName} className="border border-border/60 bg-muted/10 p-3 rounded-lg space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-foreground">{c.compoundName}</span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {c.dosedDaysCount} days dosed / {c.notDosedDaysCount} days not
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Dosed Days Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>When Dosed</span>
                            <span className="font-semibold text-foreground">
                              {hasDosed ? `${c.averageRatingOnDosedDays!.toFixed(2)} ★` : 'No logs'}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            {hasDosed && (
                              <div
                                className={`h-full rounded-full ${getRatingFill(c.averageRatingOnDosedDays!)}`}
                                style={{ width: `${(c.averageRatingOnDosedDays! / 5) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Non-Dosed Days Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>When Not Dosed</span>
                            <span className="font-semibold text-foreground">
                              {hasNotDosed ? `${c.averageRatingOnNotDosedDays!.toFixed(2)} ★` : 'No logs'}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            {hasNotDosed && (
                              <div
                                className={`h-full rounded-full ${getRatingFill(c.averageRatingOnNotDosedDays!)}`}
                                style={{ width: `${(c.averageRatingOnNotDosedDays! / 5) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Tag Sentiment Map</h3>
            {tagFrequencies.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 italic text-center py-4">No outcome tags recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2 py-2">
                {tagFrequencies.map(({ tag, count, avgRating }) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border text-sm font-semibold transition-transform duration-100 hover:scale-105 ${getRatingColor(
                      avgRating
                    )}`}
                  >
                    <span>{tag}</span>
                    <span className="inline-flex items-center justify-center rounded-full bg-foreground/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold">
                      {count}
                    </span>
                    <span className="text-[10px] opacity-80">{avgRating.toFixed(1)} ★</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Recent Qualitative Notes</h3>
            {notesSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 italic text-center py-4">No notes recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {notesSummary.map((n, idx) => (
                  <div key={idx} className="border border-border/80 p-3 rounded-lg space-y-1.5 bg-muted/5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-muted-foreground">{n.date}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getRatingColor(n.rating)}`}>
                        {n.rating} ★
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{n.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
