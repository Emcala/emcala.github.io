let solicitudesRetiro=[];
function renderTablaRetiro(){
  const tbody=document.getElementById('tablaRetiroBody');if(!tbody)return;
  if(!solicitudesRetiro.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px;font-size:13px;">Sin solicitudes aún</td></tr>';return;}
  const estadoColors={pendiente:'#FEF3C7;color:#92400E',completado:'#D1FAE5;color:#065F46',cancelado:'#FEE2E2;color:#991B1B'};
  tbody.innerHTML=solicitudesRetiro.map((s,i)=>`<tr><td>${i+1}</td><td>${s.fecha||''}</td><td>${s.codCliente||''}</td><td>${s.tipoActivo||''}</td><td>${s.equipo||''}</td><td>${s.unidadNegocio||''}</td><td>${s.fechaSolicitada||''}</td><td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${(estadoColors[s.estado]||'#F1F5F9;color:#475569').split(';')[0]};${(estadoColors[s.estado]||';color:#475569').split(';')[1]||''}">${(s.estado||'pendiente').toUpperCase()}</span></td></tr>`).join('');
}

function renderTablaFiltros(){
  const filtCliente=(document.getElementById('tFiltCliente').value||'').toLowerCase();
  const filtOT=(document.getElementById('tFiltOT').value||'').toLowerCase();
  const filtPromotor=(document.getElementById('tFiltPromotor').value||'').toLowerCase();
  const filtEstado=document.getElementById('tFiltEstado').value;
  const filtDesde=document.getElementById('tFiltDesde').value;
  const filtHasta=document.getElementById('tFiltHasta').value;
  const data=allData.filter(r=>{
    if(filtCliente&&!(r.cliente||'').toLowerCase().includes(filtCliente))return false;
    if(filtOT&&!(r.ot||'').toLowerCase().includes(filtOT))return false;
    if(filtPromotor&&!(r.nombre||'').toLowerCase().includes(filtPromotor))return false;
    const eKey=getEstadoKey(r.ot,r.cliente);
    if(filtEstado&&eKey!==filtEstado)return false;
    if(filtDesde&&r.ts&&r.ts<filtDesde)return false;
    if(filtHasta&&r.ts&&r.ts.slice(0,10)>filtHasta)return false;
    return true;
  });
  const priLabels={'1':'⚠️ P1','2':'⚠️ P2','3':'P3','4':'P4','5':'P5','':'—'};
  const tbody=document.getElementById('tablaBody');
  if(!tbody)return;
  tbody.innerHTML=data.map(r=>{
    const seg=getSegByOt(r.ot,r.cliente);
    const eKey=seg?(seg.estado||'').toLowerCase().replace(/ /g,'-'):'';
    const em=ESTADO_META[eKey]||ESTADO_META[''];
    const priA=seg?(seg.prioridad_aprobada||''):'';
    const priS=seg?(seg.prioridad_sugerida||''):'';
    return `<tr><td>${r.ot||'—'}</td><td>${r.fecha||'—'}</td><td>${r.cliente||'—'}</td><td>${r.nombre||'—'}</td><td>${r.marca||'—'}</td><td>${r.edf||'—'}</td><td>${r.falla||'—'}</td><td><span class="estado-pill ${em.cls}">${em.icon} ${em.label}</span></td><td>${priA?'P'+priA+' (apr)':priS?'P'+priS+' (sug)':'—'}</td><td>${seg&&seg.tecnico?seg.tecnico:'—'}</td><td>${seg&&seg.comentario?seg.comentario:'—'}</td></tr>`;
  }).join('');
}
function renderHistorial(){
  const tbody=document.getElementById('tablaHistorialBody');if(!tbody)return;
  const filtCliente=(document.getElementById('hFiltCliente').value||'').toLowerCase();
  const filtPromotor=(document.getElementById('hFiltPromotor').value||'').toLowerCase();
  const filtDesde=document.getElementById('hFiltDesde').value;
  const filtHasta=document.getElementById('hFiltHasta').value;
  const data=historialData.filter(r=>{
    if(currentRole==='supervisor'&&promotoresPropios.length>0&&!promotoresPropios.includes((r.promotor||'').toUpperCase().trim()))return false;
    if(filtCliente&&!(r.cliente||'').toLowerCase().includes(filtCliente))return false;
    if(filtPromotor&&!(r.promotor||'').toLowerCase().includes(filtPromotor))return false;
    if(filtDesde&&r.ts&&r.ts<filtDesde)return false;
    if(filtHasta&&r.ts&&r.ts.slice(0,10)>filtHasta)return false;
    return true;
  });
  if(!data.length){tbody.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:32px;font-size:13px;">Sin registros resueltos aún</td></tr>';return;}
  const priLabels={'1':'⚠️ P1 — REPAGO','2':'⚠️ P2 — EJECUCIÓN','3':'P3 — PTC SUGERIDO','4':'P4','5':'P5','':'—'};
  tbody.innerHTML=[...data].reverse().map(r=>{
    const tLat=fixCoord(r.tec_lat),tLng=fixCoord(r.tec_lng);
    const geoLink=tLat&&tLng?`<a href="https://www.google.com/maps/search/?api=1&query=${tLat},${tLng}" target="_blank" style="color:var(--blue);font-size:11px;">📍 Ver</a>`:'—';
    const seg=getSegByOt(r.ot,r.cliente);
    const eKey=seg&&seg.estado?seg.estado.toLowerCase().replace(/ /g,'-'):'resuelto';
    const em=ESTADO_META[eKey]||ESTADO_META['resuelto'];
    return `<tr><td><strong style="font-family:'DM Mono',monospace;color:var(--navy)">${r.ot||'—'}</strong></td><td>${r.fecha||'—'}</td><td>${r.cliente||'—'}</td><td>${r.promotor||'—'}</td><td>${r.supervisor||'—'}</td><td>${r.marca||'—'}</td><td>${r.edf||'—'}</td><td>${r.falla||'—'}</td><td><span class="estado-pill ${em.cls}" style="font-size:10px;padding:2px 6px;white-space:nowrap">${em.icon} ${em.label}</span></td><td>${priLabels[r.prioridad]||r.prioridad||'—'}</td><td>${r.tecnico||'—'}</td><td style="max-width:200px;font-size:12px;color:var(--muted)">${r.comentario||'—'}</td><td>${geoLink}</td></tr>`;
  }).join('');
}
function switchTab(tab){
  document.getElementById('tabMapa').classList.toggle('active',tab==='mapa');
  document.getElementById('tabHistorial').classList.toggle('active',tab==='historial');
  document.getElementById('tabRetiro').classList.toggle('active',tab==='retiro');
  if(document.getElementById('tabLogs')) document.getElementById('tabLogs').classList.toggle('active',tab==='logs');
  if(document.getElementById('tabDashboard')) document.getElementById('tabDashboard').classList.toggle('active',tab==='dashboard');
  
  document.querySelector('.filters-bar').style.display=tab==='mapa'?'':'none';
  document.querySelector('.main').style.display=tab==='mapa'?'':'none';
  document.getElementById('vistaTabla').style.display='none';
  document.getElementById('vistaHistorial').style.display=tab==='historial'?'block':'none';
  document.getElementById('vistaRetiro').style.display=tab==='retiro'?'block':'none';
  if(document.getElementById('vistaLogs')) document.getElementById('vistaLogs').style.display=tab==='logs'?'block':'none';
  if(document.getElementById('vistaDashboard')) document.getElementById('vistaDashboard').style.display=tab==='dashboard'?'block':'none';
  if(document.getElementById('vistaUsuarios')) document.getElementById('vistaUsuarios').style.display=tab==='usuarios'?'block':'none';
  
  if(tab==='historial')renderHistorial();
  if(tab==='retiro')renderTablaRetiro();
  if(tab==='logs')renderLogs();
  if(tab==='dashboard')renderDashboard();
  if(leafMap)setTimeout(()=>leafMap.invalidateSize(),50);
}

function exportarExcel(){
  const ESTADOS={'resuelto':'Resuelto','pendiente':'Pendiente','retiro':'Retiro','':'Sin estado'};
  const headers=['OT','Fecha','Cliente','Promotor','Marca','EDF','Falla','Estado','Prioridad','Técnico','Comentario'];
  const rows=filtered.map(r=>{const seg=getSegByOt(r.ot,r.cliente);const eKey=seg?(seg.estado||'').toLowerCase().replace(/ /g,'-'):'';const priA=seg?(seg.prioridad_aprobada||''):'';const priS=seg?(seg.prioridad_sugerida||''):'';return[r.ot||'',r.fecha||'',r.cliente||'',r.nombre||'',r.marca||'',r.edf||'',r.falla||'',ESTADOS[eKey]||'Sin estado',priA?'P'+priA+' (aprobada)':priS?'P'+priS+' (sugerida)':'',seg&&seg.tecnico?seg.tecnico:'',seg&&seg.comentario?seg.comentario:''];});
  const csv=[headers,...rows].map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='suralnor_registros_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
}
function filtrarDiaHoy(){
  if(currentRole!=='tecnico')return;
  const dia=new Date().getDay(),freqs=FREQ_DIA[dia]||[];if(!freqs.length)return;
  filtroHoyActivo=!filtroHoyActivo;const btn=document.getElementById('notifBtnHoy');
  if(filtroHoyActivo){
    ['mfFrecuencia','mfPrioridad'].forEach(id=>{const dd=document.getElementById(id+'Dropdown');if(dd)dd.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);});
    const ddFrec=document.getElementById('mfFrecuenciaDropdown');if(ddFrec)ddFrec.querySelectorAll('input[type=checkbox]').forEach(cb=>{if(freqs.includes(cb.value.toUpperCase()))cb.checked=true;});
    // Ya no forzamos que sea solo prioridad 1 o 2, para que vea todas las visitas del dia
    if(btn)btn.classList.add('activo-hoy');applyFilters(true);
  }else{
    ['mfFrecuencia','mfPrioridad'].forEach(id=>{const dd=document.getElementById(id+'Dropdown');if(dd)dd.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);});
    if(btn)btn.classList.remove('activo-hoy');applyFilters(false);
  }
}

