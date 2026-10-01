/* ============ MÉTRICAS, AGREGAÇÃO, TENDÊNCIA E GRÁFICOS DE APOIO ============
   Uma regra de escopo só, compartilhada por cartão, indicadores, tabelas e
   trajetos. Toda métrica é recalculada a partir de numerador e denominador do
   MESMO recorte — nunca por média de razões, nunca por rateio do total.       */

/* primeiro nome + ultimo sobrenome: 'Rodrigo da Silva Fernandes' -> 'Rodrigo Fernandes'.
   Cortar por caractere gerava rotulos sem sentido, como 'Rodrigo da'. */
function nomeCurto(n){
  const p=String(n||'').trim().split(/\s+/).filter(Boolean);
  const liga=new Set(['da','de','do','das','dos','e']);
  if(p.length<=2) return p.join(' ');
  let u=p.length-1; while(u>0&&liga.has(p[u].toLowerCase())) u--;
  return p[0]+' '+p[u];
}
/* ---------- acumulador de um recorte ---------- */
function accVazio(){return {km:0,L:0,ml:0,faixa:{},ev:{},nd:0,ndKm:0,dias:0};}
function accSoma(a,b){
  a.km+=b.km; a.L+=b.L; a.ml+=b.ml; a.nd+=b.nd; a.ndKm+=b.ndKm; a.dias+=b.dias;
  for(const k in b.faixa) a.faixa[k]=(a.faixa[k]||0)+b.faixa[k];
  for(const e in b.ev) a.ev[e]=(a.ev[e]||0)+b.ev[e];
  return a;
}
/* Um dia de um motorista vira acumulador. Quando há filtro de placa e o dia teve
   mais de uma placa, usa o detalhe por placa gravado pelo motor (dd[7]); sem
   detalhe disponível o dia inteiro fica de fora, porque exibir o total do
   motorista como se fosse daquela placa seria falso. */
function accDia(v,placa){
  if(!v||v===0) return null;
  const o=accVazio();
  if(!placa||((v[5]||[]).length===1&&v[5][0]===placa)){
    if(placa&&(v[5]||[]).indexOf(placa)<0) return null;
    o.km=v[0]; o.L=v[1]; o.ml=v[2];
    for(const k in v[3]) o.faixa[k]=v[3][k];
    for(const e in v[4]) o.ev[e]=v[4][e];
    o.nd=1; o.ndKm=v[6]||0; o.dias=1; return o;
  }
  const det=v[7]&&v[7][placa];
  if(!det) return null;                      // dia misto sem detalhe: não entra
  o.km=det[0]; o.L=det[1]; o.ml=det[2];
  for(const k in det[3]) o.faixa[k]=det[3][k];
  for(const e in det[4]) o.ev[e]=det[4][e];
  o.nd=1; o.ndKm=det[5]||0; o.dias=1; return o;
}
/* Série de acumuladores, um por dia do período inteiro (null fora do recorte ou
   sem dado). É a base de tudo que é temporal. */
function serieAcc(lista,i0,i1,placa){
  const S2=[];
  for(let i=0;i<DIAS.length;i++){
    if(i<i0||i>i1){S2.push(null);continue;}
    let a=null;
    lista.forEach(mo=>{
      const d=accDia((mo.dd||[])[i],placa);
      if(d){ a=a?accSoma(a,d):d; }
    });
    S2.push(a);
  }
  return S2;
}
function accTotal(S2){
  let a=null; S2.forEach(x=>{if(x)a=a?accSoma(a,x):Object.assign(accVazio(),x,{faixa:Object.assign({},x.faixa),ev:Object.assign({},x.ev)});});
  return a||accVazio();
}
/* ---------- catálogo de métricas ----------
   bom: sentido favorável. est: limiar de estabilidade (relativo em % ou, quando
   pp=true, em pontos percentuais). dis: o que precisa existir para a métrica ser
   avaliável naquele recorte. */
