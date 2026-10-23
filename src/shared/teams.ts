/** A warning on one leg of a relay team, in the volunteer's words. Done stores it only once kept. */
export interface TeamWarning { kind:'unknown-number'|'wrong-section'|'other-relay'; message:string; kept:boolean }
/** One leg of a relay team: its child's wristband (null while the box is empty) and that child's kept warnings. */
export interface TeamLeg { wristband:number|null; warnings:TeamWarning[] }
/** A relay team on its relay's team list: Team 1, Team 2, ... with its four legs in leg order. */
export interface RelayTeam { id:string; number:number; legs:TeamLeg[]; version:number }
