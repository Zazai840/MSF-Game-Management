import { useState,type KeyboardEvent,type ReactNode } from 'react';
import { closestCenter,DndContext,KeyboardSensor,PointerSensor,useSensor,useSensors,type Announcements,type DragEndEvent,type Modifier,type UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove,horizontalListSortingStrategy,SortableContext,sortableKeyboardCoordinates,useSortable,verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ordinal } from '../../shared/ordinal.js';
/** Rows only ever move up and down (or, `across`, left and right). */
const upAndDown:Modifier=({transform})=>({...transform,x:0});
const sideways:Modifier=({transform})=>({...transform,y:0});
/**
 * A list put in order by dragging, with touch, mouse or keyboard (Space, arrows, Space).
 * Each row has a grip handle on the right and dragging starts only from it, so scrolling
 * the page never moves a row. The dragged row lifts, `renderItem` gets each row's place
 * as it will be if dropped now (so place labels update live), and the page scrolls by
 * itself when dragging near the top or bottom edge. `onReorder` gets the new order on drop;
 * `isAllowed` can refuse an order, which then springs back. `look` gives the screen's classes (a row's can follow
 * its item), handle icon and handle name (the race flow's order rows: "Move 2033"); the arrow keys on a handle
 * also move its row at once. `across` lays the rows side by side (a relay team's leg chips): they move left and right,
 * and so do the arrow keys.
 */
export function SortableList<T>({label,items,itemKey,itemName,renderItem,onReorder,isAllowed,disabled=false,across=false,look}:{
  /** The list's accessible name, for example "Finishing order". */
  label:string;
  items:readonly T[];
  itemKey:(item:T)=>string|number;
  /** How a row is named to people, for example the wristband: the handle reads "Move 2003" (`look.handleName`). */
  itemName:(item:T)=>string;
  /** A row's content, left of its handle. `place` is 1-based and follows the drag live. */
  renderItem:(item:T,place:number)=>ReactNode;
  onReorder:(next:T[])=>void;
  isAllowed?:(next:T[])=>boolean;
  disabled?:boolean;
  across?:boolean;
  look:{list:string;row:string|((item:T)=>string);handle:string;icon:ReactNode;handleName:(name:string)=>string};
}) {
  const sensors=useSensors(useSensor(PointerSensor),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const [active,setActive]=useState<UniqueIdentifier|null>(null);
  const [over,setOver]=useState<UniqueIdentifier|null>(null);
  const ids=items.map(item=>String(itemKey(item)));
  const from=active===null?-1:ids.indexOf(String(active));
  const to=over===null?-1:ids.indexOf(String(over));
  const projected=from>=0 && to>=0?arrayMove(ids,from,to):ids;
  const nameOf=(id:UniqueIdentifier)=>{const index=ids.indexOf(String(id));return index>=0?itemName(items[index]):String(id);};
  const placeOf=(id:UniqueIdentifier|undefined)=>id===undefined?'':ordinal(ids.indexOf(String(id))+1);
  const announcements:Announcements={
    onDragStart:({active})=>`Picked up ${nameOf(active.id)}, ${placeOf(active.id)}.`,
    onDragOver:({active,over})=>over?`${nameOf(active.id)} would be ${placeOf(over.id)}.`:`${nameOf(active.id)} is not over a place.`,
    onDragEnd:({active,over})=>over?`${nameOf(active.id)} dropped, now ${placeOf(over.id)}.`:`${nameOf(active.id)} dropped.`,
    onDragCancel:({active})=>`Moving ${nameOf(active.id)} cancelled.`,
  };
  /** Arrow keys on a handle: the row moves one place at once, no pick-up needed. */
  function step(index:number,by:number) {
    const to=index+by;
    if(to<0 || to>=items.length) return;
    const next=arrayMove([...items],index,to);
    if(!isAllowed || isAllowed(next)) onReorder(next);
  }
  function end(event:DragEndEvent) {
    setActive(null);setOver(null);
    const start=ids.indexOf(String(event.active.id)),finish=event.over?ids.indexOf(String(event.over.id)):-1;
    if(start<0 || finish<0 || start===finish) return;
    const next=arrayMove([...items],start,finish);
    if(!isAllowed || isAllowed(next)) onReorder(next);
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[across?sideways:upAndDown]} accessibility={{announcements}}
    onDragStart={event=>{setActive(event.active.id);setOver(event.active.id);}} onDragOver={event=>setOver(event.over?.id??null)}
    onDragEnd={end} onDragCancel={()=>{setActive(null);setOver(null);}}>
    <SortableContext items={ids} strategy={across?horizontalListSortingStrategy:verticalListSortingStrategy} disabled={disabled}>
      <ol className={look.list} aria-label={label}>
        {items.map((item,index)=><Row key={ids[index]} id={ids[index]} name={itemName(item)} look={look} className={typeof look.row==='function'?look.row(item):look.row} onStep={by=>step(index,by)} across={across}>{renderItem(item,projected.indexOf(ids[index])+1)}</Row>)}
      </ol>
    </SortableContext>
  </DndContext>;
}
function Row({id,name,look,className,onStep,across,children}:{id:string;name:string;look:{handle:string;icon:ReactNode;handleName:(name:string)=>string};className:string;onStep:(by:number)=>void;across:boolean;children:ReactNode}) {
  const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id});
  const move=CSS.Translate.toString(transform);
  const keyDown=(event:KeyboardEvent<HTMLButtonElement>)=>{
    const [back,on]=across?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
    if(!isDragging && (event.key===back || event.key===on)) {event.preventDefault();onStep(event.key===back?-1:1);return;}
    listeners?.onKeyDown?.(event);
  };
  return <li ref={setNodeRef} className={className} data-dragging={isDragging?'true':undefined} style={{transform:isDragging?`${move||''} scale(1.02)`:move,transition}}>
    {children}
    <button type="button" ref={setActivatorNodeRef} className={look.handle} {...attributes} {...listeners} onKeyDown={keyDown} aria-label={look.handleName(name)} aria-roledescription="drag handle">
      {look.icon}
    </button>
  </li>;
}