function ordenarPorLocalidadYCercania(data){
  const grupos={};data.forEach(r=>{const loc=r.localidad||'Sin localidad';if(!grupos[loc])grupos[loc]=[];grupos[loc].push(r);});
  const locs=Object.keys(grupos).sort(),resultado=[];
  locs.forEach(loc=>{const pts=grupos[loc];if(pts.length<=1){resultado.push({separador:loc});resultado.push(...pts);return;}const visitados=new Set();let actual=pts[0];const ordenados=[actual];visitados.add(0);while(ordenados.length<pts.length){let minDist=Infinity,minIdx=-1;const aLat=parseFloat(fixCoord(actual.lat)||0),aLng=parseFloat(fixCoord(actual.lng)||0);pts.forEach((p,i)=>{if(visitados.has(i))return;const pLat=parseFloat(fixCoord(p.lat)||0),pLng=parseFloat(fixCoord(p.lng)||0),d=Math.pow(aLat-pLat,2)+Math.pow(aLng-pLng,2);if(d<minDist){minDist=d;minIdx=i;}});if(minIdx===-1)break;actual=pts[minIdx];ordenados.push(actual);visitados.add(minIdx);}resultado.push({separador:loc});resultado.push(...ordenados);});
  return resultado;
}

function checkFrecuenciaDia(frec, dia) {
  if(!frec) return false;
  const str = frec.toUpperCase().replace(/É/g, 'E').replace(/Á/g, 'A').replace(/Í/g, 'I');
  if(dia===1 && (str.includes('LU')||str.includes('LUN'))) return true;
  if(dia===2 && (str.includes('MA')||str.includes('MAR'))) return true;
  if(dia===3 && (str.includes('MI')||str.includes('MIE'))) return true;
  if(dia===4 && (str.includes('JU')||str.includes('JUE'))) return true;
  if(dia===5 && (str.includes('VI')||str.includes('VIE'))) return true;
  if(dia===6 && (str.includes('SA')||str.includes('SAB'))) return true;
  return false;
}

function updateNotificaciones(){
  const panel=document.getElementById('notifPanel');if(!panel)return;panel.style.display='flex';
  const dia=new Date().getDay(),freqsHoy=FREQ_DIA[dia]||[];
  let countVerde;
  if(currentRole==='tecnico'&&freqsHoy.length){
    countVerde=filtered.filter(r=>{
      const eKey=getEstadoKey(r.ot,r.cliente);
      if(eKey==='resuelto'||eKey==='retiro')return false;
      return checkFrecuenciaDia(r.frecuencia, dia);
    }).length;
  } else {
    countVerde=filtered.filter(r=>{
      const eKey=getEstadoKey(r.ot,r.cliente);
      if(eKey==='resuelto'||eKey==='retiro')return false;
      const pri=getPrioridadAprobada(r.ot,r.cliente)||getPrioridadSugerida(r.ot,r.cliente);
      return !!pri;
    }).length;
  }
  const boxAlta=document.getElementById('notifPrioridadAlta');if(boxAlta)boxAlta.textContent=countVerde;
  let countAmarillo=0;const labelAmarillo=document.querySelector('.notif-yellow .notif-label'),boxSin=document.getElementById('notifSinPrioridad');
  if(currentRole==='tecnico'||currentRole==='trade'){
    if(labelAmarillo)labelAmarillo.textContent='Pendientes (Totales)';
    countAmarillo=filtered.filter(r=>{const eKey=getEstadoKey(r.ot,r.cliente);return eKey!=='resuelto'&&eKey!=='retiro'&&eKey!=='cliente-cerrado';}).length;
  } else {
    if(labelAmarillo)labelAmarillo.textContent='Sin prioridad asignada';
    countAmarillo=filtered.filter(r=>{const eKey=getEstadoKey(r.ot,r.cliente);if(eKey==='resuelto'||eKey==='retiro'||eKey==='cliente-cerrado')return false;return !getPrioridadAprobada(r.ot,r.cliente)&&!getPrioridadSugerida(r.ot,r.cliente);}).length;
  }
  if(boxSin)boxSin.textContent=countAmarillo;
  const vencidos=filtered.filter(r=>{const eKey=getEstadoKey(r.ot,r.cliente);if(eKey==='resuelto'||eKey==='retiro'||eKey==='cliente-cerrado')return false;if(!r.ts)return false;return(Date.now()-new Date(r.ts))/86400000>21;}).length;
  const boxVenc=document.getElementById('notifVencidos');if(boxVenc)boxVenc.textContent=vencidos;
  if(currentRole==='tecnico'){
    const label=document.getElementById('notifBtnLabel'),diaLabel=DIA_LABEL[dia];
    if(label&&freqsHoy.length)label.textContent=`${countVerde} OT${countVerde!==1?'s':''} · Frecuencia ${diaLabel}`;
    else if(label)label.textContent=dia===0?'Sin visitas hoy (Domingo)':'OTs activas';
  }
}

function toggleSortRegistros(){ordenDescendente=!ordenDescendente;const btn=document.getElementById('btnSortRegistros');if(btn)btn.innerHTML=ordenDescendente?'🔽 Más recientes':'🔼 Más antiguos';renderList(filtered);}

