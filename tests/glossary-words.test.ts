import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { expect, test } from 'vitest';
// GLOSSARY.md's terms and, for each, the words it says to avoid ("Relay race (a race is one run)" avoids "Relay race").
const glossary=readFileSync('GLOSSARY.md','utf8');
const terms=[...glossary.matchAll(/^\*\*(.+?)\*\*/gm)].map(([,term])=>term);
const avoided=[...glossary.matchAll(/^_Avoid_: (.+)$/gm)].flatMap(([,list])=>list.split(',').map(word=>word.replace(/\(.*\)/,'').trim()))
  // A word one entry avoids that is another entry's own term (Didn't run) means that term where it is used.
  .filter((word,at,all)=>word&&all.findIndex(other=>other.toLowerCase()===word.toLowerCase())===at&&!terms.some(term=>term.toLowerCase()===word.toLowerCase()));
/** Avoided words the screens keep on purpose: everywhere, or only in files under `in`. */
const lead='src/client/lead/';
const allowed:Array<{word:string;in?:string;reason:string}>=[
  {word:'Run',reason:'the verb (every heat has run, a final to run); a race is never called a run'},
  {word:'Results',reason:"the lead's Results screen and an event's results; the finishing order is never called results"},
  {word:'Result',reason:'a child\'s result in an event (choose which result counts), never a time'},
  {word:'absent',reason:"Absent marks the glossary's absent finalist (or team) at a final's check-in"},
  {word:'Job',reason:"the everyday word for a role on Join and the role chip (What's your job today?, Switch job); the relay race screen's jobs are gone"},
  {word:'remove',reason:'deleting a runner, a phone or a team from its list; Take off is only a team taken out of a heat at check-in'},
  // Spec #194 left Results, Day setup and the relay screens as they were: their words change with their own spec.
  {word:'line-up',in:lead,reason:"a final's seeded line-up, the glossary's Finals line-up"},
  {word:'comment',in:lead,reason:"lead-only rulings keep their Comment box (an audit note's comment)"},
  {word:'Official',in:lead,reason:"lead-only Results keeps its Official leaderboard"},
  {word:'Positions',in:lead,reason:"lead-only Results keeps a final's Final positions"},
  {word:'stage',in:lead,reason:'lead-only Results keeps "unlocks the stage for corrections"'},
];
const isAllowed=(word:string,file:string)=>allowed.some(allow=>allow.word===word&&file.startsWith(allow.in??''));
const words=(text:string)=>{
  // A glossary term's own words never count: "run" in "Didn't run", "line-up" in "Finals line-up".
  for(const term of terms) text=text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),' ');
  return avoided.filter(word=>new RegExp(`(^|[^\\w'-])${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^\\w'-])`,'i').test(text));
};
/** The text a person can read in a source file: JSX text and string literals, not class names, routes, keys or code words. */
function shownText(file:string) {
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const found:Array<{text:string;line:number}>=[];
  const notShown=(node:ts.Node)=>{
    const parent=node.parent;
    return ts.isImportDeclaration(parent)||ts.isExportDeclaration(parent)||ts.isLiteralTypeNode(parent)||ts.isElementAccessExpression(parent)
      ||(ts.isPropertyAssignment(parent)&&parent.name===node)
      ||(ts.isJsxAttribute(parent)&&/^(className|class|id|key|href|to|type|name|htmlFor|role|data-.*)$/.test(parent.name.getText()));
  };
  const visit=(node:ts.Node)=>{
    let text:string|undefined;
    if(ts.isJsxText(node)) text=node.text;
    else if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&!notShown(node)) text=node.text;
    else if(ts.isTemplateExpression(node)) text=[node.head.text,...node.templateSpans.map(span=>span.literal.text)].join('…');
    // Never shown: a code word or key (start, races-home, msf:session), a path (/api/day, lead/events/…/results) or SQL.
    const trimmed=text?.trim()??'',codeLike=!trimmed.includes(' ')&&(/[/:…]/.test(trimmed)||!/[A-Z]/.test(trimmed));
    const shown=text!==undefined&&!codeLike&&!trimmed.startsWith('/')&&!/\b(SELECT|INSERT|UPDATE|DELETE) /.test(trimmed);
    if(shown) found.push({text:trimmed,line:source.getLineAndCharacterOfPosition(node.getStart()).line+1});
    ts.forEachChild(node,visit);
  };
  visit(source);
  return found;
}
const files=['src/client','src/shared'].flatMap(root=>readdirSync(root,{recursive:true,encoding:'utf8'}).filter(file=>/\.tsx?$/.test(file)).map(file=>`${root}/${file}`));

test('the glossary lists words to avoid, and none of them is a term of its own',()=>{
  expect(avoided.length).toBeGreaterThan(100);
  expect(avoided).toContain('Sign out');
  expect(avoided).not.toContain("Didn't run");
});
test('no screen shows a word the glossary says to avoid',()=>{
  const leftovers=files.flatMap(file=>shownText(file).flatMap(({text,line})=>words(text)
    .filter(word=>!isAllowed(word,file))
    .map(word=>`${file}:${line} "${word}" in ${JSON.stringify(text.trim().slice(0,80))}`)));
  expect(leftovers).toEqual([]);
});
test('every allowed word is still shown where it is allowed, so the list never outlives its reason',()=>{
  for(const allow of allowed) expect(files.filter(file=>file.startsWith(allow.in??'')).some(file=>shownText(file).some(({text})=>words(text).includes(allow.word))),`${allow.word} in ${allow.in??'any file'}`).toBe(true);
});
