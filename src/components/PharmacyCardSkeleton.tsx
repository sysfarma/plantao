import React from 'react';
import { Skeleton } from './ui/Skeleton';

export function PharmacyCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm w-full">
      <Skeleton className="h-6 w-3/4 mb-2" />
      <div className="space-y-1 mb-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}

export function OnCallPharmacyCardSkeleton() {
  return (
    <div className="bg-white border border-emerald-100 rounded-xl p-6 shadow-sm w-full relative overflow-hidden">
      <div className="absolute top-0 right-0">
        <Skeleton className="h-6 w-24 rounded-bl-lg rounded-tr-none" />
      </div>
      
      <div className="mb-4">
        <Skeleton className="h-7 w-2/3 mb-2" />
        <div className="flex items-start gap-2">
          <Skeleton className="h-4 w-4 rounded-full mt-0.5" />
          <div className="space-y-1 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>
      
      <div className="mt-3 w-full flex justify-center">
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
