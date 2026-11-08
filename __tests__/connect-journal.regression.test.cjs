const test=require('node:test'),assert=require('node:assert/strict');
const {journalOutcome,journalDuration,journalLabel,journalPreview,journalDay}=require('../features/connect/journal/journal-presentation.ts');
const {readJournalEntry,mergeJournalEntry,compareJournalEntries}=require('../features/connect/journal/journal-integrity.ts');
const {mergeJournalTimeline,journalMessageIndex,journalPreviewWins}=require('../features/connect/journal/journal-timeline.ts');
const {JournalStore}=require('../features/connect/journal/journal-store.ts');
const {entry,id,deferred}=require('./fixtures/connect-journal-fixture.cjs');
test('canonical IDs, participants, timestamps and direction are validated; privileged extras are discarded',()=>{
 const e=entry();e.call.provider_session_id='private-provider';e.token='secret-never-cached';const row=readJournalEntry(e,id(1),id(3));
 assert.equal(row.call.id,e.call.id);assert.equal(row.token,undefined);assert.equal(row.call.provider_session_id,undefined);
 for(const alter of [e=>{e.call.id='made-up';},e=>{e.direction='incoming';},e=>{e.peer.profileId=id(7);},e=>{e.call.caller_profile_id=id(8);},e=>{e.call.connected_at='yesterday';},e=>{e.call.ended_at='2020-01-01';}]){const bad=entry();alter(bad);assert.throws(()=>readJournalEntry(bad,id(1),id(3)));}
});
test('each canonical lifecycle state has an honest outcome, including no-answer and interruption',()=>{
 for(const [state,outcome] of Object.entries({REQUESTED:'initiated',RINGING:'ringing',ACCEPTED:'answered',CONNECTING:'answered',ACTIVE:'active',RECONNECTING:'reconnecting',ENDING:'ending',ENDED:'ended',DECLINED:'declined',CANCELLED:'cancelled',BUSY:'busy',FAILED:'interrupted',MISSED:'no_answer'}))assert.equal(journalOutcome(entry(1,{state})),outcome);
 const incoming=entry(1,{state:'MISSED',connected_at:null});incoming.direction='incoming';assert.equal(journalOutcome(incoming),'missed');
 assert.equal(journalOutcome(entry(1,{state:'FAILED',connected_at:null})),'failed');assert.equal(journalOutcome(entry(1,{reason:'blocked'})),'blocked');
 assert.equal(journalOutcome(entry(1,{reason:'eligibility_revoked'})),'interrupted');
});
test('unanswered calls have no duration; a truly connected zero-second call does',()=>{
 assert.equal(journalDuration(entry(1,{connected_at:null,duration_seconds:0})),null);
 assert.equal(journalDuration(entry(1,{ended_at:'2026-11-05T10:00:04.000Z',duration_seconds:999})),0);
 assert.equal(journalDuration(entry()),744);assert.equal(journalPreview(entry()),'Voice call · 12m 24s');
 assert.match(journalLabel(entry(1,{connected_at:null})),/before connecting/);
});
test('duplicate and reordered updates cannot regress terminal state, identity or chronology',()=>{
 const ended=entry();assert.equal(mergeJournalEntry(ended,entry(1,{state:'ACTIVE',version:4})),ended);
 assert.equal(mergeJournalEntry(ended,entry(1,{state:'ACTIVE',version:6})),ended);
 assert.equal(mergeJournalEntry(ended,entry(1,{state:'FAILED',version:6})),ended);
 assert.throws(()=>mergeJournalEntry(ended,entry(2)),/identity_drift/);
 const updated={...ended,cleanup:'pending'};assert.equal(mergeJournalEntry(ended,updated).cleanup,'pending');
 const rows=[entry(1,{created_at:'2026-11-05T10:00:00.000001Z'}),entry(2,{created_at:'2026-11-05T10:00:00.000002Z'})].sort(compareJournalEntries);assert.equal(rows[0].call.id,id(102));
});
test('typed call cards interleave deterministically and never enter message receipt candidates',()=>{
 const messages=[{id:'m1',timestamp:new Date('2026-11-05T09:00Z')},{id:'m2',timestamp:new Date('2026-11-05T11:00Z')}],e=entry();
 const rows=mergeJournalTimeline(messages,[e,e]);assert.deepEqual(rows.map(r=>r.kind),['message','call','message']);assert.equal(journalMessageIndex(rows,1),2);
 assert.deepEqual(rows.filter(r=>r.kind==='message').map(r=>r.message),messages);
 assert.equal(mergeJournalTimeline(messages,[entry(3,{created_at:'2026-11-04T10:00Z'})],true).length,2);
 assert.deepEqual(mergeJournalTimeline(messages,[e]).map(r=>r.key),mergeJournalTimeline(messages,[{...e,cleanup:'pending'}]).map(r=>r.key));
 assert.equal(journalPreviewWins(e,new Date('2026-11-05T09:00Z')),true);assert.equal(journalPreviewWins(e,messages[1].timestamp),false);
 const micro=[entry(3,{created_at:'2026-11-05T10:00:00.000001Z'}),entry(2,{created_at:'2026-11-05T10:00:00.000002Z'})];
 assert.deepEqual(mergeJournalTimeline([],micro.reverse()).map(r=>r.entry.call.id),[id(103),id(102)]);
});
test('grouping uses local calendar boundaries including DST and year changes',()=>{
 const now=new Date(2026,0,1,12);assert.equal(journalDay(new Date(2026,0,1,1).toISOString(),now),'Today');assert.equal(journalDay(new Date(2025,11,31,12).toISOString(),now),'Yesterday');
 assert.notEqual(journalDay(new Date(2025,11,30,12).toISOString(),now),'Yesterday');
});
test('feed fences stale requests, deduplicates pages, and reconciles an old call in place',async()=>{
 const requests=[],service={userId:id(3),profileId:id(1),epoch:'one',current:()=>true,page:async q=>{const d=deferred();requests.push({q,d});return d.promise;}};
 const store=new JournalStore(service),feed=store.feed({});const older=feed.refresh(),newer=feed.refresh();
 requests[1].d.resolve({items:[entry()],nextCursor:null});await newer;requests[0].d.resolve({items:[entry(3)],nextCursor:null});await older;
 assert.equal(feed.snapshot().rows.length,1);assert.equal(feed.snapshot().rows[0].call.id,id(101));
 const again=feed.refresh();requests[2].d.resolve({items:[entry()],nextCursor:null});await again;assert.equal(feed.snapshot().rows.length,1);store.retire();assert.equal(feed.snapshot().rows.length,0);
});
test('account retirement fences late pages and offline data stays within its owner',async()=>{
 const gate=deferred();let current=true;const store=new JournalStore({userId:id(3),profileId:id(1),epoch:'one',current:()=>current,page:()=>gate.promise});
 const feed=store.feed({}),pending=feed.refresh();current=false;store.retire();gate.resolve({items:[entry()],nextCursor:null});await pending;
 assert.equal(feed.snapshot().rows.length,0);assert.equal(store.get(id(101)),undefined);feed.dispose();
});
test('a deleted transport hint cannot remove history without a canonical participant read',async()=>{
 let visible=true;const store=new JournalStore({userId:id(3),profileId:id(1),epoch:'one',current:()=>true,page:async()=>({items:visible?[entry()]:[],nextCursor:null})});
 store.merge([entry()]);let finish;const stop=store.subscribe(()=>finish());
 const notify=()=>new Promise(resolve=>{finish=resolve;store.invalidate({callId:id(101),version:6,deleted:true});});
 await notify();assert.equal(store.get(id(101)).call.id,id(101));
 visible=false;await notify();assert.equal(store.get(id(101)),undefined);stop();store.retire();
});
test('chat reconciliation removes older loaded pages after a personal deletion cutoff',async()=>{
 let rows=[entry()];const store=new JournalStore({userId:id(3),profileId:id(1),epoch:'one',current:()=>true,page:async()=>({items:rows,nextCursor:null})});
 const feed=store.feed({scope:'chat',peerUserId:id(4)});await feed.refresh();assert.equal(feed.snapshot().rows.length,1);
 const newer=entry(2,{created_at:'2026-11-05T11:00:00Z',connected_at:null,accepted_at:null,ended_at:'2026-11-05T11:01:00Z'});
 newer.peer.chatHiddenBefore='2026-11-05T10:30:00Z';rows=[newer];await feed.reconcile();assert.deepEqual(feed.snapshot().rows.map(e=>e.call.id),[newer.call.id]);store.retire();
});