const MET={
  kml:{nome:'Rendimento',curto:'km/l',unid:'km/l',dec:3,decx:2,bom:'alto',est:3,
    expl:'quantos quilômetros o veículo percorreu com um litro',
    base:a=>a.L, calc:a=>a.L?a.km/a.L:null},
  ader:{nome:'Aderência à referência do modelo',curto:'aderência',unid:'%',dec:0,decx:0,bom:'alto',est:3,
    expl:'o rendimento medido comparado ao mínimo da faixa do modelo',
    base:a=>a.L, calc:(a,ctx)=>(a.L&&ctx&&ctx.meta_lo)?100*(a.km/a.L)/ctx.meta_lo:null},
  eco:{nome:'Tempo em faixa verde',curto:'faixa verde',unid:'%',dec:1,decx:0,bom:'alto',est:2,pp:true,
    expl:'tempo na faixa econômica de rotação',
    base:a=>bandaDe(a).ok?bandaDe(a).base:0,
    calc:a=>{const b=bandaDe(a); return b.ok?100*((a.faixa.verde_eco||0)+(a.faixa.verde||0))/b.base:null;}},
  ml:{nome:'Marcha lenta',curto:'marcha lenta',unid:'%',dec:1,decx:0,bom:'baixo',est:2,pp:true,
    expl:'tempo parado com o motor ligado',
    base:a=>bandaDe(a).ok?bandaDe(a).base:0,
    calc:a=>{const b=bandaDe(a); return b.ok?100*a.ml/b.base:null;}},
  vel:{nome:'Tempo acima do limite',curto:'acima do limite',unid:'%',dec:1,decx:0,bom:'baixo',est:2,pp:true,
    expl:'tempo rodando acima do limite configurado no equipamento',
    base:a=>bandaDe(a).ok?bandaDe(a).base:0,
    calc:a=>{const b=bandaDe(a); return b.ok?100*(a.faixa.excesso_vel||0)/b.base:null;}},
  ev100:{nome:'Pontos de evento por 100 km',curto:'pts/100 km',unid:'pts/100 km',dec:1,decx:1,bom:'baixo',est:10,
    expl:'gravidade somada dos eventos de segurança e conduta, dividida pela distância',
    base:a=>a.km, calc:a=>a.km?pesoEvDe(a)/(a.km/100):null},
  evn:{nome:'Eventos de segurança e conduta',curto:'eventos',unid:'evento(s)',dec:0,decx:0,bom:'baixo',est:10,
    expl:'quantidade de alertas registrados pelo equipamento',
    base:a=>a.nd, calc:a=>nEvDe(a)},
  km:{nome:'Distância medida',curto:'km',unid:'km',dec:0,decx:0,bom:'neutro',est:10,
    expl:'quilometragem do contador CAN nos dias com leitura válida',
    base:a=>a.nd, calc:a=>a.km||null},
  litros:{nome:'Diesel medido',curto:'litros',unid:'L',dec:0,decx:0,bom:'neutro',est:10,
    expl:'litros apurados pelo contador CAN',
    base:a=>a.nd, calc:a=>a.L||null},
  hmotor:{nome:'Horas de motor medidas',curto:'h de motor',unid:'h',dec:1,decx:1,bom:'neutro',est:10,
    expl:'tempo de motor lido pela telemetria — não é jornada de trabalho',
    base:a=>a.nd, calc:a=>{const b=bandaDe(a); return b.base?b.base/3600:null;}}
};
function bandaDe(a){
  const f=a.faixa||{};
  const banda=['transicao','verde','verde_eco','amarela','vermelha'].reduce((s,k)=>s+(f[k]||0),0);
  const base=banda+(a.ml||0);
  return {banda:banda,base:base,ok:banda>=REGUA.min_banda&&base>0};
}
function pesoEvDe(a){
  let s=0; for(const e in a.ev){const c=CATEV[e]; if(c&&(c[0]==='Segurança'||c[0]==='Fadiga e conduta')) s+=a.ev[e]*c[1];} return s;
}
function nEvDe(a){
  let s=0; for(const e in a.ev){const c=CATEV[e]; if(c&&(c[0]==='Segurança'||c[0]==='Fadiga e conduta')) s+=a.ev[e];} return s;
}
function valMet(k,a,ctx){ if(!a) return null; const v=MET[k].calc(a,ctx); return (v==null||!isFinite(v))?null:v; }
function fmtMet(k,v){ return v==null?'—':nf(v,MET[k].dec)+(MET[k].unid?' '+MET[k].unid:''); }

/* ---------- tendência: blocos inicial e final de dias avaliáveis ----------
   Nunca por primeiro contra último ponto. Mínimo de 6 dias avaliáveis; cada
   bloco é um terço do período avaliável, com pelo menos 2 dias. A agregação é
   por numerador e denominador dentro de cada bloco. */