function populateFilter(){
  let names;
  if(currentRole==='supervisor'&&promotoresPropios.length>0)names=[...new Set(allData.map(r=>r.nombre))].filter(n=>promotoresPropios.includes(n.toUpperCase())).sort();
  else names=[...new Set(allData.map(r=>r.nombre))].sort();
  const ddProm=document.getElementById('mfPromotorDropdown');if(ddProm)ddProm.innerHTML=names.map(n=>`<label class="multi-filter-option"><input type="checkbox" value="${n}" onchange="applyFilters()"> ${n}</label>`).join('');
  const tp=document.getElementById('tFiltPromotor');if(tp)tp.innerHTML='<option value="">Todos</option>'+names.map(n=>`<option value="${n}">${n}</option>`).join('');
  const localidades=[...new Set(allData.map(r=>r.localidad).filter(Boolean))].sort();
  const ddLoc=document.getElementById('mfLocalidadDropdown');if(ddLoc)ddLoc.innerHTML=localidades.map(l=>`<label class="multi-filter-option"><input type="checkbox" value="${l}" onchange="applyFilters()"> ${l}</label>`).join('');
  
  if(currentRole==='tecnico'&&window.innerWidth<=900){document.querySelectorAll('.filters-bar .filter-field').forEach((f,i)=>{if(i>0)f.style.display='none';});document.querySelectorAll('.filter-sep').forEach(s=>s.style.display='none');const btnClear=document.querySelector('.btn-clear');if(btnClear)btnClear.style.display='none';}
}

function applyFilters(ordenInteligente){
  const busqueda=(document.getElementById('filterBusqueda')?document.getElementById('filterBusqueda').value:'').toLowerCase().trim();
  const promotoresSeleccionados=getMultiFilterValues('mfPromotor');
  const desde=document.getElementById('filterDesde').value,hasta=document.getElementById('filterHasta').value;
  const localidadesSeleccionadas=getMultiFilterValues('mfLocalidad');
  const estadosSeleccionados=getMultiFilterValues('mfEstado');
  const prioridadesSeleccionadas=getMultiFilterValues('mfPrioridad');
  const frecuenciasSeleccionadas=getMultiFilterValues('mfFrecuencia');
  filtered=allData.filter(r=>{
    if(currentRole==='supervisor'&&promotoresPropios.length>0&&!promotoresPropios.includes((r.nombre||'').toUpperCase().trim()))return false;
    if(busqueda){const hayMatch=(r.ot||'').toLowerCase().includes(busqueda)||(r.cliente||'').toLowerCase().includes(busqueda)||(r.nombre||'').toLowerCase().includes(busqueda)||(r.localidad||'').toLowerCase().includes(busqueda)||(r.edf||'').toLowerCase().includes(busqueda);if(!hayMatch)return false;}
    if(promotoresSeleccionados.length>0&&!promotoresSeleccionados.map(x=>x.toUpperCase()).includes((r.nombre||'').toUpperCase()))return false;
    if(localidadesSeleccionadas.length>0&&!localidadesSeleccionadas.includes(r.localidad))return false;
    if(frecuenciasSeleccionadas.length>0){
      const fStr=(r.frecuencia||'').toUpperCase().replace(/É/g,'E').replace(/Á/g,'A').replace(/Í/g,'I');
      const match=frecuenciasSeleccionadas.some(sel=>{
        if(sel==='LU'||sel==='LUJU') return fStr.includes('LU')||fStr.includes('LUN');
        if(sel==='MA'||sel==='MAVI') return fStr.includes('MA')||fStr.includes('MAR');
        if(sel==='MI'||sel==='MISA') return fStr.includes('MI')||fStr.includes('MIE');
        if(sel==='JU'||sel==='LUJU') return fStr.includes('JU')||fStr.includes('JUE');
        if(sel==='VI'||sel==='MAVI') return fStr.includes('VI')||fStr.includes('VIE');
        if(sel==='SA'||sel==='MISA') return fStr.includes('SA')||fStr.includes('SAB');
        return fStr.includes(sel);
      });
      if(!match) return false;
    }
    const eKey=getEstadoKey(r.ot,r.cliente);
    if(estadosSeleccionados.length>0){if(!estadosSeleccionados.includes(eKey))return false;}
    else{if(eKey==='resuelto'||eKey==='retiro')return false;}

    // Anti-duplicados: Ocultar OTs obsoletas (creadas ANTES de que el técnico resolviera otra OT del mismo cliente)
    if(eKey !== 'resuelto' && eKey !== 'retiro' && r.cliente) {
      const cliKey = r.cliente.toString().trim();
      const currTs = r.timestamp ? new Date(r.timestamp) : new Date(0);
      const segVals = Object.values(seguimientos);
      for(let i=0; i<segVals.length; i++){
        if(segVals[i].cli === cliKey && (segVals[i].estado||'').toLowerCase() === 'resuelto') {
          const resTs = segVals[i].ts ? new Date(segVals[i].ts) : new Date(0);
          if(resTs > currTs) return false; // Es obsoleta, ya fue cubierta por una visita posterior
        }
      }
    }

    if(prioridadesSeleccionadas.length>0){const priA=getPrioridadAprobada(r.ot,r.cliente),priS=getPrioridadSugerida(r.ot,r.cliente),priActual=priA||priS||'sin-prioridad';if(!prioridadesSeleccionadas.includes(priActual))return false;}
    if(currentRole==='tecnico'&&!getPrioridadAprobada(r.ot,r.cliente))return false;
    if((desde||hasta)&&r.ts){const d=new Date(r.ts);if(desde&&d<new Date(desde))return false;if(hasta&&d>new Date(hasta+'T23:59:59'))return false;}
    return true;
  });

  // Novedad: Anti-Duplicados Inteligente
  // Ordenamos de más reciente a más antigua
  filtered.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
  const unicos = [];
  const clientVisto = new Set();
  filtered.forEach(r => {
    const cliKey = r.cliente ? r.cliente.toString().trim() : '';
    if (!cliKey || !clientVisto.has(cliKey)) {
      if (cliKey) clientVisto.add(cliKey);
      unicos.push(r);
    }
  });
  filtered = unicos;

  document.getElementById('listCount').textContent=filtered.length;
  updateMultiFilterLabel('mfPromotor','Todos');updateMultiFilterLabel('mfLocalidad','Todas');
  updateMultiFilterLabel('mfEstado',estadosSeleccionados.length?estadosSeleccionados.length+' sel.':'Activos');
  updateMultiFilterLabel('mfPrioridad','Todas');updateMultiFilterLabel('mfFrecuencia','Todas');
  updateNotificaciones();
  const bannerViejo=document.getElementById('tecnicoBanner');if(bannerViejo)bannerViejo.style.display='none';
  updateMap(filtered);
  if(ordenInteligente&&currentRole==='tecnico')renderListInteligente(filtered);else renderList(filtered);
}

function clearFilters(){
  filtroHoyActivo=false;const btn=document.getElementById('notifBtnHoy');if(btn)btn.classList.remove('activo-hoy');
  ['filterDesde','filterHasta','filterBusqueda'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['mfPromotor','mfLocalidad','mfEstado','mfPrioridad','mfFrecuencia'].forEach(id=>{const dd=document.getElementById(id+'Dropdown');if(dd)dd.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);updateMultiFilterLabel(id,id==='mfEstado'?'Activos':'Todas');});
  applyFilters();
}

function getFrecColor(frec){const f=(frec||'').toUpperCase();if(f.includes('LU')||f.includes('JU'))return'#1B5FA8';if(f.includes('MA')||f.includes('VI'))return'#16A34A';if(f.includes('MI')||f.includes('SA'))return'#D97706';return'#64748B';}

