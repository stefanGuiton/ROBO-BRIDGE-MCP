'use strict';
import { cloneValue } from './errors.js';

export const MISSION_EVENT_TYPES = Object.freeze(['SCOUT','DESIGN','COMPILE','FREEZE','BUILD','TEST','RECOVER','PASS','RESET']);
const text = (value,max=180) => {
  const result = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g,' ').replace(/\s+/g,' ').trim();
  return result.length <= max ? result : `${result.slice(0,max-1)}…`;
};

export class MissionEventAdapter {
  constructor({ sink=()=>{}, now=()=>new Date(), maximumEntries=100 } = {}) {
    this.sink = sink; this.now = now; this.sequence = 0;
    this.maximumEntries = Math.max(1,Math.min(1000,Number(maximumEntries)||100));
    this.entries = [];
  }
  get nextSequence() { return this.sequence + 1; }
  emit({ missionId,phase,type,actor='system',planId=null,designChecksum=null,summary='' } = {}) {
    const date = this.now();
    const event = Object.freeze({
      timestamp:(date instanceof Date ? date : new Date(date)).toISOString(),
      sequence:++this.sequence, missionId:missionId ?? null, phase:phase ?? null,
      type:MISSION_EVENT_TYPES.includes(type) ? type : 'RECOVER', actor:text(actor,32)||'system',
      planId:planId ?? null, designChecksum:designChecksum ?? null, summary:text(summary)
    });
    this.entries.push(event);
    if (this.entries.length > this.maximumEntries) this.entries.splice(0,this.entries.length-this.maximumEntries);
    try { this.sink(cloneValue(event)); } catch {}
    return cloneValue(event);
  }
  clear() { this.entries.length = 0; }
  page({ cursor=0,limit=10 } = {}) {
    const start = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    const size = Number.isSafeInteger(limit) ? Math.max(1,Math.min(20,limit)) : 10;
    const source = [...this.entries].reverse();
    const events = source.slice(start,start+size).map(cloneValue);
    return { cursor:start,limit:size,returnedCount:events.length,totalAvailable:source.length,
      nextCursor:start+events.length < source.length ? start+events.length : null,events };
  }
}

export const createMissionEventAdapter = (options={}) => new MissionEventAdapter(options);