const TEND_MIN_DIAS=6, TEND_MIN_BLOCO=2;
function tendencia(S2,k,ctx){
  const M=MET[k];
  const idx=[]; for(let i=0;i<S2.length;i++){ const a=S2[i]; if(a&&M.base(a)>0&&valMet(k,a,ctx)!=null) idx.push(i); }
  if(idx.length<TEND_MIN_DIAS)
    return {ok:false,txt:'Sem base suficiente para avaliar tendência',n:idx.length,
            det:idx.length+' dia(s) avaliável(is); são necessários '+TEND_MIN_DIAS+'.'};
  const nb=Math.max(TEND_MIN_BLOCO,Math.floor(idx.length/3));
  const ini=idx.slice(0,nb), fim=idx.slice(-nb);
  const soma=ii=>{let a=null; ii.forEach(i=>{const x=S2[i]; a=a?accSoma(a,x):Object.assign(accVazio(),x,{faixa:Object.assign({},x.faixa),ev:Object.assign({},x.ev)});}); return a;};
  const va=valMet(k,soma(ini),ctx), vb=valMet(k,soma(fim),ctx);
  if(va==null||vb==null) return {ok:false,txt:'Sem base suficiente para avaliar tendência',n:idx.length};
  const dpp=vb-va, drel=va?100*(vb/va-1):null;
  const medida=M.pp?dpp:drel;
  const estavel=medida==null||Math.abs(medida)<M.est;
  let dir='estavel';
  if(!estavel) dir=(M.bom==='baixo')?(dpp<0?'melhor':'pior'):(M.bom==='alto'?(dpp>0?'melhor':'pior'):'mudou');
  return {ok:true,dir:dir,a:va,b:vb,dpp:dpp,drel:drel,n:idx.length,nb:nb,
    de:DIAS[ini[0]],ate:DIAS[fim[fim.length-1]],
    txt:(estavel?'estável':(dir==='melhor'?'melhorou':dir==='pior'?'piorou':'mudou'))
        +' · '+(M.pp?sgn(dpp,1)+' p.p.':sgn(drel,1)+'%'),
    det:'primeiros '+nb+' e últimos '+nb+' dia(s) avaliável(is) de '+idx.length
        +': '+fmtMet(k,va)+' → '+fmtMet(k,vb)};
}
const corTend=t=>!t.ok?'var(--ink3)':t.dir==='melhor'?'var(--good)':t.dir==='pior'?'var(--crit)':'var(--ink2)';
const iconTend=t=>!t.ok?'·':t.dir==='melhor'?'▲':t.dir==='pior'?'▼':'=';

/* ---------- links do Google Maps ----------
   URLs oficiais, sem chave de API. Nenhum nome ou documento entra no endereço.
   O Maps RECALCULA o caminho entre os pontos: isso é dito na tela. */
const MAPS_AVISO='Caminho aproximado entre pontos registrados; recalculado pelo Google Maps.';
const _c=(la,lo)=>encodeURIComponent(Number(la).toFixed(5)+','+Number(lo).toFixed(5));
function gmapsLoc(la,lo){ return 'https://www.google.com/maps/search/?api=1&query='+_c(la,lo); }
function gmapsDir(pts,movel){
  if(!pts||pts.length<2) return null;
  const maxInt=movel?3:9;                       // limite oficial de pontos intermediários
  const o=pts[0], d=pts[pts.length-1], meio=pts.slice(1,-1);
  let u='https://www.google.com/maps/dir/?api=1&origin='+_c(o[0],o[1])+'&destination='+_c(d[0],d[1])+'&travelmode=driving';
  if(meio.length){
    const passo=Math.max(1,Math.ceil(meio.length/maxInt));
    const w=meio.filter((_,i)=>i%passo===0).slice(0,maxInt);
    if(w.length) u+='&waypoints='+w.map(p=>_c(p[0],p[1])).join(encodeURIComponent('|'));
  }
  return u.length<=2048?u:u.split('&waypoints=')[0];
}
/* Trajeto longo vira links numerados, na ordem do relógio. */
function gmapsTrechos(pts,movel){
  const maxInt=movel?3:9, porLink=maxInt+2;
  if(!pts||pts.length<2) return [];
  if(pts.length<=porLink) return [gmapsDir(pts,movel)];
  const out=[];
  for(let i=0;i<pts.length-1;i+=porLink-1) out.push(gmapsDir(pts.slice(i,i+porLink),movel));
  return out.filter(Boolean);
}
const ehMovel=()=>window.matchMedia&&window.matchMedia('(hover:none)').matches;

