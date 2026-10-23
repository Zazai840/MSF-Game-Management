import type { ResultEntry,ResultTeam } from '../../shared/results-rules.js';
/** A relay team's children in leg order, an empty box as "-": "2101 · 2134 · 2187 · 2150". */
export const teamWristbands=(team:ResultTeam)=>team.wristbands.map(wristband=>wristband??'-').join(' · ');
/** How a row's button is announced: "Runner 2001", or "Team 3 · 2101 · 2134 · 2187 · 2150". */
export const resultLabel=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?`Team ${entry.team.number} · ${teamWristbands(entry.team)}`:`Runner ${entry.wristband}`;
/** Whose result it is, as a lead reads it: a child's wristband, or "Team 3" over its four children in leg order. */
export function ResultName({entry,className='result-number'}:{entry:Pick<ResultEntry,'wristband'|'team'>;className?:string}) {
  return entry.team?<strong className={`${className} result-team`}>Team {entry.team.number}<span className="result-legs">{teamWristbands(entry.team)}</span></strong>
    :<strong className={className}>{entry.wristband??'-'}</strong>;
}
