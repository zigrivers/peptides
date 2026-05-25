'use client';

import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {/* Title skeleton */}
      <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />

      {/* Main checklist or alert placeholder */}
      <div className="h-16 w-full bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-800/50 animate-pulse" />

      {/* StackOverview Grid Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Adherence Card */}
        <div className="border border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/70 rounded-xl p-5 space-y-4">
          <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Protocols Card */}
        <div className="border border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/70 rounded-xl p-5 space-y-4">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </div>

        {/* Vials Card */}
        <div className="border border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/70 rounded-xl p-5 space-y-4 md:col-span-2">
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          <div className="space-y-3">
            <div className="h-10 w-full bg-slate-100 dark:bg-slate-900 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-100 dark:bg-slate-900 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
export default DashboardSkeleton;