function buildRegItem(r,onclickAttr){
  const avatarColor=r.frecuencia?getFrecColor(r.frecuencia):ageColor(r.ts);
  const initials=r.frecuencia||(r.cliente||'?').replace(/[^A-Z0-9]/gi,'').slice(0,3).toUpperCase();
  const hasGeo=r.lat&&r.lng&&parseFloat(r.lat)!==0;
  const eKey=getEstadoKey(r.ot,r.cliente),em=ESTADO_META[eKey]||ESTADO_META[''];
  
  // Anti-Duplicados: Verificar si hay reincidencia (otra OT anterior resuelta para el mismo cliente)
  let esReincidencia = false;
  if(r.cliente) {
    const cliKey = r.cliente.toString().trim();
    const currOt = r.ot ? r.ot.toString().trim() : '';
    const currTs = r.timestamp ? new Date(r.timestamp) : new Date(0);
    const segVals = Object.values(seguimientos);
    for(let i=0; i<segVals.length; i++){
      if(segVals[i].cli === cliKey && segVals[i].ot !== currOt && (segVals[i].estado||'').toLowerCase() === 'resuelto') {
        const resTs = segVals[i].ts ? new Date(segVals[i].ts) : new Date(0);
        // Sólo es reincidencia si la nueva OT se cargó DESPUÉS de haber resuelto la anterior
        if(currTs > resTs) {
          esReincidencia = true; break;
        }
      }
    }
  }
  const reinBadge = esReincidencia ? `<span style="margin-left:4px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:100px;background:#DC2626;color:white;animation:pulse 2s infinite;">⚠️ REINCIDENCIA</span>` : '';

  const priA=getPrioridadAprobada(r.ot,r.cliente),priS=getPrioridadSugerida(r.ot,r.cliente),priShow=priA||priS;
  const isAlta=priA&&(priA==='1'||priA==='2');
  const priBadge=priShow?`<span style="margin-left:4px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:100px;background:${priA?'#0F2A4A':'#E2E8F0'};color:${priA?'white':'#64748B'}">${isAlta?'⚠️ ':''} P${priShow}${!priA?' (sugerida)':''}</span>`:'';
  const msgCount=(window.chatData&&window.chatData[r.ot])?window.chatData[r.ot].length:0;
  const chatBadge=msgCount>0?`<span style="margin-left:4px;font-size:12px;cursor:help;padding:2px 5px;border-radius:6px;background:#E0E7FF;color:#4338CA;" title="Tiene mensajes">✉️</span>`:'';
  return `<div class="reg-item" onclick='${onclickAttr}'><div class="reg-avatar" style="background:${avatarColor};font-size:${initials.length>2?'10px':'12px'}">${initials}</div><div class="reg-info"><div class="reg-nombre">OT ${r.ot||'—'} ${isAlta?'<span style="color:#DC2626">❗</span>':''}</div><div class="reg-sub">${r.cliente||'Sin cliente'} · 👤 ${r.nombre}</div><div style="margin-top:2px"><span class="estado-pill ${em.cls}">${em.icon} ${em.label}</span>${priBadge}${reinBadge}${chatBadge}</div></div><div class="reg-meta"><div class="reg-fecha">${r.fecha}</div><div class="reg-hora">${r.hora||''}</div><div class="${hasGeo?'reg-gps':'reg-nogps'}">${hasGeo?'📍 GPS':'Sin GPS'}</div></div></div>`;
}

function renderList(data){
  const el=document.getElementById('registrosList');
  if(!data.length){el.innerHTML='<div class="empty-state"><div class="ico">📭</div><p>No hay registros activos.</p></div>';return;}
  let dataParaMostrar=[...data];if(ordenDescendente)dataParaMostrar.reverse();
  el.innerHTML=dataParaMostrar.map(r=>buildRegItem(r,`openModal(${JSON.stringify(r).replace(/'/g,"&#39;")})`)).join('');
}

function renderListInteligente(data){
  const el=document.getElementById('registrosList');
  if(!data.length){el.innerHTML='<div class="empty-state"><div class="ico">📭</div><p>No hay registros activos.</p></div>';return;}
  window._otData=window._otData||{};
  const ordenados=ordenarPorLocalidadYCercania(data);
  el.innerHTML=ordenados.map(item=>{if(item.separador!==undefined)return `<div class="loc-separator">📍 ${item.separador}</div>`;window._otData[item.ot]=item;return buildRegItem(item,`openModal(window._otData["${item.ot}"])`);}).join('');
}

