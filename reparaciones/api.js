  async function loadData(){
    document.getElementById('registrosList').innerHTML='<div class="loading-state"><div class="spin"></div><p>Cargando registros...</p></div>';
    try{
      const response=await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'datos',usuario:currentUser,userHash:currentUserHash,sessionToken:currentSessionToken,rol:currentRole,dias:diasCargados})});
      const data=await response.json();
      if(!data.ok){document.getElementById('registrosList').innerHTML=`<div class="empty-state"><div class="ico">🚫</div><p style="color:#DC2626;font-weight:bold;">Error de autorización.</p></div>`;return;}
      allData=parseRegistros(data.registros);
      seguimientosRaw = data.seguimientos || [];
      seguimientos=parseSeguimientos(data.seguimientos);
      chatData=parseChat(data.chat||[]);
      historialData=parseHistorial(data.historial||[]);
      populateFilter();applyFilters();
      if(document.getElementById('tabHistorial')&&document.getElementById('tabHistorial').classList.contains('active'))renderHistorial();
      if(document.getElementById('tabDashboard')&&document.getElementById('tabDashboard').classList.contains('active'))renderDashboard();
    }catch(e){console.error(e);document.getElementById('registrosList').innerHTML=`<div class="empty-state"><div class="ico">❌</div><p>Error al cargar los datos.</p></div>`;}
  }

function parseRegistros(rows){
  if(!rows||rows.length<2)return[];
  const h=rows[0].map(s=>(s||'').toString().trim().toLowerCase());
  const col=n=>h.findIndex(s=>s.includes(n));
  let iTs=col('timestamp'); if(iTs===-1) iTs=col('marca temporal'); if(iTs===-1) iTs=0;
  const iOt=col('ot'),iProm=col('promotor'),iRol=col('rol'),iCli=col('cliente'),iMarca=col('marca'),iEdf=col('edf'),iFalla=col('falla'),iLat=col('lat'),iLng=col('lng'),iFoto=col('foto'),iNotas=col('notas');
  const iLocalidad=h.findIndex(s=>s.includes('localidad'))!==-1?h.findIndex(s=>s.includes('localidad')):12;
  const iFrecuencia=h.findIndex(s=>s.includes('frecuencia'))!==-1?h.findIndex(s=>s.includes('frecuencia')):13;
  const iDireccion=h.findIndex(s=>s.includes('direcci'))!==-1?h.findIndex(s=>s.includes('direcci')):15;
  const iRazonSoc=h.findIndex(s=>s.includes('raz'))!==-1?h.findIndex(s=>s.includes('raz')):16;
  return rows.slice(1).map((c,i)=>{const ts=(c[iTs]||'').toString();let fecha='',hora='';if(ts){const d=new Date(ts);if(!isNaN(d)){const f=formatFechaAR(d).split(' ');fecha=f[0];hora=f[1]||'';}}return{nro:i+1,ot:(c[iOt]||'').toString().trim(),ts,fecha,hora,nombre:(c[iProm]||'').toString().trim().toUpperCase(),rol:(c[iRol]||'promotor').toString().trim(),cliente:(c[iCli]||'').toString().trim(),marca:(c[iMarca]||'').toString().trim(),edf:(c[iEdf]||'').toString().trim(),falla:(c[iFalla]||'').toString().trim(),lat:(c[iLat]!==undefined&&c[iLat]!==''?c[iLat].toString():''),lng:(c[iLng]!==undefined&&c[iLng]!==''?c[iLng].toString():''),foto:(c[iFoto]||'').toString(),notas:(c[iNotas]||'').toString(),localidad:(c[iLocalidad]||'').toString().trim(),frecuencia:(c[iFrecuencia]||'').toString().trim(),direccion:(c[iDireccion]||'').toString().trim(),razon_social:(c[iRazonSoc]||'').toString().trim()};}).filter(r=>r.nombre);
}

function parseSeguimientos(rows){
  if(!rows||rows.length<2)return{};
  const h=rows[0].map(s=>(s||'').toString().trim().toLowerCase());
  const col=n=>h.findIndex(s=>s.includes(n));
  const iTs=col('timestamp'),iOt=col('ot'),iCli=col('cliente'),iProm=col('promotor'),iEst=col('estado'),iCom=col('comentario'),iTec=col('tecnico'),iPriSug=col('prioridad_sugerida'),iPriApr=col('prioridad_aprobada'),iAprPor=col('aprobado_por'),iTecLat=col('tec_lat'),iTecLng=col('tec_lng');
  const map={};
  rows.slice(1).forEach(c=>{const cli=(c[iCli]||'').toString().trim();const ot=(c[iOt]||'').toString().trim();const key=ot||cli;if(!key)return;const ts=(c[iTs]||'').toString();let fecha='';if(ts){const d=new Date(ts);if(!isNaN(d))fecha=formatFechaAR(d);}const prev=map[key]||{};map[key]={estado:(c[iEst]||prev.estado||'').toString().trim(),comentario:(c[iCom]||prev.comentario||'').toString().trim(),tecnico:(c[iTec]||prev.tecnico||'').toString().trim(),prioridad_sugerida:(c[iPriSug]||prev.prioridad_sugerida||'').toString().trim(),prioridad_aprobada:(c[iPriApr]||prev.prioridad_aprobada||'').toString().trim(),aprobado_por:(c[iAprPor]||prev.aprobado_por||'').toString().trim(),tec_lat:(iTecLat>=0&&c[iTecLat]?c[iTecLat].toString().trim():prev.tec_lat||''),tec_lng:(iTecLng>=0&&c[iTecLng]?c[iTecLng].toString().trim():prev.tec_lng||''),ts,fecha,ot,cli};});
  return map;
}

