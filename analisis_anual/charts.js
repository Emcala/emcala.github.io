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
let _compMeasureCtx = null;
// Ancho del texto con la misma fuente de las etiquetas (medido con canvas)
function compTxtW(text, px) {
  if (!_compMeasureCtx) _compMeasureCtx = document.createElement('canvas').getContext('2d');
  _compMeasureCtx.font = `bold ${px}px "Barlow Condensed", sans-serif`;
  return _compMeasureCtx.measureText(text).width;
}
// Solapamiento de cajas {x1,y1,x2,y2} con 1 px de margen
function compOverlap(a, b) {
  return a.x1 < b.x2 + 1 && b.x1 < a.x2 + 1 && a.y1 < b.y2 + 1 && b.y1 < a.y2 + 1;
}
// Etiqueta apoyada por encima de un punto (yb = borde inferior de la etiqueta).
// Si choca con otra etiqueta o con una barra, sube en escalera hasta quedar libre.
function compPlaceAbove(els, boxes, rects, W, text, px, fill, cxp, yb) {
  const w  = compTxtW(text, px) + 2;
  const hh = px * 1.2;
  let x1 = cxp - w / 2;
  if (x1 < 2) x1 = 2;
  if (x1 + w > W - 2) x1 = W - 2 - w;
  let bottom = yb;
  let box = null;
  for (let g = 0; g < 30; g++) {
    box = { x1, y1: bottom - hh, x2: x1 + w, y2: bottom };
    const hit = boxes.some(o => compOverlap(box, o)) || rects.some(r => compOverlap(box, r));
    if (!hit) break;
    bottom -= hh + 2;
  }
  // Nunca fuera del borde superior de la tarjeta: se apoya en el tope
  if (box.y1 < 1) { const d = 1 - box.y1; box.y1 += d; box.y2 += d; }
  // Si en el tope igual choca, se corre el mínimo horizontal necesario dentro de la tarjeta
  const clash = boxes.find(o => compOverlap(box, o));
  if (clash) {
    const toRight = clash.x2 + 2 - box.x1;
    const toLeft  = box.x2 - (clash.x1 - 2);
    const sh = (box.x2 + toRight <= W - 2) ? toRight : -toLeft;
    box.x1 += sh; box.x2 += sh;
  }
  boxes.push(box);
  els.push({ type:'text', style:{
    text, x:(box.x1 + box.x2) / 2, y:box.y2, fill,
    textAlign:'center', textVerticalAlign:'bottom',
    font:`bold ${px}px "Barlow Condensed", sans-serif`
  }});
}
// Render de la comparativa con objetivo: todo se calcula en píxeles con api.coord,
// así se recalcula en cada resize y nada depende del layout de barras de ECharts.
function compRenderObj(api, p) {
  const W = api.getWidth(), H = api.getHeight();
  if (!W || !H) return null;
  const baseY = api.coord([0, 0])[1];
  const band  = api.coord([1, 0])[0] - api.coord([0, 0])[0];
  const els = [], rects = [], boxes = [], geo = [], outside = [];

  els.push({ type:'line', shape:{x1:2, y1:baseY, x2:W - 2, y2:baseY}, style:{stroke:'rgba(0,0,0,0.1)', lineWidth:1} });

  // 1) Barras centradas en su categoría (objetivo fina: 8-12 px; meses: 12-34 px)
  p.bars.forEach(b => {
    if (!(b.v > 0)) return;
    const cx  = api.coord([b.i, 0])[0];
    const top = api.coord([b.i, b.v])[1];
    const h   = baseY - top;
    if (h <= 0) return;
    const bw = b.obj ? Math.max(12, Math.min(16, Math.round(band * 0.30))) : Math.max(16, Math.min(band - 4, Math.round(band * 0.84)));
    rects.push({x1:cx - bw/2, y1:top, x2:cx + bw/2, y2:baseY});
    els.push({ type:'rect', shape:{x:cx - bw/2, y:top, width:bw, height:h, r:[3,3,0,0]},
      style:{fill:b.fill, stroke:b.stroke, lineWidth:1} });
    geo.push({ b, cx, top, h, bw });
  });

  // 2) Números: dentro de la barra si entran; si no entran (o es el objetivo) van arriba
  geo.forEach(g => {
    // Siempre con el tamaño base: nunca se achica. Si no entra en la barra, va arriba.
    const px = g.b.obj ? p.fsO : p.fs;
    const w  = compTxtW(g.b.lbl, px) + 2;
    // Dentro de la barra sólo si entra en alto y en ancho; si no, va arriba
    if (!g.b.obj && g.h >= px * 1.2 + 8 && w <= g.bw - 2) {
      const y  = g.top + 4;
      els.push({ type:'text', style:{
        text:g.b.lbl, x:g.cx, y, fill:g.b.txt,
        textAlign:'center', textVerticalAlign:'top',
        font:`bold ${px}px "Barlow Condensed", sans-serif`
      }});
      boxes.push({x1:g.cx - w/2, y1:y, x2:g.cx + w/2, y2:y + px * 1.2});
    } else {
      outside.push(g);
    }
  });
  outside.forEach(g => compPlaceAbove(els, boxes, rects, W, g.b.lbl, g.b.obj ? p.fsO : p.fs, '#1e293b', g.cx, g.top - 3));

  // 3) Porcentajes anclados al tope de SU barra (no al pie del gráfico)
  p.pcts.forEach(pt => {
    const g = geo.find(x => x.b.i === pt.i);
    if (!g) return;
    // Siempre con el tamaño base: el % nunca se achica
    compPlaceAbove(els, boxes, rects, W, pt.text, p.fs, pt.color, g.cx, g.top - 3);
  });

  // 4) Etiquetas de categoría bajo la línea base
  let fc = p.fsCat;
  while (fc > 8 && p.cats.some(c => compTxtW(c, fc) > band - 2)) fc--;
  p.cats.forEach((c, i) => {
    els.push({ type:'text', style:{
      text:c, x:api.coord([i, 0])[0], y:baseY + 3, fill:'#475569',
      textAlign:'center', textVerticalAlign:'top',
      font:`bold ${fc}px "Barlow Condensed", sans-serif`
    }});
  });

  return { type:'group', children: els };
}
// Opción de ECharts para la comparativa con objetivo: una sola serie custom
function compObjOption(p) {
  return {
    animation: false,
    grid: { top:15, bottom:rf(28), left:2, right:2, containLabel:false },
    xAxis: { type:'category', data:p.cats, show:false },
    yAxis: { type:'value', min:0, max:p.yMax, show:false },
    series: [{
      type:'custom', silent:true, clip:false, z:5,
      data:[[0, 0]], encode:{x:0, y:1},
      renderItem: (params, api) => compRenderObj(api, p)
    }],
    tooltip: { show:false }
  };
}

