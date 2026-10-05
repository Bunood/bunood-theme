// Browser-only: historical Version values are record data, never UI labels.
// Return identities so the caller can omit text alone, retaining attribute audits.
export function nativeVersionValueNodes() {
 const result=new Set();
 const frm=window.cur_frm, utils=window.frappe?.utils;
 if(!frm?.get_docinfo || !utils?.html2text || !window.frappe?.ellipsis)return result;
 const versions=frm.get_docinfo()?.versions;
 if(!Array.isArray(versions))return result;
 const known=new Map();
 for(const version of versions){
  if(typeof version.name!=='string'||known.has(version.name))return new Set();
  let data;try{data=JSON.parse(version.data);}catch{continue;}
  if(data.comment)continue;
  const changes=[...(Array.isArray(data.changed)?data.changed:[])];
  for(const row of Array.isArray(data.row_changed)?data.row_changed:[]){
   if(Array.isArray(row)&&Array.isArray(row[3]))changes.push(...row[3]);
  }
  const values=new Set();
  for(const change of changes){
   if(!Array.isArray(change)||change.length!==3||typeof change[0]!=='string'||change[0]==='docstatus')continue;
   for(const value of change.slice(1)){
    if(value!==null&&!['string','number','boolean'].includes(typeof value))continue;
    try{values.add(window.frappe.ellipsis(utils.html2text(value),40)||'""');}catch{/* Unknown native format stays audited. */}
   }
  }
  known.set(version.name,values);
 }
 for(const el of document.querySelectorAll('.timeline-items > .timeline-item .timeline-content > a > b')){
  if(el.children.length)continue;
  const link=el.parentElement, content=link.parentElement;
  if(!content.classList.contains('timeline-content'))continue;
  let id;try{
   const url=new URL(link.getAttribute('href'),location.href);
   if(url.origin!==location.origin||url.search||url.hash||!/^\/desk\/version\/[^/]+$/.test(url.pathname))continue;
   id=decodeURIComponent(url.pathname.slice('/desk/version/'.length));
  }catch{continue;}
  // An inherited bnd-* ancestor can contain the native timeline. A Theme-owned
  // node inside the timeline is still a UI surface and must never be exempted.
  let owned=false;
  for(let node=el;node&&node!==content.parentElement;node=node.parentElement){
   if([...node.attributes].some(a=>a.name.startsWith('data-bnd-'))||[...node.classList].some(c=>c.startsWith('bnd-'))){owned=true;break;}
  }
  if(!owned&&known.get(id)?.has(el.textContent))result.add(el);
 }
 return result;
}
