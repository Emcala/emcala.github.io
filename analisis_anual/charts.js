// ECHARTS HELPERS
// ═══════════════════════════════════════════════════════════════
function getEC(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!CHS[id] || CHS[id].isDisposed()) {
    CHS[id] = echarts.init(el, null, {renderer:'canvas', devicePixelRatio: 2});
  }
  if (!CH_OBS[id]) {
    CH_OBS[id] = new ResizeObserver(() => {
      if (CHS[id] && !CHS[id].isDisposed()) CHS[id].resize();
    });
    CH_OBS[id].observe(el);
  }
  return CHS[id];
}

// ═══════════════════════════════════════════════════════════════
// CHART: MONTHLY BARS (ghost axis trick for % labels)
// ═══════════════════════════════════════════════════════════════
function makeMonthly(id, d25, d26, col26) {
  const chart = getEC(id);
  const v25 = MESES.map(m => Math.round(d25[m]) || 0);
  const v26 = MESES.map(m => Math.round(d26[m]) || 0);
  const maxV = Math.max(...v25, ...v26) || 1;

  const ghostData = v26.map((val, i) => {
    if (!v25[i] || !val) return { value: val, label: { show: false } };
    const p = (val - v25[i]) / v25[i] * 100;
    return { value: val, label: {
      show: true, position: 'top',
      color: p >= 0 ? '#15803d' : '#dc2626',
      fontSize: rf(14), fontWeight: 'bold', fontFamily: 'Barlow Condensed',
      formatter: () => (p >= 0 ? '+' : '') + p.toFixed(0) + '%'
    }};
  });

  chart.setOption({
    animation: false, graphic: [],
    grid: { top:15, bottom:rf(22), left:4, right:4, containLabel:false },
    xAxis: [
      { type:'category', data:LABS, axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}}, axisTick:{show:false},
        axisLabel:{color:'#475569', fontSize:rf(13), fontFamily:'Barlow Condensed', fontWeight:'bold'} },
      { type:'category', data:LABS, show:false }
    ],
    yAxis: { type:'value', show:false, min:0, max:maxV*1.18 },
    series: [
      { name:'2025', type:'bar', barGap:'5%', barCategoryGap:'15%', xAxisIndex:0, data:v25, barMaxWidth:75,
        itemStyle:{color:'rgba(37,99,235,0.75)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[2,2,0,0]},
        label:{show:true, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:p=>p.value>0?fmtN(p.value):''} },
      { name:'2026', type:'bar', xAxisIndex:0, data:v26, barMaxWidth:75,
        itemStyle:{color:col26+'dd', borderColor:col26, borderWidth:1, borderRadius:[2,2,0,0]},
        label:{show:true, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:p=>p.value>0?fmtN(p.value):''} },
      { name:'2025_g', type:'bar', barGap:'5%', barCategoryGap:'15%', xAxisIndex:1, data:v25, barMaxWidth:75,
        itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false} },
      { name:'2026_g', type:'bar', xAxisIndex:1, data:ghostData, barMaxWidth:75,
        itemStyle:{color:'transparent', borderColor:'transparent'} }
    ],
    tooltip: { show:false }
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART: MONTHLY BARS BY CANAL (4 mesas side by side)
// ═══════════════════════════════════════════════════════════════
function makeMonthlyByCanal(id, channels26) {
  const chart = getEC(id);
  if (!chart) return;

  const mTot26 = MESES.map(m => channels26.reduce((sum, ch) => sum + (Math.round(ch.data[m]) || 0), 0));

  const series26 = channels26.map((ch, idx) => ({
    name: ch.name, type: 'bar', stack: 'total26', xAxisIndex: 0, barMaxWidth: 80,
    itemStyle: { color: ch.color, borderRadius: [2, 2, 0, 0] },
    data: MESES.map((m, i) => {
      const val = Math.round(ch.data[m] || 0);
      const pct = mTot26[i] > 0 ? (val / mTot26[i] * 100) : 0;
      return { value: pct, absVal: val };
    }),
    label: {
      show: true, position: 'inside',
      formatter: p => {
        if (p.value < 6 || p.data.absVal === 0) return ''; 
        return `{pct|${p.value.toFixed(0)}%}`;
      },
      rich: {
        pct: { color: '#ffffff', fontSize: rf(11), fontFamily: 'Barlow Condensed', fontWeight: 'bold', textBorderColor: 'rgba(0,0,0,0.4)', textBorderWidth: 1.5 }
      }
    }
  }));

  chart.setOption({
    animation: false, graphic: [],
    grid: { top: 12, bottom: rf(22), left: 4, right: 4, containLabel: false },
    xAxis: { type: 'category', data: LABS, axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: rf(13), fontFamily: 'Barlow Condensed', fontWeight: 'bold' } },
    yAxis: { type: 'value', show: false, min: 0, max: 100 },
    series: series26,
    tooltip: { 
      show: true, trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontFamily: 'Barlow Condensed', fontSize: 14 },
      formatter: params => {
        let title = params[0].name + '<br/>';
        let items = params.map(p => {
          const marker = p.marker;
          const name = p.seriesName;
          const absVal = typeof fmtN !== 'undefined' ? fmtN(p.data.absVal) : p.data.absVal;
          const pct = p.value.toFixed(1) + '%';
          return `${marker} ${name}: <b>${absVal}</b> (${pct})`;
        });
        return title + items.join('<br/>');
      }
    }
  });
}