/* ---------- decodificação da polilinha gravada pelo motor ---------- */
function decPoly(str,prec){
  const f=Math.pow(10,prec||4); let i=0,la=0,lo=0; const out=[];
  while(i<str.length){
    let r=0,sh=0,b;
    do{b=str.charCodeAt(i++)-63; r|=(b&0x1f)<<sh; sh+=5;}while(b>=0x20);
    la+=((r&1)?~(r>>1):(r>>1)); r=0; sh=0;
    do{b=str.charCodeAt(i++)-63; r|=(b&0x1f)<<sh; sh+=5;}while(b>=0x20);
    lo+=((r&1)?~(r>>1):(r>>1));
    out.push([la/f,lo/f]);
  }
  return out;
}
const TRAJ=(D.traj&&D.traj.t)||{};
const TRAJEV=(D.traj&&D.traj.ev)||[];
const TRAJCRIT=(D.traj&&D.traj.criterios)||null;
const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const durTxt=m=>{const h=Math.floor(m/60),x=Math.round(m%60);return h?h+'h'+String(x).padStart(2,'0'):x+'min';};

/* ---------- gráficos de apoio ---------- */
/* minigráfico de linha: serve às métricas com unidades diferentes lado a lado */
function sparkline(pts,opt){
  opt=opt||{}; const W=opt.w||150,H=opt.h||38,P=3;
  const v=pts.filter(x=>x!=null);
  if(v.length<2) return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="sem série"><text class="axis" x="4" y="'+(H/2+4)+'">sem série</text></svg>';
  let mn=Math.min.apply(null,v), mx=Math.max.apply(null,v); if(mx===mn){mx+=1;mn-=1;}
  const X=i=>P+(pts.length>1?i/(pts.length-1)*(W-2*P):0), Y=x=>H-P-(x-mn)/(mx-mn)*(H-2*P);
  let d='',open=false,ult=null,ulti=0;
  pts.forEach((x,i)=>{ if(x==null){open=false;return;} d+=(open?'L':'M')+X(i).toFixed(1)+' '+Y(x).toFixed(1)+' '; open=true; ult=x; ulti=i;});
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(opt.aria||'série diária')+'">'
   +'<path d="'+d+'" fill="none" stroke="'+(opt.c||'var(--s1)')+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
   +(ult!=null?'<circle cx="'+X(ulti).toFixed(1)+'" cy="'+Y(ult).toFixed(1)+'" r="2.6" fill="'+(opt.c||'var(--s1)')+'"/>':'')
   +'</svg>';
}
/* calendário: um quadrado por dia, para achar O DIA, não para julgar o motorista */
function heatCal(dias,vals,opt){
  opt=opt||{};
  const gap=5, porLinha=opt.porLinha||Math.min(dias.length,opt.w&&opt.w<420?7:9);
  // quadrado do dia: do tamanho que a vaga permitir, entre 34 e 52 px
  const cel=opt.cel||Math.max(34,Math.min(52,Math.floor(((opt.w||340)-gap*(porLinha-1))/porLinha)));
  const lin=Math.ceil(dias.length/porLinha);
  const W=porLinha*(cel+gap), H=lin*(cel+gap)+16;
  let s='<svg viewBox="0 0 '+W+' '+H+'" class="cal" style="width:'+W+'px;max-width:100%" role="img" aria-label="'+esc(opt.aria||'dias do período')+'">';
  dias.forEach((d,i)=>{
    const x=(i%porLinha)*(cel+gap), y=Math.floor(i/porLinha)*(cel+gap);
    const o=vals[i]||{};
    s+='<rect data-tip="'+esc(o.tip||d)+'" x="'+x+'" y="'+y+'" width="'+cel+'" height="'+cel+'" rx="6" fill="'+(o.c||'var(--surf3)')+'"'
      +(o.borda?' stroke="'+o.borda+'" stroke-width="1.5"':'')+'/>'
      +'<text x="'+(x+cel/2)+'" y="'+(y+cel/2+1)+'" text-anchor="middle" class="calnum">'+d.slice(8)+'</text>'
      +(o.marca?'<text x="'+(x+cel/2)+'" y="'+(y+cel-4)+'" text-anchor="middle" class="calmk">'+o.marca+'</text>':'');
  });
  return s+'</svg>';
}
/* donut: só para categorias que se excluem e fecham 100% do universo declarado */
function donut(fatias,opt){
  opt=opt||{}; const R=opt.r||52, W=R*2+8, cx=W/2, cy=W/2, esp=opt.esp||16;
  const tot=fatias.reduce((a,f)=>a+f.v,0);
  if(!tot) return '<p class="empty">Sem dias no período.</p>';
  let ang=-Math.PI/2, s='<svg viewBox="0 0 '+W+' '+W+'" role="img" aria-label="'+esc(opt.aria||'composição')+'">';
  fatias.forEach(f=>{
    if(!f.v) return;
    const a2=ang+2*Math.PI*f.v/tot, grande=(a2-ang)>Math.PI?1:0;
    const p=(a,r)=>[(cx+r*Math.cos(a)).toFixed(2),(cy+r*Math.sin(a)).toFixed(2)];
    const A=p(ang,R),B=p(a2,R),Cc=p(a2,R-esp),Dd=p(ang,R-esp);
    s+='<path data-tip="'+esc(f.tip||(f.lb+': '+f.v))+'" d="M'+A+' A'+R+' '+R+' 0 '+grande+' 1 '+B
      +' L'+Cc+' A'+(R-esp)+' '+(R-esp)+' 0 '+grande+' 0 '+Dd+' Z" fill="'+f.c+'"/>';
    ang=a2;
  });
  s+='<text x="'+cx+'" y="'+(cy-2)+'" text-anchor="middle" class="dnum">'+tot+'</text>'
   +'<text x="'+cx+'" y="'+(cy+13)+'" text-anchor="middle" class="dlb">'+esc(opt.centro||'dias')+'</text>';
  return s+'</svg>';
}
/* traçado sobre MAPA DE FUNDO (William, 30/09/2026): os pontos registrados pela telemetria,
   exatamente como vieram do arquivo Ravex, desenhados sobre o mapa do OpenStreetMap.
   NADA é recalculado nem "encaixado" nas estradas: o mapa é só o fundo.
   Projeção: Web Mercator (a mesma dos mapas em blocos) para os pontos E para o fundo,
   por isso o traçado cai exatamente sobre a estrada correspondente.
   Se os blocos do mapa não carregarem (sem internet, rede bloqueada), aparece no lugar
   a grade de coordenadas de antes — o traçado nunca fica sem fundo. */
