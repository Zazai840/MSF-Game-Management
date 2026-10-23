import type { ResultEntry,ResultTeam } from '../../shared/results-rules.js';
/** A relay team's children in leg order, an empty box as "-": "2101 · 2134 · 2187 · 2150". */
export const teamWristbands=(team:ResultTeam)=>team.wristbands.map(wristband=>wristband??'-').join(' · ');
/** How a row's button is announced: "Runner 2001", or "Team 3 · 2101 · 2134 · 2187 · 2150". */
export const resultLabel=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?`Team ${entry.team.number} · ${teamWristbands(entry.team)}`:`Runner ${entry.wristband}`;
/** A relay team's four children, on their own line under its name. */
export const TeamLegs=({team}:{team:ResultTeam})=><span className="result-legs">{teamWristbands(team)}</span>;
/**
 * Whose result it is, as a lead reads it: a child's wristband, or "Team 3" with its four children in leg order, on the
 * line below, after it in a list ("Team 3 · 2101 · ..."), or left for the row to place (`legs="none"`).
 */
export function ResultName({entry,className='result-number',legs='below'}:{entry:Pick<ResultEntry,'wristband'|'team'>;className?:string;legs?:'below'|'inline'|'none'}) {
  if(!entry.team) return <strong className={className}>{entry.wristband??'-'}</strong>;
  return <><strong className={className}>Team {entry.team.number}{legs==='below' && <TeamLegs team={entry.team}/>}</strong>
    {legs==='inline' && <span className="result-legs-inline"> · {teamWristbands(entry.team)}</span>}</>;
}
