import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Test der API-Guards mit lokalen Mocks. Echte Identity- und DB-Integration
// müssen zusätzlich auf einer Netlify-Deploy-URL geprüft werden.
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-not-real';
const source=(await readFile(new URL('../netlify/functions/api.mjs', import.meta.url),'utf8'))
 .replace("import { getUser } from '@netlify/identity';","const getUser = async()=>globalThis.__testUser;")
 .replace("import { createClient } from '@supabase/supabase-js';","const createClient = ()=>globalThis.__testDb;");
const {default:handler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const req=(body,origin='https://joker-test.netlify.app')=>new Request('https://joker-test.netlify.app/api',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)
});

test('nicht angemeldete Person kann kein Datum erstellen',async()=>{
 globalThis.__testUser=null;globalThis.__testDb={};
 const result=await handler(req({action:'event.save', title:'Unberechtigt'}));
 assert.equal(result.status,401);
});

test('Eltern erhalten nie administrative Schreibrechte',async()=>{
 globalThis.__testUser={id:'parent123',email:'eltern@example.ch',roles:[]};globalThis.__testDb={};
 const result=await handler(req({action:'event.save',title:'Geheimer Anlass'}));
 assert.equal(result.status,403);
 const body=await result.json();assert.match(body.error,/admin/);
});

test('beliebig erweiterte userMetadata reichen nicht für die admin-Rolle',async()=>{
 globalThis.__testUser={id:'parent123',email:'eltern@example.ch',roles:[],userMetadata:{roles:['admin'],role:'admin'}};
 globalThis.__testDb={};
 const result=await handler(req({action:'event.delete',id:'11111111-1111-4111-8111-111111111111'}));
 assert.equal(result.status,403);
});

test('Anfragen mit fremdem Origin werden blockiert',async()=>{
 globalThis.__testUser={id:'admin123',email:'admin@example.ch',roles:['admin']};globalThis.__testDb={};
 const result=await handler(req({action:'event.delete',id:'11111111-1111-4111-8111-111111111111'},'https://evil.example'));
 assert.equal(result.status,403);
});

test('Admin-Tag erlaubt die verwaltende Aktion',async()=>{
 globalThis.__testUser={id:'admin123',email:'admin@example.ch',roles:['admin']};
 const updated=[];
 const handlerTable={
  delete(){return this;},eq(field,id){updated.push([field,id]);return this;},
  then(resolve){return resolve({data:null,error:null});}
 };
 globalThis.__testDb={from(name){assert.equal(name,'events');return handlerTable;}};
 const id='11111111-1111-4111-8111-111111111111';
 const result=await handler(req({action:'event.delete',id}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).ok,true);
 assert.deepEqual(updated,[['id',id]]);
});

