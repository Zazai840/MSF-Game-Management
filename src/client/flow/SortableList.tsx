import { useState,type ReactNode } from 'react';
import { closestCenter,DndContext,KeyboardSensor,PointerSensor,useSensor,useSensors,type Announcements,type DragEndEvent,type Modifier,type UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove,SortableContext,sortableKeyboardCoordinates,useSortable,verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ordinal } from '../../shared/ordinal.js';
import './flow.css';
/** Rows only ever move up and down. */
const upAndDown:Modifier=({transform})=>({...transform,x:0});
/**
 * A list put in order by dragging, with touch, mouse or keyboard (Space, arrows, Space).
 * Each row has a grip handle on the right and dragging starts only from it, so scrolling
 * the page never moves a row. The dragged row lifts, `renderItem` gets each row's place
 * as it will be if dropped now (so place labels update live), and the page scrolls by
 * itself when dragging near the top or bottom edge. `onReorder` gets the new order on drop;
 * `isAllowed` can refuse an order, which then springs back.
 */
export function SortableList<T>({label,items,itemKey,itemName,renderItem,onReorder,isAllowed,disabled=false}:{
  /** The list's accessible name, for example "Finishing order". */
  label:string;
  items:readonly T[];
  itemKey:(item:T)=>string|number;
  /** How a row is named to people, for example the wristband: the handle reads "Drag to move 2003". */
  itemName:(item:T)=>string;
  /** A row's content, left of its handle. `place` is 1-based and follows the drag live. */
  renderItem:(item:T,place:number)=>ReactNode;
  onReorder:(next:T[])=>void;
  isAllowed?:(next:T[])=>boolean;
  disabled?:boolean;
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
  function end(event:DragEndEvent) {
    setActive(null);setOver(null);
    const start=ids.indexOf(String(event.active.id)),finish=event.over?ids.indexOf(String(event.over.id)):-1;
    if(start<0 || finish<0 || start===finish) return;
    const next=arrayMove([...items],start,finish);
    if(!isAllowed || isAllowed(next)) onReorder(next);
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[upAndDown]} accessibility={{announcements}}
    onDragStart={event=>{setActive(event.active.id);setOver(event.active.id);}} onDragOver={event=>setOver(event.over?.id??null)}
    onDragEnd={end} onDragCancel={()=>{setActive(null);setOver(null);}}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
      <ol className="sortable-list" aria-label={label}>
        {items.map((item,index)=><Row key={ids[index]} id={ids[index]} name={itemName(item)}>{renderItem(item,projected.indexOf(ids[index])+1)}</Row>)}
      </ol>
    </SortableContext>
  </DndContext>;
}
function Row({id,name,children}:{id:string;name:string;children:ReactNode}) {
  const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id});
  const move=CSS.Translate.toString(transform);
  return <li ref={setNodeRef} className="sortable-row" data-dragging={isDragging?'true':undefined} style={{transform:isDragging?`${move||''} scale(1.02)`:move,transition}}>
    {children}
    <button type="button" ref={setActivatorNodeRef} className="sortable-handle" {...attributes} {...listeners} aria-label={`Drag to move ${name}`} aria-roledescription="drag handle">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>
    </button>
  </li>;
}