function getSegByOt(ot,cli){return seguimientos[ot]||seguimientos[cli]||null;}
function getEstadoKey(ot,cli){const seg=getSegByOt(ot,cli);if(!seg||!seg.estado)return'pendiente';return seg.estado.toLowerCase().replace(/ /g,'-')||'pendiente';}
function getPrioridadAprobada(ot,cli){const seg=getSegByOt(ot,cli);return seg?(seg.prioridad_aprobada||''):'';}
function getPrioridadSugerida(ot,cli){const seg=getSegByOt(ot,cli);return seg?(seg.prioridad_sugerida||''):'';}
function parseHistorial(rows){
  if(!rows||rows.length<2)return[];
  const h=rows[0].map(s=>(s||'').toString().trim().toLowerCase());
  const col=n=>h.findIndex(s=>s.includes(n));
  const iTs=col('timestamp'),iOt=col('ot'),iCli=col('cliente'),iProm=col('promotor'),iSup=col('supervisor'),iMarca=col('marca'),iEdf=col('edf'),iFalla=col('falla'),iTec=col('tecnico'),iCom=col('comentario'),iPri=col('prioridad'),iTecLat=col('tec_lat'),iTecLng=col('tec_lng');
  return rows.slice(1).map(c=>{const ts=(c[iTs]||'').toString();let fecha='';if(ts){const d=new Date(ts);if(!isNaN(d))fecha=formatFechaAR(d);}return{ts,fecha,ot:(c[iOt]||'').toString().trim(),cliente:(c[iCli]||'').toString().trim(),promotor:(c[iProm]||'').toString().trim(),supervisor:(c[iSup]||'').toString().trim(),marca:(c[iMarca]||'').toString().trim(),edf:(c[iEdf]||'').toString().trim(),falla:(c[iFalla]||'').toString().trim(),tecnico:(c[iTec]||'').toString().trim(),comentario:(c[iCom]||'').toString().trim(),prioridad:(c[iPri]||'').toString().trim(),tec_lat:(iTecLat>=0?(c[iTecLat]||'').toString().trim():''),tec_lng:(iTecLng>=0?(c[iTecLng]||'').toString().trim():'')};}).filter(r=>r.ot);
}
function parseChat(rows){
  if(!rows||rows.length<2)return{};
  const h=rows[0].map(s=>(s||'').toString().trim().toLowerCase());
  const col=n=>h.findIndex(s=>s.includes(n));
  const iTs=col('timestamp'),iOt=col('ot'),iAut=col('autor'),iRol=col('rol'),iChatTipo=col('chat_tipo'),iMsg=col('mensaje');
  const map={};
  rows.slice(1).forEach(c=>{const ot=(c[iOt]||'').toString().trim();if(!ot)return;const ts=(c[iTs]||'').toString();let fecha='';if(ts){const d=new Date(ts);if(!isNaN(d))fecha=formatFechaAR(d);}if(!map[ot])map[ot]=[];map[ot].push({ts,fecha,autor:(c[iAut]||'').toString().trim(),rol:(c[iRol]||'').toString().trim(),chat_tipo:(iChatTipo>=0?(c[iChatTipo]||'').toString().trim():''),mensaje:(c[iMsg]||'').toString().trim()});});
  return map;
}
async function enviarChatRol(ot,canal){
  const inputId='chatInput-'+canal,boxId='chatBox-'+canal,input=document.getElementById(inputId);
  if(!input)return;const msg=(input.value||'').trim();if(!msg)return;
  input.value='';input.disabled=true;
  const payload={tipo:'chat',timestamp:new Date().toISOString(),ot,autor:currentUser,rol:currentRole,chat_tipo:canal,mensaje:msg,usuario:currentUser,userHash:currentUserHash,sessionToken:currentSessionToken,rolToken:currentRole};
  await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
  if(!chatData[ot])chatData[ot]=[];
  const d=new Date(),fecha=formatFechaAR(d);
  chatData[ot].push({ts:d.toISOString(),fecha,autor:currentUser,rol:currentRole,chat_tipo:canal,mensaje:msg});
  const box=document.getElementById(boxId);
  if(box){const newMsg=document.createElement('div');newMsg.style.cssText='display:flex;flex-direction:column;align-items:flex-end;margin-bottom:8px;';newMsg.innerHTML=`<div style="max-width:80%;background:#EDE9FE;border:1px solid #DDD6FE;border-radius:12px 4px 12px 12px;padding:8px 12px;"><div style="font-size:11px;font-weight:700;color:#6D28D9;margin-bottom:3px;">${escapeHTML(currentUser)}</div><div style="font-size:13px;color:#0F2A4A;">${escapeHTML(msg)}</div><div style="font-size:10px;color:#94A3B8;margin-top:4px;text-align:right;">${escapeHTML(fecha)}</div></div>`;const sinMsg=box.querySelector('div[style*="text-align:center"]');if(sinMsg)box.innerHTML='';box.appendChild(newMsg);box.scrollTop=box.scrollHeight;}
  applyFilters();input.disabled=false;input.focus();
}
async function guardarSeguimiento(cliente,promotor,ot,tipoRol){
  const modal=document.getElementById('modalOverlay'),btn=event.target;
  if(btn.dataset.guardado==='1')return;
  btn.disabled=true;btn.textContent='Guardando...';
  const key=ot||cliente,prev=seguimientos[key]||{},otData=allData.find(r=>r.ot===ot)||{};
  let payload={tipo:'seguimiento',timestamp:new Date().toISOString(),ot,cliente,promotor,
    estado:prev.estado||'',comentario:prev.comentario||'',tecnico:prev.tecnico||'',
    prioridad_sugerida:prev.prioridad_sugerida||'',prioridad_aprobada:prev.prioridad_aprobada||'',
    aprobado_por:prev.aprobado_por||'',marca:otData.marca||'',edf:otData.edf||'',falla:otData.falla||'',
    usuario:currentUser,userHash:currentUserHash,sessionToken:currentSessionToken,rolToken:currentRole};

  if(tipoRol==='tecnico'){
    const comentario=modal.querySelector('[data-mid="segComentario"]').value.trim();
    const tecLat=modal.querySelector('[data-mid="geoTecLat"]').value,tecLng=modal.querySelector('[data-mid="geoTecLng"]').value;
    if(!comentario){const ta=modal.querySelector('[data-mid="segComentario"]');ta.style.borderColor='#DC2626';ta.focus();btn.disabled=false;btn.textContent='💾 Guardar devolución';return;}
    if(!tecLat||!tecLng){const res=modal.querySelector('[data-mid="geoTecResult"]');res.style.color='#DC2626';res.textContent='⚠️ Debés capturar tu ubicación antes de guardar.';btn.disabled=false;btn.textContent='💾 Guardar devolución';return;}
    payload.estado=modal.querySelector('[data-mid="segEstado"]').value;payload.comentario=comentario;payload.tecnico=currentUser;payload.tec_lat=tecLat;payload.tec_lng=tecLng;payload.tec_timestamp=new Date().toISOString();
  }else if(tipoRol==='supervisor'){
    const priVal=modal.querySelector('[data-mid="segPriSug"]').value;payload.prioridad_sugerida=priVal;
    if(priVal==='1'||priVal==='2'){payload.prioridad_aprobada=priVal;payload.aprobado_por=currentUser+' (auto)';}
  }else if(tipoRol==='trade'){
    payload.prioridad_aprobada=modal.querySelector('[data-mid="segPriApr"]').value;payload.aprobado_por=currentUser;
  }else if(tipoRol==='trade-cerrar'){
    const comentarioTrade=modal.querySelector('[data-mid="segComentarioTrade"]').value.trim();
    if(!comentarioTrade){modal.querySelector('[data-mid="segComentarioTrade"]').style.borderColor='#DC2626';modal.querySelector('[data-mid="segComentarioTrade"]').focus();btn.disabled=false;btn.textContent='🔒 Cerrar y enviar a Historial';return;}
    payload.estado=modal.querySelector('[data-mid="segEstadoTrade"]').value;payload.comentario=comentarioTrade;
    const priSel=modal.querySelector('[data-mid="segPriApr"]');if(priSel)payload.prioridad_aprobada=priSel.value;payload.aprobado_por=currentUser;
  }

  try{
    await fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    const ts=new Date().toISOString(),fecha=formatFechaAR(new Date());
    seguimientos[key]={...prev,...payload,ts,fecha};
    btn.dataset.guardado='1';btn.style.display='none';
    const saveOk=modal.querySelector('[data-mid="saveOk"]');if(saveOk)saveOk.style.display='block';
    applyFilters();setTimeout(()=>closeModalDirect(),1200);
  }catch(e){btn.disabled=false;btn.textContent='Reintentar';console.error('Error al guardar:',e);}
}
async function cargarMas(){
  const btn=document.getElementById('btnVerMas');btn.textContent='Cargando...';btn.disabled=true;
  diasCargados=diasCargados===30?90:diasCargados===90?180:365;
  await loadData();
  const label=document.getElementById('periodoLabel');if(label)label.textContent=`Últimos ${diasCargados} días`;
  if(diasCargados>=365)btn.style.display='none';else{btn.textContent='Ver más';btn.disabled=false;}
}
