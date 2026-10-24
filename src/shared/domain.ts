export const levels = ['Volunteer', 'Lead'] as const;
export type Level = typeof levels[number];
/** The signed-in principal: one day's sign-in row (id), its day, name and level, and its profile. */
export interface Phone { id: string; dayId: string; name: string; level: Level; profileId: string }
