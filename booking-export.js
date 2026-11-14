import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Kein Name, keine Telefonnummer und keine Email wird an Google gesendet.
export function googleCalendarUrl(event) {
  const stamp = (day, time) => day.replaceAll('-', '') + 'T' + String(time).slice(0, 5).replace(':', '') + '00';
  const details = [
    event.description || '',
    event.bring_wear?.trim() ? 'Kleidung & Mitnehmen: ' + event.bring_wear.trim() : ''
  ].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'JOKER · ' + event.title,
    dates: stamp(event.event_date, event.start_time || '14:00') + '/' + stamp(event.event_date, event.end_time || '17:00'),
    ctz: 'Europe/Zurich',
    details,
    location: event.location || 'JuHu Hugelshofen'
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

export async function downloadBookingPdf(event, children) {
  if (!children?.length) throw new Error('Keine angemeldeten Kinder vorhanden.');
  const pdf = await PDFDocument.create();
  pdf.setTitle('JOKER Kemmental - Terminübersicht');
  pdf.setAuthor('JOKER Kemmental');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(.063,.22,.195), mint=rgb(.90,.96,.91), yellow=rgb(.96,.76,.42);
  const gray=rgb(.34,.43,.40),white=rgb(1,1,1);
  const W=595.28,H=841.89,M=45,lineWidth=W-2*M;
  let page=pdf.addPage([W,H]),y=H-218;
  const clean=s=>String(s??'').replace(/[–—−]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'');
  const txt=(s,x,baseline,size=11,font=regular,color=green)=>page.drawText(clean(s),{x,y:baseline,size,font,color});
  const newPage=()=>{page=pdf.addPage([W,H]);y=H-60;};
  const ensure=(needed=26)=>{if(y-needed<58)newPage();};
  const block=(label,value)=>{
    ensure(55);txt(label.toUpperCase(),M,y,9,bold,gray);y-=20;
    for(const paragraph of clean(value||'-').split('\n')){
      let row='';
      for(const word of (paragraph||' ').split(/\s+/)){
        const proposal=row?row+' '+word:word;
        if(regular.widthOfTextAtSize(proposal,11)>lineWidth && row){
          ensure(17);txt(row,M,y);y-=17;row=word;
        } else row=proposal;
      }
      ensure(17);txt(row||' ',M,y);y-=17;
    }
    y-=19;
  };
  page.drawRectangle({x:0,y:H-187,width:W,height:187,color:green});
  page.drawRectangle({x:M,y:H-60,width:43,height:5,color:yellow});
  txt('JOKER  /  KEMMENTAL',M,H-88,11,bold,yellow);
  txt('Dein nächstes Abenteuer',M,H-128,25,bold,white);
  txt('TERMININFORMATIONEN',M,H-158,10,regular,white);

  block('Veranstaltung',event.title);
  ensure(135);
  page.drawRectangle({x:M-12,y:y-89,width:lineWidth+24,height:112,color:mint});
  const date=new Date(event.event_date+'T12:00:00').toLocaleDateString('de-CH',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  txt(date,M,y-12,15,bold,green);
  txt(String(event.start_time||'14:00').slice(0,5)+' - '+String(event.end_time||'17:00').slice(0,5)+' Uhr',M,y-37,12,regular,green);
  txt(event.location||'JuHu Hugelshofen',M,y-62,11,regular,gray);
  y-=130;
  block('Angemeldete Kinder',children.join(', '));
  block('Programm und Informationen',event.description||'Weitere Informationen folgen.');
  block('Kleidung und Mitnehmen',event.bring_wear?.trim()||'Keine besonderen Angaben.');
  block('Kontakt und weitere Infos','Evangelische Kirchgemeinde Kemmental | www.evang-kemmental.ch/joker');
  ensure(35);txt('Bitte kurzfristige Mitteilungen der Leitung beachten.',M,y,9,regular,gray);

  const data=await pdf.save(),blob=new Blob([data],{type:'application/pdf'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='JOKER-'+event.event_date+'-Termininfos.pdf';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
