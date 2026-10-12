export type Section = 'Boy Beavers' | 'Girl Beavers' | 'Boy Cubs' | 'Girl Cubs' | 'Boy Scouts' | 'Girl Scouts';
export interface Event { code: string; name: string; section: Section; format: 'heats' | 'timed' }
/** Walking-skeleton boundary. Race-bearing state is added by the results-rules ticket. */
export interface EventState { event: Event; races: readonly never[] }
export function eventResults(_state: EventState) {
  return {leaderboard:[], qualifiers:[], medalPlaces:[], ties:[], notRankedYet:[], needsYou:[]};
}
