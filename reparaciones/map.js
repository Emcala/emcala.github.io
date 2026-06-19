function initMap(){
  if(leafMap)return;
  leafMap=L.map('map',{scrollWheelZoom:!L.Browser.mobile,dragging:!L.Browser.mobile,tap:false}).setView([-34.45,-58.70],11);
  if(L.Browser.mobile){leafMap.on('touchstart',function(e){if(e.originalEvent.touches.length>=2)leafMap.dragging.enable();else leafMap.dragging.disable();});leafMap.on('touchend',function(){leafMap.dragging.disable();});}
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO',maxZoom:19}).addTo(leafMap);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(leafMap);
  if(typeof L.Control!=='undefined'&&L.Control.Measure&&currentRole==='trade')L.control.measure({position:'topleft',primaryLengthUnit:'kilometers',secondaryLengthUnit:'meters',activeColor:'#0EA5E9',completedColor:'#0F2A4A'}).addTo(leafMap);
  if(L.Browser.mobile)document.getElementById('mapHintMain').style.display='block';
  // Botón ubicación actual
  const locBtn = L.DomUtil.create('button');
  locBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#1B5FA8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  locBtn.title = 'Mi ubicación';
  locBtn.style.cssText = 'position:absolute;bottom:80px;right:10px;z-index:1000;width:40px;height:40px;background:white;border:2px solid #1B5FA8;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;';
  document.getElementById('map').appendChild(locBtn);
  locBtn.addEventListener('click', centrarEnUbicacion);
}

function ageColor(ts){if(!ts)return'#94A3B8';const days=(Date.now()-new Date(ts))/86400000;if(days<=15)return'#16A34A';if(days<=20)return'#D97706';return'#DC2626';}

function updateMap(data){
  if(!leafMap)return;
  markers.forEach(m=>leafMap.removeLayer(m));markers=[];
  const valid=data.filter(r=>{const lat=parseFloat(fixCoord(r.lat)),lng=parseFloat(fixCoord(r.lng));return !isNaN(lat)&&!isNaN(lng)&&lat!==0&&lng!==0;});
  document.getElementById('mapCount').textContent=valid.length+' punto'+(valid.length!==1?'s':'');
  const bounds=[];
  valid.forEach(r=>{
    const lat=parseFloat(fixCoord(r.lat)),lng=parseFloat(fixCoord(r.lng));
    const color=ageColor(r.ts);
    const priAprobada=getPrioridadAprobada(r.ot,r.cliente),priSugerida=getPrioridadSugerida(r.ot,r.cliente),priShow=priAprobada||priSugerida;
    const icon=L.divIcon({html:`<div style="position:relative;width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;">${priShow?`<span style="color:white;font-size:11px;font-weight:800;line-height:1;">${priShow}</span>`:''}</div>`,className:'',iconSize:[28,28],iconAnchor:[14,14]});
    const seg=seguimientos[r.cliente];
    const segLabel=seg?`<br><small style="color:#059669;font-weight:600">${ESTADO_META[seg.estado]?.icon||''} ${ESTADO_META[seg.estado]?.label||seg.estado}</small>`:'';
    const mk=L.marker([lat,lng],{icon}).bindPopup(`<strong style="color:#0F2A4A">OT ${r.ot||'—'}</strong><br><small style="color:#555">${r.cliente||'Sin cliente'}</small><br><small style="color:#555">👤 ${r.nombre}</small>${segLabel}<br><small style="color:#888">${r.fecha} ${r.hora}</small>`).addTo(leafMap);
    mk.on('click',()=>openModal(r));markers.push(mk);bounds.push([lat,lng]);
  });
  setTimeout(()=>{leafMap.invalidateSize();if(bounds.length>0)leafMap.fitBounds(bounds,{padding:[40,40],maxZoom:14});else leafMap.setView([-34.45,-58.70],11);},250);
  document.getElementById('mapLegend').innerHTML='<div class="legend-item"><div class="legend-dot" style="background:#16A34A"></div>Hasta 15 días</div><div class="legend-item"><div class="legend-dot" style="background:#D97706"></div>15–20 días</div><div class="legend-item"><div class="legend-dot" style="background:#DC2626"></div>21+días</div><div class="legend-item"><div class="legend-dot" style="background:#94A3B8"></div>Sin fecha</div>';
}
let marcadorUbicacion = null;
function centrarEnUbicacion() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    leafMap.setView([lat, lng], 15);
    if (marcadorUbicacion) leafMap.removeLayer(marcadorUbicacion);
    marcadorUbicacion = L.circleMarker([lat, lng], {
      radius: 10, fillColor: '#1B5FA8', color: 'white',
      weight: 3, fillOpacity: 1
    }).addTo(leafMap).bindPopup('📍 Tu ubicación').openPopup();
  }, null, {enableHighAccuracy: true, timeout: 10000});
}
function geoTecnico(){
  const modal = document.getElementById('modalOverlay');
  const btn = modal.querySelector('[data-mid="geoTecBtn"]');
  const icon = modal.querySelector('[data-mid="geoTecIcon"]');
  const spin = modal.querySelector('[data-mid="geoTecSpin"]');
  const res = modal.querySelector('[data-mid="geoTecResult"]');
  const latInput = modal.querySelector('[data-mid="geoTecLat"]');
  const lngInput = modal.querySelector('[data-mid="geoTecLng"]');

  if(!navigator.geolocation){
    res.style.color='#DC2626';
    res.textContent='Tu dispositivo no soporta geolocalización.';
    return;
  }

  icon.style.display='none'; spin.style.display=''; btn.disabled=true;

  let bestPos = null, readings = 0;
  const MAX_READINGS = 4, MIN_ACCURACY = 50;
  let watchId = null, timeoutId = null;

  function done(pos){
    navigator.geolocation.clearWatch(watchId);
    clearTimeout(timeoutId);
    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    const acc = Math.round(pos.coords.accuracy);
    latInput.value = lat; lngInput.value = lng;
    const accColor = acc<=20?'#16A34A':acc<=50?'#D97706':'#DC2626';
    res.style.color = accColor;
    res.textContent = `✅ Ubicación capturada: ${lat},${lng} (±${acc}m)`;
    icon.style.display=''; spin.style.display='none'; btn.disabled=false;
  }

  function fail(err){
    if(watchId) navigator.geolocation.clearWatch(watchId);
    clearTimeout(timeoutId);
    if(bestPos){ done(bestPos); return; }
    const msgs = {
      1: 'Permiso denegado. Habilitá la ubicación en Configuración del navegador.',
      2: 'GPS no disponible. Salí al exterior e intentá de nuevo.',
      3: 'Tiempo agotado. Intentá en un lugar más abierto.'
    };
    res.style.color='#DC2626';
    res.textContent = msgs[err.code] || 'Error desconocido. Intentá de nuevo.';
    icon.style.display=''; spin.style.display='none'; btn.disabled=false;
  }

  watchId = navigator.geolocation.watchPosition(
    pos => {
      readings++;
      if(!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) bestPos = pos;
      if(pos.coords.accuracy <= MIN_ACCURACY || readings >= MAX_READINGS) done(bestPos);
    },
    fail,
    {enableHighAccuracy:true, timeout:15000, maximumAge:0}
  );

  timeoutId = setTimeout(() => {
    if(bestPos) done(bestPos); else fail({code:3});
  }, 20000);
}