const _mx=lo=>(lo+180)/360;
const _my=la=>{const r=Math.max(-85.05,Math.min(85.05,la))*Math.PI/180; return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2;};
let __trcN=0;
function tracado(segs,opt){
  opt=opt||{}; const W=opt.w||320,H=opt.h||Math.round(Math.min(360,Math.max(220,W*0.72))),P=30;
  const todos=[].concat.apply([],segs);
  if(todos.length<2) return '<p class="empty">Sem pontos suficientes para desenhar o trecho.</p>';
  const pa=opt.pa||[];
  const extra=pa.map(p=>[p[2],p[3]]);
  const tudo=todos.concat(extra);
  let laN=Math.min.apply(null,tudo.map(p=>p[0])), laX=Math.max.apply(null,tudo.map(p=>p[0]));
  let loN=Math.min.apply(null,tudo.map(p=>p[1])), loX=Math.max.apply(null,tudo.map(p=>p[1]));
  const cosL=Math.cos((laN+laX)/2*Math.PI/180);
  // caixa em coordenadas de mapa (0..1), com folga de 8% e extensão mínima de ~1 km
  let mxN=Math.min.apply(null,tudo.map(p=>_mx(p[1]))), mxX=Math.max.apply(null,tudo.map(p=>_mx(p[1])));
  let myT=Math.min.apply(null,tudo.map(p=>_my(p[0]))), myB=Math.max.apply(null,tudo.map(p=>_my(p[0])));
  const minD=0.01/360;
  let dmx=Math.max(mxX-mxN,minD), dmy=Math.max(myB-myT,minD/cosL);
  const cx0=(mxN+mxX)/2, cy0=(myT+myB)/2;
  dmx*=1.16; dmy*=1.16;                         // 8% de cada lado
  mxN=cx0-dmx/2; myT=cy0-dmy/2;
  const k=Math.min((W-2*P)/dmx,(H-2*P)/dmy);   // px por unidade de mapa
  const ox=((W-2*P)-dmx*k)/2, oy=((H-2*P)-dmy*k)/2;
  const X=lo=>P+ox+(_mx(lo)-mxN)*k, Y=la=>P+oy+(_my(la)-myT)*k;
  const uid='trc'+(++__trcN);
  let s='<svg viewBox="0 0 '+W+' '+H+'" class="trc" role="img" aria-label="'+esc(opt.aria||'traçado sobre o mapa')+'">';
  s+='<defs><clipPath id="'+uid+'"><rect x="0" y="0" width="'+W+'" height="'+H+'" rx="10"/></clipPath></defs>';
  s+='<g class="trc-bg"><rect x="0" y="0" width="'+W+'" height="'+H+'" rx="10" fill="var(--surf2)"/>';
  // grade de coordenadas (reserva: só aparece se o mapa não carregar)
  const grLo=loN, grLoX=loX, grLa=laN, grLaX=laX;
  const dlaG=Math.max(laX-laN,0.01), dloG=Math.max(loX-loN,0.01);
  const passos=[0.01,0.02,0.05,0.1,0.2,0.25,0.5,1,2,5];
  const pg=passos.find(g=>Math.max(dlaG,dloG)/g<=6)||5;
  for(let v=Math.ceil(loN/pg)*pg; v<=loX; v+=pg){ const x=X(v);
    s+='<line x1="'+x.toFixed(1)+'" y1="'+(P-6)+'" x2="'+x.toFixed(1)+'" y2="'+(H-P+6)+'" stroke="var(--line)" stroke-dasharray="2 4"/>'
      +'<text class="trg" x="'+(x+3).toFixed(1)+'" y="'+(H-P+18)+'">'+v.toFixed(pg<0.1?2:1)+'°</text>'; }
  for(let v=Math.ceil(laN/pg)*pg; v<=laX; v+=pg){ const y=Y(v);
    s+='<line x1="'+(P-6)+'" y1="'+y.toFixed(1)+'" x2="'+(W-P+6)+'" y2="'+y.toFixed(1)+'" stroke="var(--line)" stroke-dasharray="2 4"/>'
      +'<text class="trg" x="4" y="'+(y-3).toFixed(1)+'">'+v.toFixed(pg<0.1?2:1)+'°</text>'; }
  s+='</g>';
  // norte e escala (fundo escuro translúcido para ler sobre o mapa claro)
  s+='<g transform="translate('+(W-22)+',24)"><circle r="15" fill="rgba(15,23,28,.72)"/><path d="M0 -10 L5 5 L0 2 L-5 5 Z" fill="#e8eef2"/><text class="trg" x="0" y="15" text-anchor="middle" style="font-weight:700;fill:#e8eef2">N</text></g>';
  const mPorPx=40075016.686*cosL/k;          // metros por pixel na latitude da figura
  const kmPorPx=mPorPx/1000;
  const alvoKm=kmPorPx*(W*0.25);
  const esc0=[0.05,0.1,0.2,0.5,1,2,5,10,20,25,50,100,200,250,500,1000].find(v=>v>=alvoKm*0.7)||alvoKm;
  const lpx=Math.min(W*0.45,esc0/kmPorPx);
  const escTxt=esc0<1?Math.round(esc0*1000)+' m':esc0+' km';
  s+='<g transform="translate('+P+','+(P-14)+')"><rect x="-6" y="-12" width="'+(lpx+12+escTxt.length*7+8).toFixed(1)+'" height="24" rx="6" fill="rgba(15,23,28,.72)"/>'
    +'<line x1="0" y1="0" x2="'+lpx.toFixed(1)+'" y2="0" stroke="#e8eef2" stroke-width="2"/>'
    +'<line x1="0" y1="-4" x2="0" y2="4" stroke="#e8eef2" stroke-width="2"/><line x1="'+lpx.toFixed(1)+'" y1="-4" x2="'+lpx.toFixed(1)+'" y2="4" stroke="#e8eef2" stroke-width="2"/>'
    +'<text class="trg" x="'+(lpx+6).toFixed(1)+'" y="4" style="fill:#e8eef2">'+escTxt+'</text></g>';
  // trajeto exatamente como registrado: contorno claro + sombra + linha; lacunas nunca ligadas
  segs.forEach(sg=>{
    if(sg.length<2) return;
    const d=sg.map((p,i)=>(i?'L':'M')+X(p[1]).toFixed(1)+' '+Y(p[0]).toFixed(1)).join(' ');
    s+='<path d="'+d+'" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>'
      +'<path d="'+d+'" fill="none" stroke="var(--s1)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
  });
  // paradas numeradas (mesma ordem da tabela)
  pa.forEach((p,i)=>{
    const x=X(p[3]).toFixed(1), y=Y(p[2]).toFixed(1);
    s+='<g data-tip="'+esc('<b>Parada '+(i+1)+'</b><br>'+hhmm(p[0])+'–'+hhmm(p[1])+' · '+durTxt(p[1]-p[0]))+'">'
      +'<circle cx="'+x+'" cy="'+y+'" r="9" fill="var(--surf)" stroke="var(--warn)" stroke-width="2"/>'
      +'<text x="'+x+'" y="'+(+y+4)+'" text-anchor="middle" class="trn">'+(i+1)+'</text></g>';
  });
  (opt.oc||[]).forEach(o=>{
    s+='<path data-tip="'+esc(o.tip||'')+'" d="M'+X(o.lo).toFixed(1)+' '+(Y(o.la)-6).toFixed(1)
      +' l6 11 l-12 0 Z" fill="var(--crit)" stroke="#fff" stroke-width="1.4"/>';
  });
  // inicio e fim com horario (contorno escuro no texto para ler sobre o mapa)
  const a=todos[0], z2=todos[todos.length-1];
  const marca=(p,cor,txt)=>{ const x=X(p[1]), y=Y(p[0]); const esq=x>W*0.62;
    return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="7" fill="'+cor+'" stroke="#fff" stroke-width="2.4"/>'
      +'<text class="trl" x="'+(esq?x-12:x+12).toFixed(1)+'" y="'+(y+4).toFixed(1)+'" text-anchor="'+(esq?'end':'start')
      +'" style="fill:'+cor+';paint-order:stroke;stroke:var(--surf);stroke-width:4px;stroke-linejoin:round">'+esc(txt)+'</text>'; };
  s+=marca(a,'var(--good)',opt.ini||'início')+marca(z2,'var(--s2)',opt.fim||'fim');
  // atribuição obrigatória (OpenFreeMap, OpenMapTiles e OpenStreetMap); só aparece quando o mapa de fundo está na tela
  s+='<a class="trc-attr" href="https://openfreemap.org/" target="_blank" rel="noopener"><rect x="'+(W-262)+'" y="'+(H-18)+'" width="258" height="15" rx="4" fill="rgba(15,23,28,.72)"/>'
    +'<text class="trg" x="'+(W-133)+'" y="'+(H-7)+'" text-anchor="middle" style="fill:#e8eef2;font-size:9.5px">OpenFreeMap © OpenMapTiles · Dados do OpenStreetMap</text></a>';
  // centro do enquadramento em coordenadas de mapa (0..1): o fundo usa o MESMO enquadramento do traçado
  const cmx=mxN+((W/2)-P-ox)/k, cmy=myT+((H/2)-P-oy)/k;
  return '<div class="trcwrap" data-w="'+W+'" data-k="'+k+'" data-mx="'+cmx+'" data-my="'+cmy+'">'
    +'<div class="trcmap" aria-hidden="true"></div>'+s+'</svg><div class="trcmsg" hidden></div></div>';
}

