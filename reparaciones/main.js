/* =========================================================================
   Puente con el Portal
========================================================================= */
let currentUser=null,currentRole=null,currentUserHash=null,promotoresPropios=[],currentSessionToken=null;

(function(){
  if (!EmcalaAuth.requireLogin()) return;
  const _s = EmcalaAuth.getSession();
  if (!_s) return;
  currentUser = _s.usuario;
  currentUserHash = _s.userHash;
  currentRole = _s.rol;
  
  const rawSession = localStorage.getItem('user_session');
  if(rawSession) {
     const p = JSON.parse(rawSession);
     currentSessionToken = p._h;
  }
  
  if (_s.promotores) promotoresPropios = _s.promotores.split(',').map(p => p.trim().toUpperCase());
})();

window.addEventListener('load',()=>{
  const _s = EmcalaAuth.getSession();
  if(_s){
    document.getElementById('dashboard').style.display='block';
    const badgeContainer = document.getElementById('roleBadgeContainer');
    if (badgeContainer) {
      const labels = { supervisor: 'SUPERVISOR', tecnico: 'TÉCNICO', trade: 'TRADE MARKETING', auditor: 'ANALISTA' };
      const label = labels[currentRole] || currentRole.toUpperCase();
      badgeContainer.innerHTML = `<span class="role-badge ${currentRole}">${label}</span>`;
    }
    if(currentRole === 'supervisor') {
  const btnVerMas = document.getElementById('btnVerMas');
  if(btnVerMas) btnVerMas.style.display = 'none';
  const periodoLabel = document.getElementById('periodoLabel');
  if(periodoLabel) periodoLabel.style.display = 'none';
}
    
    if(currentRole==='trade'||currentRole==='supervisor'){document.getElementById('tabBar').style.display='flex';document.getElementById('tabSolicitudes').style.display='';document.getElementById('tabHistorial').style.display='';document.getElementById('tabRetiro').style.display='';document.getElementById('tabLogs').style.display='';}
    if(currentRole==='tecnico'){document.getElementById('tabBar').style.display='flex';document.getElementById('tabHistorial').style.display='';}
    if(currentRole==='auditor'){document.getElementById('tabBar').style.display='flex';document.getElementById('tabSolicitudes').style.display='';document.getElementById('tabDashboard').style.display='';document.getElementById('tabLogs').style.display='';document.getElementById('tabHistorial').style.display='';document.getElementById('tabRetiro').style.display='';switchTab('mapa');}

    if(typeof initMap==='function') initMap();
    if(typeof loadData==='function') loadData();
  }


});

window.doLogout=function(){EmcalaAuth.logout();};

/* ========================================================================= */

const SCRIPT_URL='https://script.google.com/macros/s/AKfycbwreokQunVau5zi-QN-NzPz14IOfk11p4As3PYRqvSh1zqgbPosHJ9nX2RAfotacKxN/exec';

function formatFechaAR(d){if(!d||isNaN(d))return '';return d.toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit'});}

const ESTADO_META={'resuelto':{label:'Resuelto',cls:'resuelto',icon:'✅'},'pendiente':{label:'Pendiente',cls:'pendiente',icon:'⏳'},'retiro':{label:'Retiro',cls:'retiro',icon:'📦'},'retiro-sin-reparacion':{label:'Retiro · Sin reparación',cls:'retiro-sin-rep',icon:'📦'},'cliente-cerrado':{label:'Cliente Cerrado',cls:'retiro',icon:'🔴'},'':{label:'Pendiente',cls:'pendiente',icon:'⏳'}};
let allData=[],seguimientos={},seguimientosRaw=[],chatData={},historialData=[],filtered=[],leafMap=null,markers=[],modalLeaf=null;
let diasCargados=30,ordenDescendente=true;

function fixCoord(val){if(!val)return '';let s=val.toString().replace(/,/g,'.');let dotCount=(s.match(/\./g)||[]).length;if(dotCount>1)s=s.replace(/\./g,'');let n=parseFloat(s);if(isNaN(n))return '';if(Math.abs(n)>1000)n=n/1000000;return n.toString();}
function escapeHTML(str){if(!str)return '';return str.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function getDirectImageUrl(url){if(!url)return '';if(url.startsWith('data:')||!url.includes('drive.google.com'))return url;let id='';const dMatch=url.match(/\/d\/([a-zA-Z0-9_-]+)/);if(dMatch&&dMatch[1]){id=dMatch[1];}else{const idMatch=url.match(/[?&]id=([a-zA-Z0-9_-]+)/);if(idMatch&&idMatch[1]){id=idMatch[1];}}if(id)return 'https://drive.google.com/uc?export=view&id='+id;return url;}

const FREQ_DIA={0:[],1:['LU','LUJU'],2:['MA','MAVI'],3:['MI','MISA'],4:['JU','LUJU'],5:['MAVI','VI'],6:['SA','MISA']};
const DIA_LABEL=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let filtroHoyActivo=false;