function makeComp(id, d26, d25, last, prev, col26, obj) {
  const chart = getEC(id);
  if (!chart) return;
  const vA  = Math.round(d26[last]) || 0;
  const vB  = prev ? Math.round(d26[prev]) || 0 : 0;
  const vC  = Math.round(d25[last]) || 0;
  // obj = { v, lbl, esF1 } del objetivo de la selección (Foco I cerveza / Foco II UNG)
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

  if (hasObj) {
    // ── HL · Comparativa con objetivo ──
    // Una sola serie custom: barras, objetivo, números y % se dibujan en píxeles.
    const cObj  = '#C2A24A';
    const cObjB = '#8C7327';
    const bars = [
      {i:0, v:vO, obj:true, fill:cObj, stroke:cObjB, txt:'#1e293b', lbl:fmtN(vO)},
      {i:1, v:vA, fill:col26+'ee', stroke:col26, txt:'#fff', lbl:fmtN(vA)},
      {i:2, v:vB, fill:col26+'99', stroke:col26+'cc', txt:'#1e293b', lbl:fmtN(vB)},
      {i:3, v:vC, fill:'rgba(37,99,235,0.75)', stroke:'rgba(29,78,216,0.95)', txt:'#fff', lbl:fmtN(vC)}
    ];
    // Cada % va sobre la barra del mes que se compara (igual criterio que antes)
    const pcts = [];
    if (pAB!==null && vB>0) pcts.push({i:2, text:fP(pAB), color:cAB});
    if (pAC!==null && vC>0) pcts.push({i:3, text:fP(pAC), color:cAC});
    chart.setOption(compObjOption({
      cats: [obj.lbl || 'Obj.', lA, lB, lC],
      yMax: Math.max(vA, vB, vC, vO, 1) * 1.75,
      bars, pcts,
      fs: rf(14), fsO: rf(14), fsCat: rf(13)
    }), true);
    return;
  }
  // ── Sin objetivo (CCC · TBD · CRM): diseño original ──
  const cats = [lA, lB, lC];
  const mesD = [
    {value:vA, itemStyle:{color:col26+'ee', borderColor:col26, borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vA>0, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vA)}},
    {value:vB, itemStyle:{color:col26+'99', borderColor:col26+'cc', borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vB>0, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vB)}},
    {value:vC, itemStyle:{color:'rgba(37,99,235,0.75)', borderColor:'rgba(29,78,216,0.95)', borderWidth:1, borderRadius:[3,3,0,0]},
     label:{show:vC>0, position:'insideTop', distance:6, color:'#fff', fontSize:rf(14), fontWeight:'bold', fontFamily:'Barlow Condensed', formatter:()=>fmtN(vC)}}
  ];

  // Porcentajes arriba de cada barra (mismo patrón "ghost" que makeYTD / makeCNC):
  // serie de barras transparente con label position:'top' sobre el valor de la barra del mes.
  const pctFor = (idx, pct, color) => ({
    value: idx === 1 ? vB : vC,
    itemStyle: {color:'transparent', borderColor:'transparent'},
    label: {show:true, position:'top', color, fontSize:rf(14), fontWeight:'bold',
            fontFamily:'Barlow Condensed', formatter:()=>fP(pct)}
  });
  const ghostD = [
    {value:vA, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}},
    pAB!==null && vB>0 ? pctFor(1, pAB, cAB) : {value:vB, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}},
    pAC!==null && vC>0 ? pctFor(2, pAC, cAC) : {value:vC, itemStyle:{color:'transparent', borderColor:'transparent'}, label:{show:false}}
  ];

  chart.setOption({
    animation:false,
    grid:{top:15, bottom:rf(28), left:2, right:2, containLabel:false},
    xAxis:{type:'category', data:cats,
      axisLine:{lineStyle:{color:'rgba(0,0,0,0.1)'}},
      axisTick:{show:false},
      axisLabel:{color:'#475569', fontSize:14, fontFamily:'Barlow Condensed',
                 fontWeight:'bold', interval:0}
    },
    yAxis:{type:'value', show:false, min:0, max:Math.max(vA,vB,vC,1)*1.12},
    series:[
      {type:'bar', barMaxWidth:70, data:mesD, label:{show:false}},
      {type:'bar', barMaxWidth:70, barGap:'-100%', z:10, data:ghostD, label:{show:false}}
    ],
    tooltip:{show:false}
  }, true);
}