/* ---------- MAPA DE FUNDO (OpenFreeMap, vetorial, sem chave) ----------
   O traçado continua sendo o SVG acima, com as coordenadas originais da telemetria.
   Este bloco só coloca um mapa atrás dele, com o MESMO enquadramento (Web Mercator):
   zoom = log2(px por mundo / 512). Mapa não interativo: nada se move, nada é recalculado.
   O estilo vem do config.json (D.mapa.estilo). Sem internet ou se o provedor recusar: aparece uma mensagem clara e o traçado segue sobre a grade de coordenadas. */
const __mapas=[];
function mapaMsg(w,txt){ const m=w.querySelector('.trcmsg'); if(m){ m.textContent=txt; m.hidden=false; } w.classList.remove('mapok'); }
function mapaFecha(w){ if(w._mp){ try{ w._mp.remove(); }catch(_){ } w._mp=null; } if(w._to){ clearTimeout(w._to); w._to=null; } }
function mapaCria(w){
  if(w._mp||w._falha||!w.isConnected) return;
  const c=D.mapa||{};
  if(!c.estilo){ w._falha=1; mapaMsg(w,'Mapa de fundo não configurado. Trajeto exibido sobre a grade de coordenadas.'); return; }
  if(!window.maplibregl){ w._falha=1; mapaMsg(w,'Mapa de fundo indisponível neste navegador. Trajeto exibido sobre a grade de coordenadas.'); return; }
  const wd=w.clientWidth; if(!wd) return;
  const W0=+w.dataset.w, k=+w.dataset.k, mx=+w.dataset.mx, my=+w.dataset.my;
  const zoomDe=()=>Math.max(0,Math.log2(k*(w.clientWidth/W0)/512));
  const lon=mx*360-180, lat=Math.atan(Math.sinh(Math.PI*(1-2*my)))*180/Math.PI;
  const falha=(txt)=>{ if(w._falha) return; w._falha=1; mapaFecha(w); mapaMsg(w,txt); };
  let map;
  try{
    map=new maplibregl.Map({container:w.querySelector('.trcmap'),
      style:c.estilo,
      center:[lon,lat],zoom:zoomDe(),interactive:false,attributionControl:false,fadeDuration:0});
  }catch(e){ falha('Mapa de fundo não pôde ser iniciado neste navegador. Trajeto exibido sobre a grade de coordenadas.'); return; }
  w._mp=map; __mapas.push(w);
  map.on('error',e=>{
    const st=e&&e.error&&e.error.status;
    if(st===401||st===403||st===429) falha('Mapa de fundo recusado pelo provedor (código '+st+'). O trajeto continua correto, sobre a grade de coordenadas.');
    else if(!w._estiloOk) falha('O mapa de fundo não carregou (sem internet, rede bloqueada ou serviço fora do ar'+(st?'; código '+st:'')+'). O trajeto continua correto, sobre a grade de coordenadas.');
  });
  map.on('style.load',()=>{ w._estiloOk=1; });
  map.on('idle',()=>{ if(w._falha) return; if(w._to){ clearTimeout(w._to); w._to=null; } w.classList.add('mapok'); const m=w.querySelector('.trcmsg'); if(m) m.hidden=true; });
  w._to=setTimeout(()=>{ if(!w.classList.contains('mapok')) falha('O mapa de fundo não carregou (sem internet ou rede bloqueada). O trajeto continua correto, sobre a grade de coordenadas.'); },15000);
  if(window.ResizeObserver){ const ro=new ResizeObserver(()=>{ if(w._mp){ w._mp.resize(); w._mp.jumpTo({center:[lon,lat],zoom:zoomDe()}); } }); ro.observe(w); w._ro=ro; }
}
let __mapObs=null;
function iniciaMapas(host){
  for(let i=__mapas.length-1;i>=0;i--){ const w=__mapas[i]; if(!w.isConnected){ if(w._ro) w._ro.disconnect(); mapaFecha(w); __mapas.splice(i,1); } }
  const ws=(host||document).querySelectorAll('.trcwrap:not([data-obs])'); if(!ws.length) return;
  if(!('IntersectionObserver' in window)){ ws.forEach(w=>{ w.setAttribute('data-obs','1'); mapaCria(w); }); return; }
  if(!__mapObs) __mapObs=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) mapaCria(e.target); else if(e.target._mp){ mapaFecha(e.target); e.target.classList.remove('mapok'); } }),{rootMargin:'300px'});
  ws.forEach(w=>{ w.setAttribute('data-obs','1'); __mapObs.observe(w); });
}
/* ---------- cavalo e carreta ----------
   Cavalo = placa da telemetria (tipo 1). A carreta vem do CRG LOG, dia a dia (D.carreta[placa][dia]),
   e pode mudar de viagem para viagem: lista as distintas dos dias do recorte, da mais usada para a menos. */
function tipoPlaca(p){ const v=VIDX[p]; return (v&&String(v.tipo)==='2')?'carreta':'cavalo'; }
function carretasDe(p,mot){
  const m=(D.carreta||{})[p]; if(!m) return [];
  const ds=diasSel(), cont={}, todas={};
  ds.forEach(d=>{ const c=m[d]; if(!c) return; todas[c]=(todas[c]||0)+1; if(!mot||motDe(p,d)===mot) cont[c]=(cont[c]||0)+1; });
  const base=Object.keys(cont).length?cont:todas;
  return Object.keys(base).sort((a,b)=>base[b]-base[a]||(a<b?-1:1));
}
/* etiqueta padrão de todo gráfico: pergunta, unidade, período, sentido, ressalva */
function figura(titulo,sub,svg,leitura,nota){
  return '<figure class="fig"><figcaption><b>'+esc(titulo)+'</b>'
   +(sub?'<span>'+esc(sub)+'</span>':'')+'</figcaption>'
   +(typeof svg==='function'?slot(svg):'<div class="chart">'+svg+'</div>')
   +(leitura?'<p class="leit">'+leitura+'</p>':'')
   +(nota?'<p class="ress">'+esc(nota)+'</p>':'')+'</figure>';
}