function buildChatBox(msgs,canal,ot){
  const inputId='chatInput-'+canal,boxId='chatBox-'+canal;
  const msgsHTML=msgs.length?msgs.map(m=>{const isMe=m.rol===currentRole,bg=isMe?'#EDE9FE':'#F0F9FF',border=isMe?'#DDD6FE':'#BAE6FD',radius=isMe?'12px 4px 12px 12px':'4px 12px 12px 12px',color=isMe?'#6D28D9':'#0369A1',align=isMe?'flex-end':'flex-start';return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:8px;"><div style="max-width:80%;background:${bg};border:1px solid ${border};border-radius:${radius};padding:8px 12px;"><div style="font-size:11px;font-weight:700;color:${color};margin-bottom:3px;">${escapeHTML(m.autor)}</div><div style="font-size:13px;color:#0F2A4A;">${escapeHTML(m.mensaje)}</div><div style="font-size:10px;color:#94A3B8;margin-top:4px;text-align:right;">${escapeHTML(m.fecha)}</div></div></div>`;}).join(''):'<div style="text-align:center;color:#94A3B8;font-size:12px;padding:12px 0;">Sin mensajes aún</div>';
  return `<div id="${boxId}" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px;margin-bottom:8px;max-height:160px;overflow-y:auto;">${msgsHTML}</div><div style="display:flex;gap:8px;"><input id="${inputId}" placeholder="Escribí un mensaje..." style="flex:1;padding:9px 12px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;color:#0F2A4A;background:white;" onkeydown="if(event.key==='Enter')enviarChatRol('${escapeHTML(ot)}','${canal}')"><button onclick="enviarChatRol('${escapeHTML(ot)}','${canal}')" style="background:#0F2A4A;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">Enviar</button></div>`;
}
function switchModalTab(tab){
  document.getElementById('mtbDetalle').classList.toggle('active',tab==='detalle');
  document.getElementById('mtbChat').classList.toggle('active',tab==='chat');
  document.getElementById('mtDetalle').classList.toggle('active',tab==='detalle');
  document.getElementById('mtChat').classList.toggle('active',tab==='chat');
}

function openModal(r){
  if(typeof r==='string')r=JSON.parse(r);
  document.getElementById('modalNombre').textContent='OT '+(r.ot||'—');
  document.getElementById('modalTs').textContent=r.fecha+(r.hora?' · '+r.hora:'');
  const lat=parseFloat(fixCoord(r.lat)),lng=parseFloat(fixCoord(r.lng));
  const hasGeo=!isNaN(lat)&&!isNaN(lng)&&lat!==0;
  const seg=getSegByOt(r.ot,r.cliente);
  const eKey=seg?((seg.estado||'').toLowerCase().replace(/ /g,'-')||''):'';
  const em=ESTADO_META[eKey]||ESTADO_META[''];
  const priA=seg?(seg.prioridad_aprobada||''):'',priS=seg?(seg.prioridad_sugerida||''):'';
  let segHTML='';

  if(currentRole==='tecnico'){
    segHTML=`<div class="modal-sec">🔧 Seguimiento técnico</div><div class="seguimiento-section"><div class="seg-title">✏️ Devolución</div>${seg&&seg.comentario?`<div class="seg-last">Última devolución: <strong>${em.icon} ${em.label}</strong><br>"${escapeHTML(seg.comentario)}"${seg.fecha?`<span class="seg-ts">${escapeHTML(seg.tecnico)} · ${seg.fecha}</span>`:''}</div>`:''}<div class="seg-form"><label>Estado</label><select data-mid="segEstado"><option value="resuelto" ${eKey==='resuelto'?'selected':''}>✅ Resuelto</option><option value="retiro" ${eKey==='retiro'?'selected':''}>📦 Retiro</option><option value="pendiente" ${eKey==='pendiente'?'selected':''}>⏳ Pendiente</option><option value="cliente-cerrado" ${eKey==='cliente-cerrado'?'selected':''}>🔴 Cliente Cerrado</option></select><label>Devolución<span style="color:#DC2626">*</span></label><textarea data-mid="segComentario" placeholder="Describí el estado del equipo (obligatorio)...">${seg?escapeHTML(seg.comentario):''}</textarea><label style="margin-top:8px;">Ubicación al resolver<span style="color:#DC2626">*</span></label><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;"><button type="button" data-mid="geoTecBtn" onclick="geoTecnico()" style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--navy);font-family:'Bricolage Grotesque',sans-serif;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><span data-mid="geoTecIcon">📍 Obtener ubicación</span><span data-mid="geoTecSpin" style="display:none;">⏳ Obteniendo...</span></button></div><div data-mid="geoTecResult" style="font-size:12px;margin-bottom:8px;min-height:16px;"></div><input type="hidden" data-mid="geoTecLat" value=""><input type="hidden" data-mid="geoTecLng" value=""><button class="btn-guardar" data-mid="btnGuardar" onclick="guardarSeguimiento('${escapeHTML(r.cliente)}','${escapeHTML(r.nombre)}','${escapeHTML(r.ot)}','tecnico')">💾 Guardar devolución</button><div class="save-ok" data-mid="saveOk">✅ Guardado correctamente</div></div></div>`;
  }else if(currentRole==='supervisor'){
    const tLat=seg?fixCoord(seg.tec_lat):'',tLng=seg?fixCoord(seg.tec_lng):'';
    segHTML=`<div class="modal-sec">📋 Seguimiento</div><div class="seguimiento-section"><div class="seg-title">⭐ Sugerir prioridad</div>${seg&&seg.comentario?`<div class="seg-last"><strong>${em.icon} ${em.label}</strong><br>"${escapeHTML(seg.comentario)}"${seg.fecha?`<span class="seg-ts">${escapeHTML(seg.tecnico)} · ${seg.fecha}</span>`:''}</div>`:''} ${tLat&&tLng?`<div class="seg-last">📍 <a href="https://www.google.com/maps/search/?api=1&query=${tLat},${tLng}" target="_blank" style="color:var(--blue);font-weight:600;">Ver ubicación del técnico</a></div>`:''}<div class="seg-form"><label>Prioridad sugerida ${priA?`<span style="color:var(--success)">· Aprobada: P${priA} por ${escapeHTML(seg.aprobado_por)}</span>`:''}</label><select data-mid="segPriSug"><option value="">Sin prioridad</option><option value="1" ${priS=='1'?'selected':''}>⚠️ P1 — REPAGO</option><option value="2" ${priS=='2'?'selected':''}>⚠️ P2 — EJECUCIÓN</option><option value="3" ${priS=='3'?'selected':''}>P3 — PTC SUGERIDO</option><option value="4" ${priS=='4'?'selected':''}>P4</option><option value="5" ${priS=='5'?'selected':''}>P5</option></select><button class="btn-guardar" data-mid="btnGuardar" onclick="guardarSeguimiento('${escapeHTML(r.cliente)}','${escapeHTML(r.nombre)}','${escapeHTML(r.ot)}','supervisor')">💾 Guardar prioridad</button><div class="save-ok" data-mid="saveOk">✅ Guardado correctamente</div></div></div>`;
  }else if(currentRole==='trade'){
    const tLat=seg?fixCoord(seg.tec_lat):'',tLng=seg?fixCoord(seg.tec_lng):'';
    segHTML=`<div class="modal-sec">✅ Aprobación de prioridad</div><div class="seguimiento-section" style="background:#F5F3FF;border-color:#DDD6FE;"><div class="seg-title" style="color:#7C3AED;">🔐 Trade Marketing</div>${priS?`<div class="seg-last">Prioridad sugerida: <strong>P${priS}</strong></div>`:'<div class="seg-last" style="color:var(--muted)">Sin prioridad sugerida aún.</div>'}${seg&&seg.comentario?`<div class="seg-last"><strong>${em.icon} ${em.label}</strong><br>"${escapeHTML(seg.comentario)}"</div>`:''}${tLat&&tLng?`<div class="seg-last">📍 <a href="https://www.google.com/maps/search/?api=1&query=${tLat},${tLng}" target="_blank" style="color:#7C3AED;font-weight:600;">Ver ubicación del técnico</a></div>`:''}<div class="seg-form"><label>Aprobar prioridad</label><select data-mid="segPriApr" style="border-color:#DDD6FE;"><option value="">Sin prioridad</option><option value="1" ${priA=='1'?'selected':''}>⚠️ P1 — REPAGO</option><option value="2" ${priA=='2'?'selected':''}>⚠️ P2 — EJECUCIÓN</option><option value="3" ${priA=='3'?'selected':''}>P3 — PTC SUGERIDO</option><option value="4" ${priA=='4'?'selected':''}>P4</option><option value="5" ${priA=='5'?'selected':''}>P5</option></select><button class="btn-guardar" data-mid="btnGuardar" style="background:#7C3AED;" onclick="guardarSeguimiento('${escapeHTML(r.cliente)}','${escapeHTML(r.nombre)}','${escapeHTML(r.ot)}','trade')">✅ Aprobar prioridad</button><div class="save-ok" data-mid="saveOk">✅ Aprobado correctamente</div></div></div><div class="modal-sec" style="margin-top:12px;">🚨 Forzar cierre de OT</div><div class="seguimiento-section" style="background:#FEF2F2;border-color:#FECACA;"><div class="seg-title" style="color:#DC2626;">Archivar manualmente</div><div class="seg-form"><label style="color:#DC2626;">Estado de cierre</label><select data-mid="segEstadoTrade" style="border-color:#FECACA;"><option value="resuelto">✅ Resuelto (Forzado)</option><option value="retiro">📦 Retiro (Forzado)</option><option value="cliente-cerrado">🔴 Cliente Cerrado</option></select><label style="color:#DC2626;">Comentario / Motivo</label><textarea data-mid="segComentarioTrade" placeholder="Ej: Se cancela la orden porque..." style="border-color:#FECACA;min-height:60px;margin-bottom:8px;"></textarea><button class="btn-guardar" style="background:#DC2626;" onclick="guardarSeguimiento('${escapeHTML(r.cliente)}','${escapeHTML(r.nombre)}','${escapeHTML(r.ot)}','trade-cerrar')">🔒 Cerrar y enviar a Historial</button></div></div>`;
  }

  const fotoDirectUrl = getDirectImageUrl(r.foto);
  const fotoHTML = (r.foto && r.foto.trim()) ? `<div class="modal-sec">📸 Foto Adjunta</div><div style="margin-bottom:16px;"><a href="${escapeHTML(r.foto)}" target="_blank" style="display:inline-block;border-radius:12px;overflow:hidden;border:1.5px solid var(--border);box-shadow:0 4px 12px rgba(0,0,0,0.06);max-width:240px;position:relative;background:#F1F5F9;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'"><img src="${escapeHTML(fotoDirectUrl)}" alt="Foto del equipo" style="width:100%;height:auto;display:block;max-height:200px;object-fit:cover;"><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(15,23,42,0.75);color:white;font-size:11px;font-weight:600;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:6px;backdrop-filter:blur(4px);"><span>🔍 Ver Foto Completa</span></div></a></div>` : '';

  document.getElementById('mtDetalle').innerHTML=`<div class="modal-sec">Detalle del registro</div><div class="modal-grid"><div class="mf"><label>N° OT</label><p style="font-family:'DM Mono',monospace;font-size:13px;font-weight:800;color:var(--navy)">${escapeHTML(r.ot)||'—'}</p></div><div class="mf"><label>Código Cliente</label><p>${escapeHTML(r.cliente)||'—'}</p></div><div class="mf full"><label>Promotor</label><p>${escapeHTML(r.nombre)}</p></div><div class="mf"><label>Marca Heladera</label><p>${escapeHTML(r.marca)||'—'}</p></div><div class="mf"><label>EDF</label><p>${escapeHTML(r.edf)||'—'}</p></div><div class="mf"><label>GPS</label><p style="font-family:'DM Mono',monospace;font-size:12px">${hasGeo?lat.toFixed(5)+','+lng.toFixed(5):'Sin coordenadas'}</p></div><div class="mf full"><label>Falla Sugerida</label><p>${escapeHTML(r.falla||'—')}</p></div>${r.razon_social?`<div class="mf full" style="background:#F5F3FF;border:1px solid #DDD6FE;"><label>Razón Social</label><p>${escapeHTML(r.razon_social)}</p></div>`:''}${r.direccion?`<div class="mf full" style="background:#F5F3FF;border:1px solid #DDD6FE;"><label>Dirección</label><p>${escapeHTML(r.direccion)}</p></div>`:''}<div class="mf" style="background:#F5F3FF;border:1px solid #DDD6FE;"><label>Localidad</label><p>${escapeHTML(r.localidad)||'—'}</p></div><div class="mf" style="background:#F5F3FF;border:1px solid #DDD6FE;"><label>Frecuencia de visita</label><p style="font-weight:700;color:${getFrecColor(r.frecuencia)}">${escapeHTML(r.frecuencia)||'—'}</p></div>${r.notas?`<div class="mf full"><label>Notas</label><p>${escapeHTML(r.notas)}</p></div>`:''}</div>${fotoHTML}${hasGeo?`<div class="modal-sec">Ubicación</div><div class="modal-map-wrap"><div class="map-hint">👉 Dos dedos para mover el mapa</div><div id="modalMap"></div></div><a class="btn-maps" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank">📍 Abrir en Google Maps</a>`:''}${segHTML}`;

  const chatMsgs=chatData[r.ot]||[];
  const msgsTecSup=chatMsgs.filter(m=>m.chat_tipo==='tec-sup');
  const msgsTecTrade=chatMsgs.filter(m=>m.chat_tipo==='tec-trade');
  const msgsSupTrade=chatMsgs.filter(m=>m.chat_tipo==='sup-trade');
  let chatTabHTML='';
  if(currentRole==='tecnico')chatTabHTML=`<div class="modal-sec">💬 Chat con Supervisor</div>${buildChatBox(msgsTecSup,'tec-sup',r.ot)}<div class="modal-sec" style="margin-top:16px;">💬 Chat con Trade</div>${buildChatBox(msgsTecTrade,'tec-trade',r.ot)}`;
  else if(currentRole==='supervisor')chatTabHTML=`<div class="modal-sec">💬 Chat con Técnico</div>${buildChatBox(msgsTecSup,'tec-sup',r.ot)}<div class="modal-sec" style="margin-top:16px;">💬 Chat con Trade</div>${buildChatBox(msgsSupTrade,'sup-trade',r.ot)}`;
  else if(currentRole==='trade')chatTabHTML=`<div class="modal-sec">💬 Chat con Técnico</div>${buildChatBox(msgsTecTrade,'tec-trade',r.ot)}<div class="modal-sec" style="margin-top:16px;">💬 Chat con Supervisor</div>${buildChatBox(msgsSupTrade,'sup-trade',r.ot)}`;

  document.getElementById('mtChat').innerHTML=chatTabHTML;
  document.getElementById('modalTabs').style.display='flex';
  switchModalTab('detalle');
  if(currentRole==='tecnico')setTimeout(()=>geoTecnico(),300);
  document.getElementById('modalOverlay').classList.add('show');
  if(hasGeo){setTimeout(()=>{if(modalLeaf){modalLeaf.remove();modalLeaf=null;}modalLeaf=L.map('modalMap',{zoomControl:true,attributionControl:false,dragging:!L.Browser.mobile,scrollWheelZoom:false}).setView([lat,lng],15);modalLeaf.on('focus',()=>modalLeaf.dragging.enable());if(L.Browser.mobile)modalLeaf.addHandler('touchZoom',L.TouchZoom);L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(modalLeaf);L.circleMarker([lat,lng],{radius:8,fillColor:'#1E88E5',color:'white',weight:2.5,fillOpacity:1}).addTo(modalLeaf);},60);}
}

function toggleMultiFilter(id){const dropdown=document.getElementById(id+'Dropdown');document.querySelectorAll('.multi-filter-dropdown.open').forEach(d=>{if(d.id!==id+'Dropdown')d.classList.remove('open');});dropdown.classList.toggle('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.multi-filter'))document.querySelectorAll('.multi-filter-dropdown.open').forEach(d=>d.classList.remove('open'));});
function getMultiFilterValues(id){const dropdown=document.getElementById(id+'Dropdown');if(!dropdown)return[];return[...dropdown.querySelectorAll('input[type=checkbox]:checked')].map(cb=>cb.value);}
function updateMultiFilterLabel(id,defaultLabel){const vals=getMultiFilterValues(id),label=document.getElementById(id+'Label'),btn=document.querySelector('#'+id+' .multi-filter-btn');if(!label)return;if(vals.length===0){label.textContent=defaultLabel;btn.classList.remove('active');}else if(vals.length===1){label.textContent=vals[0];btn.classList.add('active');}else{label.textContent=vals.length+' seleccionados';btn.classList.add('active');}}
function closeModal(e){if(e.target===document.getElementById('modalOverlay'))closeModalDirect();}
function closeModalDirect(){document.getElementById('modalOverlay').classList.remove('show');if(modalLeaf){modalLeaf.remove();modalLeaf=null;}}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModalDirect();});
function generarLogs() {
  const eventos = [];
  
  // 1. Creaciones de OT (desde allData)
  allData.forEach(r => {
    if(!r.timestamp) return;
    eventos.push({
      tipo: 'form',
      ts: new Date(r.timestamp),
      fechaFormato: r.fecha || formatFechaAR(new Date(r.timestamp)),
      ot: r.ot || '—',
      cliente: r.cliente || '—',
      autor: r.nombre || 'Desconocido',
      msg: `Cargó una nueva OT para el cliente: <strong>${r.cliente || '—'}</strong>`
    });
  });

  // 2. Eventos de Seguimientos (desde seguimientosRaw)
  if(seguimientosRaw && seguimientosRaw.length > 1) {
    const h = seguimientosRaw[0].map(s=>(s||'').toString().trim().toLowerCase());
    const col=n=>h.findIndex(s=>s.includes(n));
    const iTs=col('timestamp'),iOt=col('ot'),iCli=col('cliente'),iEst=col('estado'),iCom=col('comentario'),iTec=col('tecnico'),iPriApr=col('prioridad_aprobada'),iAprPor=col('aprobado_por');
    
    seguimientosRaw.slice(1).forEach(c => {
      const tsRaw = (c[iTs]||'').toString();
      if(!tsRaw) return;
      const ts = new Date(tsRaw);
      if(isNaN(ts)) return;
      
      const estado = (c[iEst]||'').toString().trim();
      const pri = (c[iPriApr]||'').toString().trim();
      const tecnico = (c[iTec]||'').toString().trim();
      const aprobadoPor = (c[iAprPor]||'').toString().trim();
      const comentario = (c[iCom]||'').toString().trim();
      
      let autor = '';
      let msg = '';
      
      if(estado) {
        autor = tecnico || 'Técnico';
        msg = `Cambió el estado a <strong>${estado}</strong>`;
        if(comentario) msg += `<br><small style="color:var(--muted)">Comentario: ${comentario}</small>`;
      } else if (pri) {
        autor = aprobadoPor || 'Supervisor/Trade';
        msg = `Asignó <strong>Prioridad ${pri}</strong>`;
      } else {
        return; // Ignore empty updates
      }
      
      eventos.push({
        tipo: 'seg',
        ts: ts,
        fechaFormato: formatFechaAR(ts),
        ot: (c[iOt]||'').toString().trim() || '—',
        cliente: (c[iCli]||'').toString().trim() || '—',
        autor: autor,
        msg: msg
      });
    });
  }
  
  // Sort descending
  eventos.sort((a,b) => b.ts - a.ts);
  return eventos;
}