function makeYTDStackedByCanal(id, ytd25Data, ytd26Data) {
  const chart = getEC(id);
  if (!chart) return;

  const t25 = ytd25Data.reduce((a, v) => a + v.value, 0);
  const t26 = ytd26Data.reduce((a, v) => a + v.value, 0);
  const maxV = Math.max(t25, t26, 1);
  const p = t25 ? (t26 - t25) / t25 * 100 : 0;
  const sign = p >= 0 ? '+' : '', col = p >= 0 ? '#15803d' : '#dc2626', arrow = p >= 0 ? '▲ ' : '▼ ';

  const series = [];
  ytd26Data.forEach((item26, i) => {
    const item25 = ytd25Data[i] || { value: 0 };
    series.push({
      name: item26.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 70,
      itemStyle: { color: item26.color },
      data: [item26.value, item25.value],
      label: {
        show: true,
        position: 'inside',
        formatter: p => p.value > (maxV * 0.05) ? typeof fmtN !== 'undefined' ? fmtN(p.value) : p.value : '',
        color: '#ffffff', fontSize: rf(13), fontWeight: 'bold', fontFamily: 'Barlow Condensed', textBorderColor: 'rgba(0,0,0,0.4)', textBorderWidth: 1.5
      }
    });
  });

  series.push({
    name: 'Ghost',
    type: 'bar',
    barGap: '-100%',
    barMaxWidth: 70,
    z: 10,
    data: [
      { value: t26, itemStyle: { color: 'transparent' }, 
        label: { show: true, position: 'top', color: col, fontSize: rf(14), fontWeight: 'bold', fontFamily: 'Barlow Condensed', formatter: () => arrow + sign + p.toFixed(1) + '%' } },
      { value: t25, itemStyle: { color: 'transparent' }, label: { show: false } }
    ]
  });

  chart.setOption({
    animation: false, graphic: [],
    grid: { top: 20, bottom: rf(28), left: 2, right: 2, containLabel: false },
    xAxis: { type: 'category', data: ['YTD', 'LYTD'], axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 14, fontFamily: 'Barlow Condensed', fontWeight: 'bold' } },
    yAxis: { type: 'value', show: false, min: 0, max: maxV * 1.15 },
    series: series,
    tooltip: { show: true, trigger: 'item', textStyle: { fontFamily: 'Barlow Condensed', fontSize: 14 } }
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART: SKU/PDV MENSUAL (para Ranking)
// ═══════════════════════════════════════════════════════════════
function makeSKUMonthly(id, d25, d26, col26) {
  const chart = getEC(id);
  if (!chart) return;
  const v25 = MESES.map(m => +((d25[m]||0).toFixed(2)));
  const v26 = MESES.map(m => +((d26[m]||0).toFixed(2)));
  const maxV = Math.max(...v25, ...v26) || 1;

  const ghostData = v26.map((val, i) => {
    if (!v25[i] || !val) return { value: val, label: { show: false } };
    const p = (val - v25[i]) / v25[i] * 100;
    return { value: val, label: {
      show: true, position: 'top',
      color: p >= 0 ? '#15803d' : '#dc2626',
      fontSize: rf(14), fontWeight: 'bold', fontFamily: 'Barlow Condensed',
      formatter: () => (p >= 0 ? '+' : '') + p.toFixed(0) + '%'
    }};
  });

  chart.setOption({
    animation: false, graphic: [],
    grid: { top:15, bottom:rf(22), left:4, right:4, containLabel:false },
    xAxis: [
      { type:'category', data:LABS, axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}}, axisTick:{show:false},
        axisLabel:{color:'#475569', fontSize:rf(13), fontFamily:'Barlow Condensed', fontWeight:'bold'} },
      { type:'category', data:LABS, show:false }
    ],
    yAxis: { type:'value', show:false, min:0, max:maxV*1.18 },
    series: [
      { name:'2025', type:'bar', barGap:'5%', barCategoryGap:'15%', xAxisIndex:0, data:v25, barMaxWidth:75,
        itemStyle:{color:'rgba(37,99,235,0.75)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[2,2,0,0]},
        label:{show:true, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:p=>p.value>0?fmtN(p.value,1):''} },
      { name:'2026', type:'bar', xAxisIndex:0, data:v26, barMaxWidth:75,
        itemStyle:{color:col26+'dd', borderColor:col26, borderWidth:1, borderRadius:[2,2,0,0]},
        label:{show:true, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:p=>p.value>0?fmtN(p.value,1):''} },
      { name:'2025_g', type:'bar', barGap:'5%', barCategoryGap:'15%', xAxisIndex:1, data:v25, barMaxWidth:75,
        itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false} },
      { name:'2026_g', type:'bar', xAxisIndex:1, data:ghostData, barMaxWidth:75,
        itemStyle:{color:'transparent', borderColor:'transparent'} }
    ],
    tooltip: { show:false }
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART: YTD vs LYTD
// ═══════════════════════════════════════════════════════════════
function makeYTD(id, d25, d26, meses26, col26) {
  const chart = getEC(id);
  const ytd26 = Math.round(meses26.reduce((a,m) => a+(d26[m]||0), 0));
  const ytd25 = Math.round(meses26.reduce((a,m) => a+(d25[m]||0), 0));
  const p = ytd25 ? (ytd26-ytd25)/ytd25*100 : 0;
  const sign = p>=0?'+':'', col = p>=0?'#15803d':'#dc2626', arrow = p>=0?'▲ ':'▼ ';

  chart.setOption({
    animation:false,
    grid:{top:15, bottom:rf(28), left:2, right:2, containLabel:false},
    xAxis:{type:'category', data:['YTD','LYTD'], axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}}, axisTick:{show:false},
      axisLabel:{color:'#475569', fontSize: 14, fontFamily:'Barlow Condensed', fontWeight:'bold', interval:0}},
    yAxis:{type:'value', show:false, min:0, max:Math.max(ytd26,ytd25,1)*1.12},
    series:[
      { type:'bar', barMaxWidth:70,
        data:[
          {value:ytd26, itemStyle:{color:col26+'ee', borderColor:col26, borderWidth:1, borderRadius:[3,3,0,0]},
           label:{show:true, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(ytd26)}},
          {value:ytd25, itemStyle:{color:'rgba(37,99,235,0.75)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[3,3,0,0]},
           label:{show:true, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(ytd25)}}
        ], label:{show:false} },
      { type:'bar', barMaxWidth:70, barGap:'-100%', z:10,
        data:[
          {value:ytd26, itemStyle:{color:'transparent', borderColor:'transparent'},
           label:{show:true, position:'top', color:col, fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>arrow+sign+p.toFixed(1)+'%'}},
          {value:ytd25, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}}
        ] }
    ],
    tooltip:{show:false}
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART: CCC vs CNC vs CARTERA
// ═══════════════════════════════════════════════════════════════
function makeCNC(id, d26, meses26, col26, pg) {
  const chart = getEC(id);
  const last  = meses26[meses26.length-1] || MESES[0];
  const ccc   = Math.round(d26[last]) || 0;
  const cart  = getCartera(pg);
  const cnc   = Math.max(cart - ccc, 0);
  const maxV  = Math.max(cart, ccc, cnc, 1);
  const pCCC  = cart > 0 ? ccc/cart*100 : 0;
  const pCNC  = cart > 0 ? cnc/cart*100 : 0;

  chart.setOption({
    animation:false,
    grid:{top:15, bottom:rf(28), left:2, right:2, containLabel:false},
    xAxis:{type:'category', data:['Cartera','CCC','CNC'], axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}}, axisTick:{show:false},
      axisLabel:{color:'#475569', fontSize: 14, fontFamily:'Barlow Condensed', fontWeight:'bold', interval:0}},
    yAxis:{type:'value', show:false, min:0, max:maxV*1.12},
    series:[
      { type:'bar', barMaxWidth:70,
        data:[
          {value:cart, itemStyle:{color:'rgba(37,99,235,0.7)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[3,3,0,0]},
           label:{show:true, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(cart)}},
          {value:ccc,  itemStyle:{color:col26+'ee', borderColor:col26, borderWidth:1, borderRadius:[3,3,0,0]},
           label:{show:true, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(ccc)}},
          {value:cnc,  itemStyle:{color:'#64748b', borderColor:'#475569', borderWidth:1, borderRadius:[3,3,0,0]},
           label:{show:true, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(cnc)}}
        ], label:{show:false} },
      { type:'bar', barMaxWidth:70, barGap:'-100%', z:10,
        data:[
          {value:cart, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}},
          {value:ccc,  itemStyle:{color:'transparent', borderColor:'transparent'},
           label:{show:true, position:'top', color:'#15803d', fontSize: rf(12), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>'▲ '+pCCC.toFixed(1)+'%'}},
          {value:cnc,  itemStyle:{color:'transparent', borderColor:'transparent'},
           label:{show:true, position:'top', color:'#dc2626', fontSize: rf(12), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>'▼ '+pCNC.toFixed(1)+'%'}}
        ] }
    ],
    tooltip:{show:false}
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART: COMPARATIVA DE DESEMPEÑO
// ═══════════════════════════════════════════════════════════════
function makeComp(id, d26, d25, last, prev, col26, obj) {
  const chart = getEC(id);
  const vA  = Math.round(d26[last]) || 0;
  const vB  = prev ? Math.round(d26[prev]) || 0 : 0;
  const vC  = Math.round(d25[last]) || 0;
  // obj = { v, lbl } del objetivo de la selección: Foco I (cerveza) o Foco II (NABS / UNG)
  const vO  = obj && obj.v > 0 ? Math.round(obj.v) : 0;
  const hasObj = vO > 0;

  const pAB = vB ? (vA-vB)/vB*100 : null;
  const pAC = vC ? (vA-vC)/vC*100 : null;
  const cAB = pAB!==null && pAB>=0 ? '#15803d' : '#dc2626';
  const cAC = pAC!==null && pAC>=0 ? '#15803d' : '#dc2626';
  const fP  = p => p===null ? '' : (p>=0?'▲ +':'▼ ')+p.toFixed(1)+'%';
  const lA  = last ? last.slice(0,3).toUpperCase()+' 26' : '—';
  const lB  = prev ? prev.slice(0,3).toUpperCase()+' 26' : '—';
  const lC  = last ? last.slice(0,3).toUpperCase()+' 25' : '—';

  // Colores de las barras de objetivo (amarillo-naranja opaco)
  const cO1 = 'rgba(249,115,22,0.80)';   // naranja — Foco I cerveza
  const cO1b= 'rgba(194,65,12,0.95)';
  const cO2 = 'rgba(234,179,8,0.80)';    // amarillo — Foco II NABs
  const cO2b= 'rgba(161,98,7,0.95)';

  // Construir categorías y datos dinámicamente
  const cats  = [lA, lB, lC];
  const mainD = [
    {value:vA, itemStyle:{color:col26+'ee', borderColor:col26, borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vA>0, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vA)}},
    {value:vB, itemStyle:{color:col26+'99', borderColor:col26+'cc', borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vB>0, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vB)}},
    {value:vC, itemStyle:{color:'rgba(37,99,235,0.75)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vC>0, position:'insideTop', distance:8, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vC)}}
  ];
  const ovD = [
    {value:vA, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}},
    {value:vB, itemStyle:{color:'transparent', borderColor:'transparent'},
     label:{show:pAB!==null&&vB>0, position:'top', color:cAB, fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fP(pAB)}},
    {value:vC, itemStyle:{color:'transparent', borderColor:'transparent'},
     label:{show:pAC!==null&&vC>0, position:'top', color:cAC, fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fP(pAC)}}
  ];
  // Serie de objetivos: la barra de objetivo va PRIMERA (a la izquierda de OCT 26)
  const objD = [null, null, null];

  if (hasObj) {
    const esF1 = obj.esF1;
    cats.unshift(obj.lbl);
    mainD.unshift(null);
    ovD.unshift(null);
    objD.unshift({value:vO,
      itemStyle:{color:esF1?cO1:cO2, borderColor:esF1?cO1b:cO2b, borderWidth:1, borderRadius:[3,3,0,0]},
      label:{show:true, position:'inside', rotate:90, color:esF1?'#431407':'#1a1500',
             fontSize:rf(12), fontWeight:'bold', fontFamily:'Barlow Condensed',
             formatter:()=>fmtN(vO)}
    });
  }

  const series = [
    // Serie principal: barras normales (90% del band)
    {type:'bar', barWidth:'90%', data:mainD, label:{show:false}},
    // Serie overlay: etiquetas de % encima de las barras principales
    {type:'bar', barWidth:'90%', barGap:'-100%', z:10, data:ovD},
  ];
  if (hasObj) {
    // Serie de objetivos: mismo ancho y barGap -100% que las otras, para que las 3 series
    // queden apiladas en el mismo centro y los % no se corran a la derecha
    series.push({type:'bar', barWidth:'90%', barGap:'-100%', data:objD, label:{show:false}});
  }

  chart.setOption({
    animation:false,
    grid:{top:15, bottom:rf(28), left:2, right:2, containLabel:false},
    xAxis:{type:'category', data:cats,
      axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}},
      axisTick:{show:false},
      axisLabel:{color:'#475569', fontSize:hasObj?10:13, fontFamily:'Barlow Condensed',
                 fontWeight:'bold', interval:0}
    },
    yAxis:{type:'value', show:false, min:0, max:Math.max(vA,vB,vC,vO,1)*1.15},
    series,
    tooltip:{show:false}
  });
}
