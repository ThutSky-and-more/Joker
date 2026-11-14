/**
 * JOKER Kemmental API. Authentifizierung ausschliesslich über Netlify Identity.
 * Rollencheck ausschliesslich serverseitig: app_metadata.roles enthält "admin".
 * Der Supabase service_role Key wird NIEMALS an den Browser übertragen.
 */
import { getUser } from '@netlify/identity';
import { createClient } from '@supabase/supabase-js';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Cookie'
  }
});
const fail = (message, status = 400) => json({ error: message }, status);
const requireField = (value, field, min, max) => {
  const result = String(value ?? '').trim();
  if (result.length < min || result.length > max) throw new ApiError(`${field} muss zwischen ${min} und ${max} Zeichen enthalten.`);
  return result;
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => {
  if (!datePattern.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class ApiError extends Error { constructor(message, status=400) { super(message); this.status=status; }}
const assert = (ok, message, status=400) => { if (!ok) throw new ApiError(message,status); };
const getClient = () => {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Nur Variablennamen protokollieren, niemals ihre Werte oder Zugangsschlüssel.
    console.error('JOKER Netlify Functions: fehlende Environment Variables', {
      SUPABASE_URL: !url,
      SUPABASE_SERVICE_ROLE_KEY: !key
    });
    throw new ApiError('Die Datenbankverbindung ist vorübergehend nicht verfügbar.',503);
  }
  return createClient(url,key, { auth: { persistSession: false, autoRefreshToken: false }});
};
const query = async (result) => {
  const { data, error } = await result;
  if (error) {
    // Nur technische Fehlercodes protokollieren. Keine Schlüssel oder personenbezogenen Daten.
    console.error('JOKER DB error:', {code:error.code,status:error.status, message:error.message});
    if (error.status === 401 || /invalid api key|invalid jwt|invalid authentication|jwt expired|no api key/i.test(error.message || '')) {
      throw new ApiError('Die Datenbank-Zugangsdaten sind ungültig. Bitte den Schlüssel des JOKER-Projekts prüfen. (DB-AUTH)',503);
    }
    if (error.status === 403 || error.code === '42501') {
      throw new ApiError('Die Datenbank verweigert den Zugriff. Bitte die Berechtigungen prüfen. (DB-ACCESS)',503);
    }
    throw new ApiError('Die Datenbankanfrage ist fehlgeschlagen. Technische Details stehen in den Netlify-Functions-Logs. (DB-QUERY)',500);
  }
  return data;
};
const todayZurich = () => {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const item=t=>parts.find(p=>p.type===t)?.value;
  return `${item('year')}-${item('month')}-${item('day')}`;
};
const previousDay=(day)=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);};
const isOpen=(event)=>Boolean(event?.is_published && event?.registration_open && event.event_date>=todayZurich() && (event.registration_deadline||previousDay(event.event_date))>=todayZurich());
const uid = x => { assert(uuidPattern.test(String(x ?? '')), 'Ungültige Kennung.');return String(x); };
const adminRole = u => Boolean(u && Array.isArray(u.roles) && u.roles.includes('admin'));
const checkWriteOrigin=req=>{
  const origin=req.headers.get('origin');
  // Browserseitige Schreibaktionen dürfen nur von unserer eigenen Website kommen.
  assert(origin && origin===new URL(req.url).origin, 'Ungültiger Anfrageursprung.',403);
};
const getProfile = async (db, u) => {
  const existing=await query(db.from('profiles').select('*').eq('id',u.id).maybeSingle());
  if(existing){
    if(existing.email !== u.email) return await query(db.from('profiles').update({email:u.email}).eq('id',u.id).select().single());
    return existing;
  }
  const metadata=u.userMetadata||{};
  return await query(db.from('profiles').insert({id:u.id, email:u.email,full_name:String(metadata.full_name||u.name||'').slice(0,120),phone:String(metadata.phone||'').slice(0,40)}).select().single());
};
const publicData=async(db)=>{
  const [events,photos]=await Promise.all([
    query(db.from('events').select('*').eq('is_published',true).gte('event_date',todayZurich()).order('event_date')),
    query(db.from('gallery_photos').select('id,file_path,caption,created_at').order('created_at',{ascending:false}).limit(40))
  ]);
  return {events, gallery:photos.map(p=>({...p,url:db.storage.from('joker-gallery').getPublicUrl(p.file_path).data.publicUrl}))};
};
const dashboard=async(db,u)=>{
  const isAdmin=adminRole(u);
  const profile=await getProfile(db,u);
  const [events,photos,children]=await Promise.all([
    query(isAdmin?db.from('events').select('*').order('event_date'):db.from('events').select('*').eq('is_published',true).gte('event_date',todayZurich()).order('event_date')),
    query(db.from('gallery_photos').select('id,file_path,caption,created_at').order('created_at',{ascending:false}).limit(80)),
    query(db.from('children').select('*').eq('parent_id',u.id).order('name')),
  ]);
  let registrations=[];
  if(isAdmin){
    // Leiter sehen ausschliesslich die Daten von Kindern mit einer tatsächlichen Termin-Anmeldung.
    const regs=await query(db.from('registrations').select('id,event_id,child_id,created_at').order('created_at',{ascending:true}));
    const childIds=[...new Set(regs.map(r=>r.child_id))];
    const relatedChildren=childIds.length?await query(db.from('children').select('id,name,age,parent_id').in('id',childIds)):[];
    const parents=[...new Set(relatedChildren.map(c=>c.parent_id))];
    const relatedProfiles=parents.length?await query(db.from('profiles').select('id,email,full_name,phone,alternate_contact_name,alternate_contact_phone').in('id',parents)):[];
    const cMap=new Map(relatedChildren.map(c=>[c.id,c]));const pMap=new Map(relatedProfiles.map(p=>[p.id,p]));
    registrations=regs.map(r=>({...r,child:cMap.has(r.child_id)?{...cMap.get(r.child_id),parent:pMap.get(cMap.get(r.child_id).parent_id)||null}:null}));
  }else if(children.length){
    registrations=await query(db.from('registrations').select('id,event_id,child_id,created_at').in('child_id',children.map(c=>c.id)));
  }
  return {user:{id:u.id,email:u.email,roles:isAdmin?['admin']:[]},profile:{...profile,role:isAdmin?'admin':'parent'}, events,children,registrations,gallery:photos.map(p=>({...p,url:db.storage.from('joker-gallery').getPublicUrl(p.file_path).data.publicUrl}))};
};
const action=async(db,u,body)=>{
  assert(u,'Bitte zuerst anmelden.',401);
  const isAdmin=adminRole(u), operation=body.action;
  const parentId=u.id;
  if(operation==='profile.save'){
    const payload={
      full_name:requireField(body.full_name,'Name',2,120),
      phone:requireField(body.phone,'Telefonnummer',6,40),
      alternate_contact_name:String(body.alternate_contact_name||'').trim().slice(0,120),
      alternate_contact_phone:String(body.alternate_contact_phone||'').trim().slice(0,40),
    };
    await getProfile(db,u);
    await query(db.from('profiles').update(payload).eq('id',parentId));
    return {ok:true};
  }
  if(operation==='child.save'){
    const age=Number(body.age);
    assert(Number.isInteger(age)&&age>=4&&age<=18,'Alter muss zwischen 4 und 18 liegen.');
    const payload={name:requireField(body.name,'Kindesname',2,120), age,photo_consent:body.photo_consent===true};
    await getProfile(db,u);
    if(body.id){
      await query(db.from('children').update(payload).eq('id',uid(body.id)).eq('parent_id',parentId).select('id').single());
    }else await query(db.from('children').insert({...payload,parent_id:parentId}));
    return {ok:true};
  }
  if(operation==='child.delete'){
    await query(db.from('children').delete().eq('id',uid(body.id)).eq('parent_id',parentId));
    return {ok:true};
  }
  if(operation==='registration.set'){
    const eid=uid(body.event_id);
    assert(Array.isArray(body.child_ids)&&body.child_ids.length<=30,'Ungültige Kinderauswahl.');
    const wanted=[...new Set(body.child_ids.map(uid))];
    const event=await query(db.from('events').select('*').eq('id',eid).single());
    assert(isOpen(event),'Die Anmeldefrist für diesen Termin ist abgelaufen.',409);
    const profile=await getProfile(db,u);
    assert(profile.full_name?.trim() && profile.phone?.trim(),'Bitte zuerst Name und Telefonnummer im Profil ergänzen.');
    const owned=await query(db.from('children').select('id').eq('parent_id',parentId));
    const ownedSet=new Set(owned.map(c=>c.id));
    assert(wanted.every(id=>ownedSet.has(id)),'Du kannst nur deine eigenen Kinder anmelden.',403);
    const current=await query(db.from('registrations').select('id,child_id').eq('event_id',eid).in('child_id',owned.map(c=>c.id).length?owned.map(c=>c.id):['00000000-0000-0000-0000-000000000000']));
    const currentSet=new Set(current.map(r=>r.child_id));
    const remove=current.filter(r=>!wanted.includes(r.child_id)).map(r=>r.id);
    const add=wanted.filter(id=>!currentSet.has(id)).map(child_id=>({event_id:eid,child_id}));
    if(add.length) await query(db.from('registrations').upsert(add,{onConflict:'event_id,child_id',ignoreDuplicates:true}));
    if(remove.length) await query(db.from('registrations').delete().in('id',remove));
    return {ok:true};
  }
  // Leiteraktionen werden serverseitig anhand der Identity-Rolle autorisiert.
  assert(isAdmin,'Für diese Funktion brauchst du den Netlify-Identity-Tag admin.',403);
  if(operation==='leader.child.add'){
    const email=requireField(body.parent_email,'E-Mail der Eltern',3,254).toLowerCase();
    assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),'Ungültige E-Mail-Adresse.');
    const age=Number(body.age);
    assert(Number.isInteger(age) && age>=4 && age<=18,'Alter muss zwischen 4 und 18 liegen.');
    const name=requireField(body.name,'Kindesname',2,120);
    const parent=await query(db.from('profiles').select('id,email').ilike('email',email).maybeSingle());
    assert(parent,'Kein registriertes Elternkonto mit dieser E-Mail gefunden. Das Elternteil muss zuerst ein Konto erstellen.',404);
    const eventId=body.event_id?uid(body.event_id):null;
    if(eventId){
      const event=await query(db.from('events').select('id').eq('id',eventId).maybeSingle());
      assert(event,'Der gewählte Termin wurde nicht gefunden.',404);
    }
    const child=await query(db.from('children').insert({
      parent_id:parent.id,name,age,photo_consent:body.photo_consent===true
    }).select('id').single());
    if(eventId) await query(db.from('registrations').insert({event_id:eventId,child_id:child.id}));
    return {ok:true,child_id:child.id};
  }
  if(operation==='event.save'){
    assert(validDate(body.event_date),'Ungültiges Datum.');
    assert(timePattern.test(String(body.start_time||'').slice(0,5)),'Ungültige Startzeit.');
    const end=body.end_time?String(body.end_time).slice(0,5):null;
    assert(!end||timePattern.test(end),'Ungültige Endzeit.');
    assert(!end||end>String(body.start_time).slice(0,5),'Das Ende muss nach Beginn liegen.');
    assert(!body.registration_deadline || (validDate(body.registration_deadline)&&body.registration_deadline<=body.event_date),'Ungültiger Anmeldeschluss.');
    const payload={
      title:requireField(body.title,'Titel',2,160),description:requireField(body.description,'Beschreibung',2,3000),
      event_date:body.event_date,start_time:String(body.start_time).slice(0,5),end_time:end,
      location:requireField(body.location||'JuHu Hugelshofen','Ort',2,150),
      registration_open:body.registration_open===true,
      is_published:body.is_published===true,
      registration_deadline:body.registration_deadline||null,
    };
    if(body.id) await query(db.from('events').update(payload).eq('id',uid(body.id)).select('id').single());
    else await query(db.from('events').insert({...payload,created_by:parentId}));
    return {ok:true};
  }
  if(operation==='event.delete'){
    await query(db.from('events').delete().eq('id',uid(body.id)));
    return {ok:true};
  }
  if(operation==='photo.add'){
    const mime=String(body.content_type||'');
    assert(['image/jpeg','image/png','image/webp'].includes(mime),'Nur JPG, PNG oder WebP sind erlaubt.');
    const caption=requireField(body.caption,'Bildbeschreibung',2,150);
    assert(typeof body.data==='string' && body.data.length<3_600_000,'Das Foto darf höchstens 2.5 MB gross sein.');
    const binary=Buffer.from(body.data,'base64');
    assert(binary.length>100 && binary.length<=2_500_000,'Das Foto darf höchstens 2.5 MB gross sein.');
    // Datei-Signatur zusätzlich zum vom Browser übermittelten MIME-Typ prüfen.
    const jpg=binary[0]===0xff&&binary[1]===0xd8&&binary[2]===0xff;
    const png=binary.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=binary.toString('ascii',0,4)==='RIFF'&&binary.toString('ascii',8,12)==='WEBP';
    assert((mime==='image/jpeg'&&jpg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp),'Die hochgeladene Datei ist kein gültiges Bild.');
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const path=`${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await db.storage.from('joker-gallery').upload(path,binary,{contentType:mime,cacheControl:'3600',upsert:false});
    if(uploadError)throw new ApiError('Foto konnte nicht hochgeladen werden.',500);
    try { await query(db.from('gallery_photos').insert({file_path:path,caption,created_by:parentId})); }
    catch(e){await db.storage.from('joker-gallery').remove([path]);throw e;}
    return {ok:true};
  }
  if(operation==='photo.delete'){
    const photo=await query(db.from('gallery_photos').select('file_path').eq('id',uid(body.id)).single());
    await query(db.from('gallery_photos').delete().eq('id',body.id));
    await db.storage.from('joker-gallery').remove([photo.file_path]);
    return {ok:true};
  }
  throw new ApiError('Unbekannte Aktion.',404);
};
export default async function handler(req){
  try{
    const db=getClient();
    if(req.method==='GET'){
      if(new URL(req.url).searchParams.get('view')==='public')return json(await publicData(db));
      const u=await getUser();
      assert(u,'Bitte zuerst anmelden.',401);
      return json(await dashboard(db,u));
    }
    if(req.method!=='POST')return fail('Methode nicht erlaubt.',405);
    checkWriteOrigin(req);
    const u=await getUser();
    let body;
    try {body=await req.json();} catch { throw new ApiError('Ungültige Anfrage.'); }
    return json(await action(db,u,body));
  }catch(err){
    if(err instanceof ApiError)return fail(err.message,err.status);
    console.error('JOKER API unexpected error:',err);
    return fail('Es gab einen technischen Fehler. Bitte später erneut versuchen.',500);
  }
}
