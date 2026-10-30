import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
// Every pixel length in the race flow's CSS comes from the Running Zone design system: the tokens.json scale for what
// it sets, or the same rule in the system's own components/bundle.css, which rz.css copies.
const tokens=JSON.parse(readFileSync('docs/running-zone-design-system/tokens.json','utf8'));
const px=(values:string[])=>new Set(values.flatMap(value=>[...value.matchAll(/(-?[\d.]+)px/g)].map(([,n])=>Math.abs(Number(n)))));
const scale=(group:{tokens:Array<{value:string}>})=>px(group.tokens.map(token=>token.value));
function lengths(file:string) {
  const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const found:Array<{selector:string;property:string;value:number}>=[];
  for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) for(const declaration of body.split(';')) {
    const [property,...rest]=declaration.split(':'),name=property.trim();
    // A token's own definition (--space-16: 16px) is the scale, not a use of it.
    if(name.startsWith('--')) continue;
    for(const [,n] of rest.join(':').matchAll(/(-?[\d.]+)px/g)) found.push({selector:selector.trim().replace(/\s+/g,' '),property:name,value:Number(n)});
  }
  return found;
}
const bundle=lengths('docs/running-zone-design-system/components/bundle.css');
const spacing=scale(tokens.spacing);
const type=px(tokens.type.groups.flatMap((group:{styles:Array<{fontSize:string}>})=>group.styles.map(style=>style.fontSize)));
// Sizes: the size tokens and the icon sizes the system's components give an .rz-icon (24px grid, 18px small, ...).
const sizes=new Set([...scale(tokens.size),...bundle.filter(({selector,property})=>selector.includes('.rz-icon')&&/^(width|height)$/.test(property)).map(({value})=>value)]);
/** Lines the README sets in pixels: 1px borders, the 1.5px hairline, the 2px warning border, the 3px focus ring. */
const lines=new Set([1,1.5,2,3]);
/**
 * Which scale a property's lengths come from. Measures with no scale in the system (min-/max-width, grid tracks,
 * vertical-align, underline offsets) are not checked: the README fixes only the 390px phone and the 440px column.
 */
const scaleFor=(property:string)=>
  /^(margin|padding|gap|row-gap|column-gap|top|right|bottom|left|inset)(-|$)/.test(property)?spacing
  :property==='font-size'?type
  :/radius/.test(property)?scale(tokens.radius)
  :/^(border|outline)/.test(property)||property==='box-shadow'?new Set([...lines,...scale(tokens.shadow)])
  :/^(width|height|min-height|max-height)$/.test(property)?sizes
  :property==='transform'?new Set([1,4]) // a button presses down 1px, a runner tile 4px
  :undefined;
/** Lengths kept on purpose, each with why. */
const allowed:Array<{file:string;selector:string;property:string;value:number;reason:string}>=[
  {file:'src/client/races/race-flow.css',selector:'.rz-toast',property:'bottom',value:110,reason:'the toast clears the wide screen\'s shorter footer, a position not a gap'},
  {file:'src/client/races/race-flow.css',selector:'.rz-runners--compact .rz-runner',property:'height',value:48,reason:'12 runners fit above the footer on a 360x800 phone'},
  {file:'src/client/races/race-flow.css',selector:'.rz-runners--compact .rz-runner',property:'border-radius',value:24,reason:'the compact runner\'s arch, half its 48px height as the full one\'s 36px is of 72px'},
  {file:'src/client/races/race-flow.css',selector:'.rz-jobcard__icon',property:'width',value:48,reason:'Join\'s job cards sit under the form, smaller than the menu JobCard\'s 58px'},
  {file:'src/client/races/race-flow.css',selector:'.rz-jobcard__icon',property:'height',value:48,reason:'Join\'s job cards sit under the form, smaller than the menu JobCard\'s 58px'},
  {file:'src/client/races/race-flow.css',selector:'.rz-jobcard[aria-checked="true"], .rz-jobcard:has(input:checked)',property:'box-shadow',value:2.5,reason:'the chosen job card\'s ring, heavier than a hairline and lighter than focus'},
  {file:'src/client/races/race-flow.css',selector:'.rz-jobcard[aria-checked="true"] .rz-jobcard__mark, .rz-jobcard:has(input:checked) .rz-jobcard__mark',property:'box-shadow',value:7,reason:'the chosen radio mark\'s filled centre'},
  {file:'src/client/races/race-flow.css',selector:'.rz-prompt--compact .rz-prompt__q',property:'font-size',value:48,reason:'a wide screen\'s compact prompt, between the phone\'s 40px and the full 54px'},
];
const fromBundle=new Set(bundle.map(({selector,property,value})=>`${selector}|${property}|${value}`));
const files=readdirSync('src/client/races').filter(file=>file.endsWith('.css')).map(file=>`src/client/races/${file}`);

test('the scales come from tokens.json and the components',()=>{
  expect([...spacing]).toEqual([4,6,8,10,12,14,16,20,24,32]);
  expect([type.has(15),sizes.has(44),sizes.has(18),scaleFor('border-radius')!.has(999)]).toEqual([true,true,true,true]);
});
test('every pixel length in the race flow\'s CSS is on its design-system scale',()=>{
  const off=files.flatMap(file=>lengths(file).filter(({selector,property,value})=>value!==0&&scaleFor(property)?.has(Math.abs(value))===false
    &&!fromBundle.has(`${selector}|${property}|${value}`)
    &&!allowed.some(allow=>allow.file===file&&allow.selector===selector&&allow.property===property&&allow.value===value))
    .map(({selector,property,value})=>`${file} ${selector} { ${property}: ${value}px }`));
  expect(off).toEqual([]);
});
test('every allowed length is still in the CSS, so the list never outlives its reason',()=>{
  for(const allow of allowed) expect(lengths(allow.file).some(length=>length.selector===allow.selector&&length.property===allow.property&&length.value===allow.value),`${allow.selector} ${allow.property}`).toBe(true);
});
