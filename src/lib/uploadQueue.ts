import { useSyncExternalStore } from 'react';

/**
 * What is currently being uploaded, for the progress panel.
 *
 * Deliberately a plain module-level store rather than a context: uploads are
 * started from `fileStore`, which is not a React module and has no provider
 * above it. Every upload registers here on its own, so a screen gets the
 * panel without threading any state through it.
 *
 * Sending a document to Google Drive is a two-hop trip -- browser to edge
 * function, edge function to Google -- and on a field worker's phone it is
 * seconds, not milliseconds. That time cannot be removed, only made visible
 * and non-blocking.
 */

export type UploadStatus = 'uploading' | 'done' | 'error';

export interface UploadJob {
  id: string;
  /** What the user recognises it as, e.g. "Aadhaar (Front)". */
  label: string;
  status: UploadStatus;
  /** 0-100. Sits at 100 while the edge function is still talking to Google. */
  progress: number;
  error?: string;
  startedAt: number;
}

let jobs: UploadJob[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  // A new array identity each time, so `useSyncExternalStore` sees the change.
  jobs = [...jobs];
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshot = (): UploadJob[] => jobs;

export const startJob = (label: string): string => {
  const id = crypto.randomUUID();
  jobs = [...jobs, { id, label, status: 'uploading', progress: 0, startedAt: Date.now() }];
  emit();
  return id;
};

const patch = (id: string, changes: Partial<UploadJob>) => {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...changes } : job));
  emit();
};

export const setProgress = (id: string, progress: number): void =>
  patch(id, { progress: Math.min(99, Math.max(0, Math.round(progress))) });

/**
 * Finished jobs clear themselves after a moment. The panel is an
 * acknowledgement, not a log -- leaving completed rows to pile up would make
 * the user dismiss the thing they need to see when one actually fails.
 */
export const finishJob = (id: string): void => {
  patch(id, { status: 'done', progress: 100 });
  setTimeout(() => dismissJob(id), 4000);
};

/** Failures stay until dismissed, so a silent loss is impossible. */
export const failJob = (id: string, error: string): void => patch(id, { status: 'error', error });

export const dismissJob = (id: string): void => {
  jobs = jobs.filter((job) => job.id !== id);
  emit();
};

export const dismissFinished = (): void => {
  jobs = jobs.filter((job) => job.status === 'uploading');
  emit();
};

export const useUploadQueue = (): UploadJob[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
