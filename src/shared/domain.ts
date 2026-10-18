export const levels = ['Volunteer', 'Lead', 'Scoring team'] as const;
export type Level = typeof levels[number];
/** The signed-in principal: one day's sign-in row (id), its day, name and level, and its profile. */
export interface Phone { id: string; dayId: string; name: string; level: Level; profileId: string }
export type Job = 'Start line' | 'Finish order' | 'Times';
export interface WaitingCounts { 'Start line': number; 'Finish order': number; Times: number }
