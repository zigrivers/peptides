'use client';

import React, { useState } from 'react';
import { type SpendAnalytics } from '@/lib/dashboard/application/SpendAnalyticsService';
import { DollarSign, TrendingUp, Calendar, PieChart } from 'lucide-react';

interface Props {
  analytics: SpendAnalytics;
}

export function SpendAnalyticsCard({ analytics }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'compounds'>('overview');

  const { loggedSpendYtd, loggedSpendMonthly, projectedSpend, spendByCompound } = analytics;

  const hasSpend = parseFloat(loggedSpendYtd || '0') > 0 || parseFloat(projectedSpend?.monthly || '0') > 0;

  if (!hasSpend) {
    return (
      <div className="rounded-xl border border-border bg-card text-card-foreground p-6 text-center shadow-sm">
        <DollarSign className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
        <h3 className="text-base font-semibold text-foreground">No Spend Data Yet</h3>
        <p className="text-sm text-muted-foreground mt-1">Associate costs with your vials in the Reconstitution inventory to track and project compound spend.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="border-b border-border bg-muted/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Spend & Cost Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Track historical spend and estimate future runway</p>
        </div>

        {/* Tab Controls */}
        <div 
          role="tablist"
          className="flex bg-muted/60 p-0.5 rounded-lg border border-border/50 self-start sm:self-auto"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`p-1.5 text-xs font-semibold rounded-md transition-all duration-150 flex items-center gap-1 ${
              activeTab === 'overview' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Overview"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'forecast'}
            onClick={() => setActiveTab('forecast')}
            className={`p-1.5 text-xs font-semibold rounded-md transition-all duration-150 flex items-center gap-1 ${
              activeTab === 'forecast' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Forecasts"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Forecasts</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'compounds'}
            onClick={() => setActiveTab('compounds')}
            className={`p-1.5 text-xs font-semibold rounded-md transition-all duration-150 flex items-center gap-1 ${
              activeTab === 'compounds' ? 'bg-white dark:bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="By Compound"
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Compounds</span>
          </button>
        </div>
      </div>

      {/* Card Content Panels */}
      <div className="p-5">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4 bg-muted/10">
                <span className="text-xs text-muted-foreground block font-medium">Logged Spend (Month)</span>
                <span className="text-2xl font-bold text-foreground mt-1 block">
                  ${parseFloat(loggedSpendMonthly || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-muted-foreground font-normal">USD</span>
                </span>
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/10">
                <span className="text-xs text-muted-foreground block font-medium">Logged Spend (YTD)</span>
                <span className="text-2xl font-bold text-foreground mt-1 block">
                  ${parseFloat(loggedSpendYtd || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-muted-foreground font-normal">USD</span>
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-4 bg-emerald-500/5">
              <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Active Run Rate Estimation
              </h4>
              <p className="text-sm text-muted-foreground mt-1.5">
                Based on your active regimens, your estimated spend is{' '}
                <strong className="text-foreground">${parseFloat(projectedSpend?.weekly || '0').toFixed(2)} USD/week</strong> or{' '}
                <strong className="text-foreground">${parseFloat(projectedSpend?.monthly || '0').toFixed(2)} USD/month</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Forecast Tab */}
        {activeTab === 'forecast' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Regimen Cost Projections
            </h3>
            <p className="text-xs text-muted-foreground">
              Estimates are calculated using the cost per mg of your active vials, scaled by your dosing schedule.
            </p>

            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/5">
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Daily Run Rate</span>
                <span className="text-sm font-semibold text-foreground">${parseFloat(projectedSpend?.daily || '0').toFixed(2)} USD</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Weekly Run Rate</span>
                <span className="text-sm font-semibold text-foreground">${parseFloat(projectedSpend?.weekly || '0').toFixed(2)} USD</span>
              </div>
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Monthly Run Rate</span>
                <span className="text-sm font-semibold text-foreground">${parseFloat(projectedSpend?.monthly || '0').toFixed(2)} USD</span>
              </div>
            </div>
          </div>
        )}

        {/* Compounds Tab */}
        {activeTab === 'compounds' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Spend Breakdown (YTD)</h3>
            
            {spendByCompound.length === 0 ? (
              <p className="text-xs text-muted-foreground">No compound-specific spend has been logged yet.</p>
            ) : (
              <div className="space-y-3">
                {spendByCompound.map((item) => (
                  <div key={item.compoundId} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-foreground">{item.compoundName}</span>
                      <span className="text-muted-foreground">
                        ${parseFloat(item.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
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