const setupDb=()=>{
 const tables={
  profiles:[
   {id:'p1',email:'p1@example.ch',full_name:'Eltern Eins',phone:'079 123 45 67',alternate_contact_name:'Nora',alternate_contact_phone:'079 222 22 22'},
   {id:'p2',email:'p2@example.ch',full_name:'Eltern Zwei',phone:'079 987 65 43',alternate_contact_name:'',alternate_contact_phone:''},
   {id:'admin1',email:'admin@example.ch',full_name:'Leitung',phone:'079 000 00 00',alternate_contact_name:'',alternate_contact_phone:''},
   {id:'p3',email:'p3@example.ch',full_name:'Nicht angemeldet',phone:'079 777 77 77',alternate_contact_name:'',alternate_contact_phone:''}
  ],
  children:[
   {id:'11111111-1111-4111-8111-111111111111',parent_id:'p1',name:'Kind Eins',age:9},
   {id:'22222222-2222-4222-8222-222222222222',parent_id:'p2',name:'Kind Zwei',age:7},
   {id:'33333333-3333-4333-8333-333333333333',parent_id:'p3',name:'Nicht angemeldet',age:8}
  ],
  events:[
   {id:'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Termin',event_date:'2099-03-03',is_published:true,registration_open:true,registration_deadline:'2099-03-02'},
   {id:'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Entwurf',event_date:'2099-03-04',is_published:false,registration_open:true}
  ],
  registrations:[
   {id:'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb',event_id:'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',child_id:'11111111-1111-4111-8111-111111111111',created_at:'2026-11-14'},
   {id:'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbbb',event_id:'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',child_id:'22222222-2222-4222-8222-222222222222',created_at:'2026-11-14'}
  ],
  gallery_photos:[]
 };
 class Query{
  constructor(table){this.table=table;this.filters=[];this.op='read';this.payload=null;}
  select(){return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
  order(){return this;}
  limit(){return this;}
  insert(payload){this.op='insert';this.payload=payload;return this;}
  delete(){this.op='delete';return this;}
  upsert(payload){this.op='upsert';this.payload=payload;return this;}
  update(payload){this.op='update';this.payload=payload;return this;}
  onConflict(){return this;}
  where(){return tables[this.table].filter(x=>this.filters.every(f=>f(x)));}
  result(){
   const matches=this.where();
   if(this.op==='read')return {data:matches,error:null};
   if(this.op==='delete'){tables[this.table]=tables[this.table].filter(x=>!matches.includes(x));return {data:matches,error:null};}
   if(this.op==='insert'||this.op==='upsert'){
    const items=Array.isArray(this.payload)?this.payload:[this.payload];
    tables[this.table].push(...items);return {data:items,error:null};
   }
   if(this.op==='update'){Object.assign(matches[0]||{},this.payload);return {data:matches,error:null};}
  }
  single(){const result=this.result();return Promise.resolve({...result,data:result.data[0]||null});}
  maybeSingle(){const result=this.result();return Promise.resolve({...result,data:result.data[0]||null});}
  then(resolve){return resolve(this.result());}
 }
 globalThis.__testDb={
  from(name){assert.ok(name in tables);return new Query(name);},
  storage:{from(){return {getPublicUrl(path){return {data:{publicUrl:`https://example.supabase.co/${path}`}}}}}}
 };
 return tables;
};

test('Eltern sehen nur eigene Kinder und eigene Anmeldungen, nie unveröffentlichte Termine',async()=>{
 setupDb();globalThis.__testUser={id:'p1',email:'p1@example.ch',roles:[]};
 const result=await handler(new Request('https://joker-test.netlify.app/api?view=dashboard'));
 assert.equal(result.status,200);
 const data=await result.json();
 assert.deepEqual(data.children.map(c=>c.name),['Kind Eins']);
 assert.deepEqual(data.registrations.map(r=>r.child_id),['11111111-1111-4111-8111-111111111111']);
 assert.deepEqual(data.events.map(e=>e.title),['Termin']);
 assert.equal(data.profile.role,'parent');
 assert.equal(JSON.stringify(data).includes('p2@example.ch'),false);
});

test('Leitung sieht Kontakte ausschliesslich von angemeldeten Familien',async()=>{
 setupDb();globalThis.__testUser={id:'admin1',email:'admin@example.ch',roles:['admin']};
 const result=await handler(new Request('https://joker-test.netlify.app/api?view=dashboard'));
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.profile.role,'admin');
 assert.deepEqual(data.events.map(e=>e.title),['Termin','Entwurf']);
 assert.equal(data.registrations.length,2);
 assert.equal(data.registrations[0].child.parent.phone,'079 123 45 67');
 assert.equal(JSON.stringify(data).includes('p3@example.ch'),false);
});

test('Eltern können nicht das Kind einer anderen Familie anmelden',async()=>{
 setupDb();globalThis.__testUser={id:'p1',email:'p1@example.ch',roles:[]};
 const result=await handler(req({action:'registration.set',event_id:'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',child_ids:['22222222-2222-4222-8222-222222222222']}));
 assert.equal(result.status,403);
});