function renderLogs() {
  const container = document.getElementById('logsTimeline');
  if(!container) return;
  
  const q = (document.getElementById('lFiltBusqueda').value || '').toLowerCase();
  const dFiltro = document.getElementById('lFiltFecha').value; // YYYY-MM-DD
  
  const eventos = generarLogs();
  
  let html = '';
  let count = 0;
  
  for(let ev of eventos) {
    if(q && !ev.ot.toLowerCase().includes(q) && !ev.cliente.toLowerCase().includes(q) && !ev.autor.toLowerCase().includes(q)) continue;
    if(dFiltro) {
      const evDate = new Date(ev.ts.getTime() - (ev.ts.getTimezoneOffset() * 60000)).toISOString().slice(0,10);
      if(evDate !== dFiltro) continue;
    }
    
    const icon = ev.tipo === 'form' ? '📄' : '✏️';
    
    html += `
    <div class="timeline-item">
      <div class="timeline-icon ${ev.tipo}">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span><strong>${ev.autor}</strong> &bull; OT ${ev.ot}</span>
          <span>${ev.fechaFormato}</span>
        </div>
        <div class="timeline-body">
          ${ev.msg}
        </div>
      </div>
    </div>`;
    count++;
    if(count > 200) break; // Limit to 200 items for performance
  }
  
  if(count === 0) {
    html = `<div style="text-align:center;color:var(--muted);padding:30px;">No se encontraron eventos.</div>`;
  }
  
  container.innerHTML = html;
}
let chartEstadosInstance, chartMarcasInstance, chartTecnicosInstance, chartPrioridadesInstance, chartTiemposInstance;

