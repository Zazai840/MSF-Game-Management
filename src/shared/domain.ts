export const levels = ['Volunteer', 'Lead', 'Scoring team'] as const;
export type Level = typeof levels[number];
export interface Phone { id: string; dayId: string; name: string; level: Level }
export type Job = 'Start line' | 'Finish order' | 'Times';
export interface WaitingCounts { 'Start line': number; 'Finish order': number; Times: number }