function renderDashboard() {
  if (currentRole !== 'auditor') return;

  const hidraMap = new Map();
  historialData.forEach(h => {
    if(!h.cliente) return;
    const c = h.cliente.toString().trim().toUpperCase();
    const hTs = new Date(h.ts||0).getTime(); // resolution timestamp in historial
    if(!hidraMap.has(c) || hidraMap.get(c) < hTs) hidraMap.set(c, hTs);
  });

  const unicos = [];
  const clientVistoActivo = new Set();
  
  allData.forEach(r => {
    const cliKey = r.cliente ? r.cliente.toString().trim().toUpperCase() : '';
    const myTs = new Date(r.timestamp||0).getTime(); // real creation timestamp
    
    const seg = getSegByOt(r.ot, r.cliente);
    const estado = (seg && seg.estado) ? seg.estado.toLowerCase() : 'pendiente';
    const isResolved = estado === 'resuelto' || estado.includes('retiro');

    if (isResolved) {
      unicos.push(r);
    } else {
      if (cliKey && hidraMap.has(cliKey) && myTs < hidraMap.get(cliKey)) return;
      if (!cliKey || !clientVistoActivo.has(cliKey)) {
        if (cliKey) clientVistoActivo.add(cliKey);
        unicos.push(r);
      }
    }
  });

  const dataLimpia = unicos;

  const timelinePorOT = {};
  if(seguimientosRaw && seguimientosRaw.length > 1) {
    const h = seguimientosRaw[0].map(s=>(s||'').toString().trim().toLowerCase());
    const iOt = h.findIndex(x=>x.includes('ot'));
    const iTs = h.findIndex(x=>x === 'timestamp'); // Columna A
    const iTecTs = h.findIndex(x=>x === 'tec_timestamp'); // Columna M
    const iEst = h.findIndex(x=>x.includes('estado'));
    const iPriSug = h.findIndex(x=>x==='prioridad_sugerida');
    const iPriApr = h.findIndex(x=>x==='prioridad_aprobada');

    if(iOt>=0 && iTs>=0 && iEst>=0) {
      seguimientosRaw.slice(1).forEach(row => {
        const ot = row[iOt];
        if(!ot) return;
        if(!timelinePorOT[ot]) timelinePorOT[ot] = [];
        timelinePorOT[ot].push({
          ts: new Date(row[iTs]).getTime(),
          tecTs: (iTecTs >= 0 && row[iTecTs]) ? new Date(row[iTecTs]).getTime() : null,
          est: row[iEst].toString().toLowerCase().trim(),
          priSug: iPriSug>=0 ? row[iPriSug].toString().trim() : '',
          priApr: iPriApr>=0 ? row[iPriApr].toString().trim() : ''
        });
      });
    }
  }

  let activas = 0, resueltas = 0, retiro = 0;
  let pdvCount = {}, prioridadesCount = {};

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonthStr = prevDate.toISOString().slice(0, 7);

  let creadasEsteMes = 0, creadasMesPasado = 0;
  let resueltasEsteMes = 0, resueltasMesPasado = 0;

  // SLA Stats Mes a Mes
  let sumSuperEste = 0, countSuperEste = 0;
  let sumTecnicoEste = 0, countTecnicoEste = 0;
  let sumTotalEste = 0, countTotalEste = 0;

  let sumSuperPasado = 0, countSuperPasado = 0;
  let sumTecnicoPasado = 0, countTecnicoPasado = 0;
  let sumTotalPasado = 0, countTotalPasado = 0;

  const otsConfiguradas = new Set();
  const procesarTiempos = (otId, baseTs) => {
    if(!otId || otsConfiguradas.has(otId)) return null;
    otsConfiguradas.add(otId);
    
    const tl = timelinePorOT[otId] || [];
    tl.sort((a,b) => a.ts - b.ts);
    
    let T0 = baseTs ? new Date(baseTs).getTime() : (tl.length > 0 ? tl[0].ts : null);
    if(!T0 || isNaN(T0)) return null;

    let T1 = null, T2 = null;
    const priEvent = tl.find(ev => ev.priSug !== '' || ev.priApr !== '');
    if(priEvent) T1 = priEvent.ts;

    const resEvent = tl.find(ev => ev.est === 'resuelto' || ev.est.includes('retiro'));
    if(resEvent) T2 = resEvent.tecTs || resEvent.ts; // Usa Columna M si existe, sino Columna A

    const msToHs = (ms) => ms / (1000 * 60 * 60);

    if (T0 && T2 && T2 >= T0) {
      let resStr = '';
      try {
        const d2 = new Date(T2);
        if(isNaN(d2)) return null;
        resStr = d2.toISOString().slice(0, 7);
      } catch(e) { return null; }
      if (resStr === currentMonthStr) {
        sumTotalEste += msToHs(T2 - T0); countTotalEste++;
      } else if (resStr === prevMonthStr) {
        sumTotalPasado += msToHs(T2 - T0); countTotalPasado++;
      }

      if (T1 && T1 >= T0 && T2 >= T1) {
        if (resStr === currentMonthStr) {
          sumSuperEste += msToHs(T1 - T0); countSuperEste++;
          sumTecnicoEste += msToHs(T2 - T1); countTecnicoEste++;
        } else if (resStr === prevMonthStr) {
          sumSuperPasado += msToHs(T1 - T0); countSuperPasado++;
          sumTecnicoPasado += msToHs(T2 - T1); countTecnicoPasado++;
        }
      } else {
        if (resStr === currentMonthStr) {
          sumTecnicoEste += msToHs(T2 - T0); countTecnicoEste++;
        } else if (resStr === prevMonthStr) {
          sumTecnicoPasado += msToHs(T2 - T0); countTecnicoPasado++;
        }
      }
    }

    return T2; 
  };

  dataLimpia.forEach(r => {
    const seg = getSegByOt(r.ot, r.cliente);
    const estado = (seg && seg.estado) ? seg.estado.toLowerCase() : 'pendiente';
    
    if (estado.includes('retiro')) retiro++;
    else if (estado === 'resuelto') resueltas++;
    else activas++;

    const pri = (seg && seg.prioridad_aprobada) ? seg.prioridad_aprobada.toString().trim() : 'Sin Asignar';
    if(estado !== 'resuelto' && !estado.includes('retiro')) {
      prioridadesCount[pri] = (prioridadesCount[pri] || 0) + 1;
    }
  });

  const clientInfo = {};
  allData.forEach(r => {
    if (r.cliente) clientInfo[r.cliente] = { loc: r.localidad||'-', prom: r.nombre||'-', sup: r.supervisor||'-' };
  });
  historialData.forEach(h => {
    if (h.cliente && !clientInfo[h.cliente]) clientInfo[h.cliente] = { loc: '-', prom: h.promotor||'-', sup: h.supervisor||'-' };
  });

  const allUniqueOts = new Map();
  allData.forEach(r => { if(r.ot && r.timestamp) allUniqueOts.set(r.ot, { ts: r.timestamp, marca: r.marca, cli: r.cliente }); });
  historialData.forEach(h => { if(h.ot && h.ts) allUniqueOts.set(h.ot, { ts: h.ts, marca: h.marca, cli: h.cliente }); });

  let marcasEsteMes = {}, marcasMesPasado = {};
      pdvCount = {};
  
    allUniqueOts.forEach((otData, otId) => {
    const pdv = otData.cli || 'Desconocido';
    if (!pdvCount[pdv]) {
      const info = clientInfo[pdv] || {loc:'-', prom:'-', sup:'-'};
      pdvCount[pdv] = { total: 0, loc: info.loc, prom: info.prom, sup: info.sup };
    }
    pdvCount[pdv].total++;

    if(!otData.ts) return;
      let tsStr = '';
      try {
        const d = new Date(otData.ts);
        if(isNaN(d)) return;
        tsStr = d.toISOString().slice(0, 7);
      } catch(e) {
        return;
      }
      
      if(tsStr === currentMonthStr) creadasEsteMes++;
    else if(tsStr === prevMonthStr) creadasMesPasado++;

    const marca = (otData.marca || 'Sin Marca').toUpperCase().trim();
    if(tsStr === currentMonthStr) marcasEsteMes[marca] = (marcasEsteMes[marca] || 0) + 1;
    else if(tsStr === prevMonthStr) marcasMesPasado[marca] = (marcasMesPasado[marca] || 0) + 1;

    const T2 = procesarTiempos(otId, otData.ts);
    if(T2) {
        let resStr = '';
        try {
          const d2 = new Date(T2);
          if(isNaN(d2)) return;
          resStr = d2.toISOString().slice(0, 7);
        } catch(e) { return; }
      if(resStr === currentMonthStr) resueltasEsteMes++;
      else if(resStr === prevMonthStr) resueltasMesPasado++;
    }
  });

  // Calculate SLA Averages
  const avgSuperEste = countSuperEste > 0 ? (sumSuperEste / countSuperEste) : 0;
  const avgTecnicoEste = countTecnicoEste > 0 ? (sumTecnicoEste / countTecnicoEste) : 0;
  const avgTotalEste = countTotalEste > 0 ? (sumTotalEste / countTotalEste) : 0;

  const avgSuperPasado = countSuperPasado > 0 ? (sumSuperPasado / countSuperPasado) : 0;
  const avgTecnicoPasado = countTecnicoPasado > 0 ? (sumTecnicoPasado / countTecnicoPasado) : 0;
  const avgTotalPasado = countTotalPasado > 0 ? (sumTotalPasado / countTotalPasado) : 0;

  Chart.register(ChartDataLabels);
  const commonOptions = { 
    responsive: true, 
    maintainAspectRatio: false,
    plugins: {
      datalabels: {
        color: '#fff',
        font: { weight: 'bold', size: 14 },
        formatter: Math.round,
        display: function(context) { return context.dataset.data[context.dataIndex] > 0; }
      }
    }
  };

  if (chartEstadosInstance) chartEstadosInstance.destroy();
  chartEstadosInstance = new Chart(document.getElementById('chartEstados'), {
    type: 'doughnut',
    data: {
      labels: ['Activas/Pendientes', 'Resueltas', 'En Retiro'],
      datasets: [{
        data: [activas, resueltas, retiro],
        backgroundColor: ['#EAB308', '#22C55E', '#8B5CF6'],
        borderWidth: 0
      }]
    },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, legend: { position: 'bottom' } } }
  });

  if (chartMarcasInstance) chartMarcasInstance.destroy();
  const marcasLabels = Array.from(new Set([...Object.keys(marcasEsteMes), ...Object.keys(marcasMesPasado)])).sort((a,b) => (marcasEsteMes[b]||0) - (marcasEsteMes[a]||0)).slice(0, 10);
  chartMarcasInstance = new Chart(document.getElementById('chartMarcas'), {
    type: 'bar',
    data: {
      labels: marcasLabels,
      datasets: [
        { label: 'Mes Actual', data: marcasLabels.map(l => marcasEsteMes[l]||0), backgroundColor: '#3B82F6', borderRadius: 6 },
        { label: 'Mes Anterior', data: marcasLabels.map(l => marcasMesPasado[l]||0), backgroundColor: '#9CA3AF', borderRadius: 6 }
      ]
    },
    options: { 
      ...commonOptions, 
      plugins: { 
        ...commonOptions.plugins,
        legend: { position: 'bottom' },
        datalabels: { color: '#fff', anchor: 'center', align: 'center', font: { weight: 'bold' }, formatter: (v)=>v||'' }
      } 
    }
  });

  if (chartTecnicosInstance) chartTecnicosInstance.destroy();
  chartTecnicosInstance = new Chart(document.getElementById('chartTecnicos'), {
    type: 'bar',
    data: {
      labels: ['Mes Pasado', 'Este Mes'],
      datasets: [
        { label: 'OTs Creadas', data: [creadasMesPasado, creadasEsteMes], backgroundColor: '#94A3B8', borderRadius: 6 },
        { label: 'OTs Resueltas', data: [resueltasMesPasado, resueltasEsteMes], backgroundColor: '#10B981', borderRadius: 6 }
      ]
    },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, legend: { position: 'bottom' }, datalabels: { color: '#fff', anchor: 'center', align: 'center', font: { weight: 'bold' } } } }
  });

  if (chartPrioridadesInstance) chartPrioridadesInstance.destroy();
  chartPrioridadesInstance = new Chart(document.getElementById('chartPrioridades'), {
    type: 'pie',
    data: {
      labels: Object.keys(prioridadesCount),
      datasets: [{
        data: Object.values(prioridadesCount),
        backgroundColor: ['#CBD5E1', '#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FEF2F2'],
        borderWidth: 1
      }]
    },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, legend: { position: 'right' }, datalabels: { color: '#0F2A4A', font: { weight: 'bold' } } } }
  });

  if (chartTiemposInstance) chartTiemposInstance.destroy();
  chartTiemposInstance = new Chart(document.getElementById('chartTiempos'), {
    type: 'bar',
    data: {
      labels: ['Supervisor (Aprobación)', 'Técnico (Resolución)', 'Demora Total'],
      datasets: [
        {
          label: 'Mes Pasado',
          data: [avgSuperPasado, avgTecnicoPasado, avgTotalPasado],
          backgroundColor: '#94A3B8',
          borderRadius: 6
        },
        {
          label: 'Este Mes',
          data: [avgSuperEste, avgTecnicoEste, avgTotalEste],
          backgroundColor: '#6366F1',
          borderRadius: 6
        }
      ]
    },
    options: { 
      ...commonOptions,
      indexAxis: 'y',
      plugins: { 
        ...commonOptions.plugins, 
        legend: { position: 'bottom' }, 
        datalabels: { 
          color: '#fff', 
          anchor: 'center', 
          align: 'center', 
          font: { weight: 'bold', size: 12 },
          formatter: function(value) {
            if(!value || value===0) return '';
            if(value >= 72) return (value/24).toFixed(1) + ' días';
            return Math.round(value) + ' hs';
          }
        } 
      } 
    }
  });

  const topPdvs = Object.keys(pdvCount).filter(k => pdvCount[k].total > 1 && k !== 'Desconocido').map(k => ({ nombre: k, ...pdvCount[k] })).sort((a, b) => b.total - a.total).slice(0, 10);
  const tbodyPDVs = document.getElementById('tablaPDVs');
  if(topPdvs.length > 0) {
    tbodyPDVs.innerHTML = topPdvs.map(p => `<tr><td style="font-weight:600;font-size:12px;">${p.nombre}</td><td style="font-size:11px;">${p.prom}</td><td style="font-size:11px;">${p.sup}</td><td style="font-size:11px;">${p.loc}</td><td style="font-weight:bold;color:var(--red);text-align:center;">${p.total}</td></tr>`).join('');
  } else {
    tbodyPDVs.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">No hay PDVs con reincidencias</td></tr>`;
  }
}

