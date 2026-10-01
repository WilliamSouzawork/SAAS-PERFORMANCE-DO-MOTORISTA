// De onde veio a atribuicao deste motorista. So existem duas origens legitimas.
function rotuloOrigem(o){
  const m={apisul:'Apisul (SMP)','crg log':'CRG LOG','romaneio':'romaneio do SSW','manual':'decisão registrada no livro-razão'};
  const l=(o||[]).filter(Boolean).map(x=>m[x]||x);
  return l.length?l.join(' e '):'pendente de validação';
}

/* ================= 2. MOTORISTAS ================= */
function vMotoristas(C,V,T,M){
  let L=motFiltrados().slice();
  const ord={score:(a,b)=>(b.score??-1)-(a.score??-1),ader:(a,b)=>(b.ader??-1)-(a.ader??-1),
    km:(a,b)=>(b.km||0)-(a.km||0),ev:(a,b)=>(b.ev100??-1)-(a.ev100??-1),evol:(a,b)=>(b.evol??-999)-(a.evol??-999)};
  L.sort(ord[S.motOrd]||ord.score);
  let h='<div class="card"><div class="hd"><div><h2>Todos os motoristas do período</h2>'
   +'<p class="cap">Clique no nome para abrir o cartão de desempenho. Passe o mouse na linha para ver o resumo completo. '
   +'A placa e o modelo aparecem como contexto — são eles que definem a meta de cada um.</p></div>'
   +'<div class="seg" id="segmotord">'
   +[['score','Score'],['ader','Aderência à meta'],['km','Quilometragem'],['ev','Eventos'],['evol','Evolução']]
     .map(([k,l])=>'<button data-o="'+k+'" aria-pressed="'+(S.motOrd===k)+'">'+l+'</button>').join('')
   +'</div></div>'+tabelaMot(L,true)+'</div>';

  const comK=L.filter(x=>x.kml&&x.meta_lo);
  if(comK.length){
    h+='<div class="card"><h2>Consumo contra a meta do modelo</h2>'
     +'<p class="cap">Cada barra é um motorista. A marca tracejada é a faixa esperada do modelo que ele dirigiu — por isso motoristas de modelos diferentes podem ser comparados sem injustiça.</p>'
     +slot(w=>hbars(comK.slice().sort((a,b)=>a.ader-b.ader).map(x=>({
        lb:(w<560?nomeCurto(x.m):x.m)+' · '+x.placas[0],v:x.kml,
        c:x.ader>=100?'var(--good)':x.ader>=90?'var(--warn)':'var(--crit)',
        vl:n2(x.kml)+'  ('+sgn(x.difp,0)+'%)',
        band:x.meta_hi&&x.meta_hi!==x.meta_lo?[x.meta_lo,x.meta_hi]:null,ref:x.meta_hi&&x.meta_hi!==x.meta_lo?null:x.meta_lo,
        tip:tipMotorista(x)})),{w:w,lw:230,rw:104,labelRight:true,axis:true,aria:'consumo por motorista contra a meta'}))
     +'<div class="legend"><span><i class="sw" style="background:var(--good)"></i>na meta ou acima</span>'
     +'<span><i class="sw" style="background:var(--warn)"></i>de 90% a 100% da meta</span>'
     +'<span><i class="sw" style="background:var(--crit)"></i>abaixo de 90% da meta</span>'
     +'<span><i class="sw" style="background:transparent;border:1.5px dashed var(--ink2);border-radius:2px;width:16px"></i>faixa esperada do modelo</span></div></div>';
  }
  const nParc=motEscopo().filter(x=>x.score==null).length;
  if(nParc&&S.base.has('rank')&&!S.base.has('parcial'))
    h+='<div class="note w"><b>'+nParc+' motoristas estão fora desta lista</b> porque a base deles não fecha 75 dos 100 pontos do score — '
      +'quase sempre por dirigir placa cujo contador de litros não funciona. Ative o filtro <b>Base parcial</b> para vê-los com os indicadores que existem. '
      +'Não é desempenho ruim: é ausência de medição.</div>';
  return h;
}

/* ================= 3. CARTÃO DO MOTORISTA =================
   Três experiências, um só conjunto de dados:
     1. cartão interativo simples  (sempre visível: resultado, situação,
        significado, direção e orientação)
     2. detalhes sob demanda       (<details> fechados: histórico, gráficos,
        variação em p.p., composição da nota, conta técnica)
     3. imagem do WhatsApp         (.bolso — "Resumo de bolso": composição
        própria, legível sem clique, pensada para largura de celular)
   Nenhum número é calculado aqui de outro jeito: tudo sai de valMet(),
   tendencia(), planoAcoes() e dos campos do motor, como antes. */

/* ---------- glossário único de comunicação ----------
   O ⓘ, o cartão, o resumo de bolso e a mensagem do WhatsApp leem daqui.
   Os limites "ideal" são os que o cartão já usava (faixa verde 65%, marcha
   lenta 12%, acima do limite 8%) — só saíram do meio do código. As dicas de
   marcha lenta e velocidade vêm do catálogo de eventos (CATEV), a mesma
   orientação do Plano de ação. */
/* alerta que fala do mesmo assunto de um indicador */
const TEMA_EV={'Excesso de Velocidade':'vel','marcha lenta excessiva (CAN)':'ml'};
/* nome do alerta para o motorista: sem "Nível 2" e sem "(CAN)" — o nível
   continua no texto de apoio e na tabela dos detalhes */
function nomeAlerta(ev){
  const t=String(ev).replace(/\s*-\s*n[íi]vel\s*\d*\s*$/i,'').replace(/\s*\(CAN\)\s*/i,'').trim();
  return t.charAt(0).toUpperCase()+t.slice(1).toLowerCase();
}
function dicaCatalogo(ev,reserva){ const c=CATEV[ev]; return (c&&c[2])||reserva; }
const INFO_MET={
  score:{nome:'Nota',pergunta:'O que significa minha nota?',
    oque:'Nota de 0 a 100 que junta consumo, faixa verde, marcha lenta, velocidade, segurança, constância e evolução no período. 80 ou mais é bom; de 60 a 79 pede atenção; abaixo de 60 é prioridade.'},
  rank:{nome:'Posição',pergunta:'Como a posição é definida?',
    oque:'Sua colocação pela nota entre os motoristas que tiveram medição suficiente para receber nota no mesmo período.'},
  kml:{nome:'Consumo',unid:'km/l',dir:'maior',pergunta:'O que significa km/l?',
    oque:'Mostra quantos quilômetros o caminhão percorreu com um litro de diesel. Quanto maior o número, melhor o aproveitamento do diesel.',
    ler:'maior é melhor',
    foco:'Melhorar o consumo',
    dica:()=>'Mais tempo na faixa verde, menos tempo parado com o motor ligado e frenagens antecipadas são os hábitos que mais pesam no km/l.'},
  eco:{nome:'Faixa verde',dir:'maior',ideal:65,pergunta:'O que é faixa verde?',
    oque:'É a faixa de rotação em que o motor trabalha de forma mais econômica. Permanecer mais tempo nela, quando a operação permite, tende a ajudar no consumo.',
    frase:v=>'Você passou '+n1(v)+'% do tempo de motor ligado na faixa econômica do motor.',
    ler:'mais tempo é melhor',foco:'Ficar mais tempo na faixa verde',
    dica:()=>'Troque de marcha antes de a rotação subir e permaneça mais tempo na faixa verde quando as condições da viagem permitirem.'},
  ml:{nome:'Marcha lenta',dir:'menor',ideal:12,pergunta:'O que é marcha lenta?',
    oque:'É o tempo em que o caminhão ficou parado com o motor funcionando. Motor ligado parado gasta diesel sem andar.',
    frase:v=>'O caminhão ficou parado com o motor ligado em '+n1(v)+'% do tempo de motor.',
    ler:'menos tempo é melhor',foco:'Reduzir a marcha lenta',
    dica:()=>dicaCatalogo('marcha lenta excessiva (CAN)','Desligue o motor em parada acima de 3 minutos.')
      +' Faça isso quando for seguro e adequado à operação.'},
  vel:{nome:'Acima do limite',dir:'menor',ideal:8,pergunta:'O que é tempo acima do limite?',
    oque:'É o tempo em que o caminhão rodou acima do limite de velocidade configurado no equipamento para a operação.',
    frase:v=>'O caminhão rodou acima do limite configurado em '+n1(v)+'% do tempo de motor.',
    ler:'menos tempo é melhor',foco:'Reduzir o tempo acima do limite',
    dica:()=>dicaCatalogo('Excesso de Velocidade','Procure permanecer dentro do limite configurado para a operação.')},
  ev:{nome:'Alertas de direção',pergunta:'O que são os alertas?',
    oque:'Avisos gravados pelo equipamento do caminhão, como distância curta, desvio de faixa ou celular. São indício de comportamento, não infração comprovada.'}
};
/* botão ⓘ: foco, clique e toque abrem o mesmo texto curto do glossário */
function infoI(k){
  const g=INFO_MET[k]; if(!g) return '';
  return '<button type="button" class="info" aria-label="'+esc(g.pergunta)+'" data-tip="'
    +esc('<b>'+esc(g.pergunta)+'</b><br>'+esc(g.oque))+'">i</button>';
}
/* situação de cada indicador — só com limites que já existem no painel.
   Faixa verde, marcha lenta e velocidade têm UM limite (o ideal): dois
   estados. Consumo tem referência e piso do modelo: três estados. A nota usa
   os cortes 80/60 que o painel inteiro usa. Sem medição é estado próprio,
   nunca "ruim". */
const SIT={bom:{s:'✓',c:'var(--good)',ci:'var(--goodink)'},aten:{s:'!',c:'var(--warn)',ci:'var(--warnink)'},
  crit:{s:'!!',c:'var(--crit)',ci:'var(--critink)'},sem:{s:'—',c:'var(--line2)',ci:'var(--ink2)'}};
function situacao(k,v,mo){
  const mk=(n,t)=>Object.assign({n:n,t:t},SIT[n]);
  if(k==='score'){
    if(v==null) return mk('sem','Ainda sem nota comparável');
    return v>=80?mk('bom','Bom resultado'):v>=60?mk('aten','Bom caminho, com pontos de atenção'):mk('crit','Resultado precisa de atenção');
  }
  if(v==null) return mk('sem','Sem medição no período');
  if(k==='kml'){
    if(!mo||!mo.meta_lo) return mk('sem','Veículo sem referência publicada');
    if(v>=mo.meta_lo) return mk('bom','Dentro da referência do veículo');
    if(mo.piso&&v>=mo.piso) return mk('aten','Abaixo da referência do veículo');
    return mk('crit','Abaixo do piso do veículo');
  }
  const g=INFO_MET[k];
  const ok=g.dir==='maior'?v>=g.ideal:v<=g.ideal;
  return ok?mk('bom','Dentro do ideal'):mk('aten',k==='eco'?'Pode melhorar':'Merece atenção');
}
const chipSit=(st,cls)=>'<span class="csit'+(cls?' '+cls:'')+'" style="color:'+st.ci+';border-color:'+st.c+'"><i>'+st.s+'</i> '+esc(st.t)+'</span>';
const setaDir=k=>INFO_MET[k].dir==='maior'?'↑ Quanto maior, melhor':'↓ Quanto menor, melhor';
const idealTxt=k=>{const g=INFO_MET[k]; return g.ideal==null?'':(g.dir==='maior'?'O ideal é '+g.ideal+'% ou mais.':'O ideal é até '+g.ideal+'%.');};

/* ---------- a leitura do motorista, calculada UMA vez ----------
   Usada pelo cartão, pelo resumo de bolso e pela mensagem do WhatsApp — os
   três dizem a mesma coisa porque leem o mesmo objeto. */
let ESTADO_TESTE=null;
function analiseMotorista(mo){
  const dsel=diasSel(), i0=S.de, i1=S.ate;
  const ROT=(dsel.length>1?dcurto(dsel[0])+' a '+dcurto(dsel[dsel.length-1]):dcurto(dsel[0]));
  const S2=serieAcc([mo],i0,i1,S.placa||'');
  const TOT=accTotal(S2);
  const ctx={meta_lo:mo.meta_lo,meta_hi:mo.meta_hi,piso:mo.piso,modelo:mo.modelo};
  const kml=valMet('kml',TOT,ctx), vEco=valMet('eco',TOT,ctx), vMl=valMet('ml',TOT,ctx), vVel=valMet('vel',TOT,ctx);
  const tKml=tendencia(S2,'kml',ctx);
  /* dias */
  const dias=[]; let nBom=0,nAt=0,nRuim=0,nSemMed=0,nSemReg=0;
  dsel.forEach((d,j)=>{
    const a=S2[i0+j], v=a?valMet('kml',a,ctx):null;
    if(!a){nSemReg++; dias.push({d:d,a:null,v:null,st:'semreg'}); return;}
    if(v==null){nSemMed++; dias.push({d:d,a:a,v:null,st:'semmed'}); return;}
    let st;
    if(mo.meta_lo&&v>=mo.meta_lo){st='bom';nBom++;}
    else if(mo.piso&&v>=mo.piso){st='aten';nAt++;}
    else {st='crit';nRuim++;}
    dias.push({d:d,a:a,v:v,st:st});
  });
  const med=dias.filter(x=>x.v!=null);
  const melhor=med.length>1?med.reduce((a,b)=>b.v>a.v?b:a):null;
  const pior=med.length>1?med.reduce((a,b)=>b.v<a.v?b:a):null;
  const acoes=planoAcoes().filter(a=>a.mot===mo.m);
  /* pontos fortes: mesmos critérios de antes, agora com título curto */
  const fortes=[];
  if(mo.ader!=null&&mo.ader>=100) fortes.push({k:'kml',t:'Consumo',d:'Dentro da referência do veículo ('+n0(mo.ader)+'% dela).'});
  if(vEco!=null&&vEco>=65) fortes.push({k:'eco',t:'Faixa verde',d:n0(vEco)+'% do tempo na faixa econômica do motor.'});
  if(vMl!=null&&vMl<=12) fortes.push({k:'ml',t:'Marcha lenta',d:'Pouco tempo parado com o motor ligado ('+n0(vMl)+'%).'});
  if(vVel!=null&&vVel<=8) fortes.push({k:'vel',t:'Velocidade',d:'Quase nenhum tempo acima do limite ('+n0(vVel)+'%).'});
  if(tKml.ok&&tKml.dir==='melhor') fortes.push({k:'kml',t:'Evolução',d:'O consumo melhorou '+n1(Math.abs(tKml.drel))+'% do começo ao fim do período.'});
  if(mo.cons!=null&&mo.cons>=80) fortes.push({k:'kml',t:'Constância',d:n0(mo.cons)+'% dos dias no piso do veículo ou acima.'});
  if(nEvDe(TOT)===0&&bandaDe(TOT).base>7200) fortes.push({k:'ev',t:'Segurança',d:'Nenhum alerta de direção registrado para você.'});
  if(!fortes.length&&nBom>0) fortes.push({k:'kml',t:'Dias bons',d:nBom+' dia(s) com consumo na referência ou acima.'});
  /* oportunidades de condução: a maior distância até o ideal (critério de antes) */
  const ops=[];
  if(mo.ader!=null&&mo.ader<100) ops.push({k:'kml',g:(100-mo.ader)/15,
    d:'Seu consumo ficou em '+n0(mo.ader)+'% da referência do veículo. O ideal é 100% ou mais.'});
  if(vMl!=null&&vMl>12) ops.push({k:'ml',g:(vMl-12)/12,d:n0(vMl)+'% do tempo parado com o motor ligado. O ideal é até 12%.'});
  if(vEco!=null&&vEco<65) ops.push({k:'eco',g:(65-vEco)/25,d:n0(vEco)+'% do tempo na faixa verde. O ideal é 65% ou mais.'});
  if(vVel!=null&&vVel>8) ops.push({k:'vel',g:(vVel-8)/10,d:n0(vVel)+'% do tempo acima do limite. O ideal é até 8%.'});
  ops.sort((a,b)=>b.g-a.g);
  /* foco: segurança grave primeiro; depois alerta de prioridade média; depois
     a maior oportunidade de condução; por último alerta de prioridade baixa.
     Queda de nível de combustível é assunto do gestor, não do motorista. */
  const acD=acoes.filter(a=>a.cat!=='Combustível');
  const evFoco=a=>({tipo:'ev',k:TEMA_EV[a.ev]||'ev',t:nomeAlerta(a.ev),seg:a.prio==='A',
    d:n0(a.n)+' alerta(s) de “'+a.ev+'” no período'+(a.freq!=null?' ('+n1(a.freq)+' a cada 100 km)':'')+'.',dica:a.orient});
  const opFoco=o=>({tipo:'op',k:o.k,t:INFO_MET[o.k].foco,d:o.d,dica:INFO_MET[o.k].dica()});
  const cand=[];
  acD.filter(a=>a.prio==='A').forEach(a=>cand.push(evFoco(a)));
  acD.filter(a=>a.prio==='M').forEach(a=>cand.push(evFoco(a)));
  ops.forEach(o=>cand.push(opFoco(o)));
  acD.filter(a=>a.prio==='B').forEach(a=>cand.push(evFoco(a)));
  const foco=cand[0]||null;
  // o secundário tem de ser OUTRO assunto: alerta de excesso de velocidade e
  // tempo acima do limite são a mesma conversa
  const segundo=foco?(cand.find(c=>c!==foco&&c.k!==foco.k&&c.tipo!==foco.tipo)||cand.find(c=>c!==foco&&c.k!==foco.k)||null):null;
  const semDados=kml==null&&vEco==null&&!acD.length;
  let estado=semDados?'semdados':(foco?'foco':'continue');
  if(ESTADO_TESTE) estado=ESTADO_TESTE;     // so' a auditoria usa (window.CRG.testeEstado)
  return {mo,dsel,i0,i1,ROT,S2,TOT,ctx,kml,vEco,vMl,vVel,tKml,dias,nBom,nAt,nRuim,nSemMed,nSemReg,
    melhor,pior,acoes,fortes,ops,foco,segundo,estado,pos:mo.pos,tot:RANK.length,
    sScore:situacao('score',mo.score,mo),sKml:situacao('kml',kml,mo)};
}

/* frase curta do foco, para a mensagem do WhatsApp */
function focoCurto(A){
  if(A.estado==='semdados') return '';
  if(A.estado==='continue') return 'Seus principais indicadores ficaram dentro do esperado neste período.';
  return 'Seu principal foco agora: '+A.foco.t.charAt(0).toLowerCase()+A.foco.t.slice(1)+'.';
}

/* ---------- consumo dia a dia, sem eixo nem legenda ----------
   Uma linha por dia: data, barra, número e o que ele quer dizer. A marca
   vertical tracejada é a referência do veículo. Substitui o gráfico de linha
   na primeira camada; o gráfico continua nos detalhes. */
function diasKml(A){
  const mo=A.mo, vals=A.dias.filter(x=>x.v!=null).map(x=>x.v);
  if(!vals.length) return '<p class="ress">Nenhum dia com medição de consumo válida neste período.</p>';
  const topo=Math.max.apply(null,vals.concat([mo.meta_hi||0,mo.meta_lo||0]))*1.08;
  const ref=mo.meta_lo?Math.min(100,100*mo.meta_lo/topo):null;
  const rot={bom:'✓ na referência',aten:'! abaixo da referência',crit:'!! abaixo do piso',semmed:'sem medição de consumo',semreg:'sem registro seu'};
  const cor={bom:'var(--good)',aten:'var(--warn)',crit:'var(--crit)'};
  const sem=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  return '<div class="dk" role="list" aria-label="consumo em cada dia">'+A.dias.map(x=>{
    const ds=sem[new Date(x.d+'T12:00:00').getDay()];
    const barra=x.v==null?'<div class="dk_b vazio"></div>'
      :'<div class="dk_b"><i style="width:'+Math.max(2,100*x.v/topo).toFixed(1)+'%;background:'+cor[x.st]+'"></i>'
        +(ref!=null?'<em style="left:'+ref.toFixed(1)+'%"></em>':'')+'</div>';
    return '<div class="dk_r'+(x.v==null?' mudo':'')+'" role="listitem"><span class="dk_d"><b>'+dlab(x.d)+'</b> '+ds+'</span>'+barra
      +'<span class="dk_v">'+(x.v==null?'—':n2(x.v))+'</span>'
      +'<span class="dk_s" style="color:'+(cor[x.st]||'var(--ink3)')+'">'+rot[x.st]+'</span></div>';
  }).join('')+'</div>'
  +(ref!=null?'<p class="dk_leg"><i></i> referência do veículo: '+(mo.meta_hi&&mo.meta_hi!==mo.meta_lo?n1(mo.meta_lo)+' a '+n1(mo.meta_hi):n2(mo.meta_lo))+' km/l</p>':'');
}

/* ---------- um indicador de condução, nas duas camadas ---------- */
function blocoIndicador(A,k){
  const v=valMet(k,A.TOT,A.ctx), g=INFO_MET[k], st=situacao(k,v,A.mo);
  let h='<div class="mt" style="--mtc:'+st.c+'"><div class="mt_h"><span class="mt_n">'+esc(g.nome)+'</span>'+infoI(k)+'</div>';
  if(v==null) return h+'<div class="mt_v">—</div>'+chipSit(st)+'<p class="mt_e">A telemetria não trouxe tempo de motor suficiente para medir este indicador. Isso não é desempenho ruim.</p></div>';
  h+='<div class="mt_v">'+n1(v)+'%</div>'+chipSit(st)
   +'<p class="mt_e">'+esc(g.frase(v))+'</p>'
   +'<p class="mt_dir">'+setaDir(k)+' · '+idealTxt(k)+'</p>'
   +(st.n==='bom'?'<p class="mt_c"><b>Continue assim.</b> Este indicador está dentro do ideal.</p>'
                 :'<p class="mt_c"><b>Como melhorar:</b> '+esc(g.dica())+'</p>');
  const t=tendencia(A.S2,k,A.ctx), ser=A.S2.map(a=>valMet(k,a,A.ctx)).slice(A.i0,A.i1+1);
  h+='<details class="vd"><summary>Ver detalhes</summary><div class="vd_c">';
  if(t.ok){
    const mais=g.dir==='maior';
    const txt=t.dir==='estavel'?'Ficou praticamente igual do começo ao fim do período.'
      :(t.b>t.a?(k==='eco'?'↑ Você passou mais tempo na faixa verde.':'↑ Esse tempo aumentou.')
               :(k==='eco'?'↓ Você passou menos tempo na faixa verde.':'↓ Esse tempo diminuiu.'))
       +(t.dir==='melhor'?' Isso é bom.':' Isso merece atenção.');
    h+='<div class="aa"><div><span>No começo do período</span><b>'+n1(t.a)+'%</b></div><div class="aa_s">→</div>'
      +'<div><span>No fim do período</span><b>'+n1(t.b)+'%</b></div></div>'
      +'<p class="mt_t" style="color:'+corTend(t)+'">'+esc(txt)+'</p>'
      +'<div class="kv"><span>Variação</span><b>'+sgn(t.dpp,1)+' p.p.</b></div>'
      +'<p class="ress">Comparação entre os primeiros '+t.nb+' e os últimos '+t.nb+' dias com medição (de '+t.n+'). p.p. = pontos percentuais.</p>';
  } else h+='<p class="ress">'+esc(t.txt)+(t.det?' — '+esc(t.det):'')+'</p>';
  if(ser.filter(x=>x!=null).length>1)
    h+='<div class="mt_sp">'+slot(w=>sparkline(ser,{w:w,h:46,c:corTend(t),aria:g.nome+' por dia'}),'sp')+'</div><p class="ress">Cada ponto é um dia do período.</p>';
  h+='<div class="kv"><span>Horas de motor medidas</span><b>'+n1(bandaDe(A.TOT).base/3600)+' h</b></div>';
  return h+'</div></details></div>';
}

/* ---------- RESUMO DE BOLSO: a imagem que vai pelo WhatsApp ----------
   Só aparece dentro de .paraimagem. Não tem botão, ⓘ nem "ver detalhes":
   tudo o que é essencial está escrito. Ordem: quem / nota / o que foi bem /
   seus números / seu foco agora / como ler este cartão. */
function resumoBolso(A){
  const mo=A.mo, sc=A.sScore;
  const linha=(k,rot,val,st,extra)=>'<div class="bo_l"><div class="bo_ln"><b>'+rot+'</b>'+(extra?'<span>'+extra+'</span>':'')+'</div>'
    +'<div class="bo_lv">'+val+'</div><div class="bo_ls" style="color:'+st.ci+'"><i style="border-color:'+st.c+'">'+st.s+'</i>'+esc(st.t)+'</div></div>';
  const ref=mo.meta_lo?'referência '+(mo.meta_hi&&mo.meta_hi!==mo.meta_lo?n1(mo.meta_lo)+' a '+n1(mo.meta_hi):n2(mo.meta_lo)):'';
  let h='<div class="bolso">'
   +'<div class="bo_top"><div class="bo_k">Cartão do motorista</div><div class="bo_nome">'+esc(mo.m)+'</div>'
   +'<div class="bo_per">'+esc(A.ROT)+' · '+A.dsel.length+' dia(s)</div></div>'
   +'<div class="bo_nota" style="--boc:'+sc.c+'"><div class="bo_nv" style="color:'+corScore(mo.score)+'">'+(mo.score==null?'—':n0(mo.score))+'</div>'
   +'<div><div class="bo_nk">Sua nota · de 0 a 100</div><div class="bo_ns" style="color:'+sc.ci+'">'+sc.s+' '+esc(sc.t)+'</div>'
   +(mo.score!=null&&A.pos?'<div class="bo_np">'+A.pos+'º lugar entre '+A.tot+' motoristas</div>'
     :mo.score==null?'<div class="bo_np">A medição do período não foi suficiente para dar nota. Isso não é desempenho ruim.</div>':'')
   +'</div></div>';
  if(A.fortes.length){
    const f=A.fortes[0];
    h+='<div class="bo_s bo_bom"><div class="bo_t">✓ Você foi bem</div><div class="bo_x"><b>'+esc(f.t)+'</b> — '+esc(f.d)+'</div></div>';
  }
  h+='<div class="bo_s"><div class="bo_t">Seus números</div>'
   +linha('kml','Consumo',A.kml==null?'—':n2(A.kml)+' <small>km/l</small>',A.sKml,ref?ref+' km/l':'')
   +linha('eco','Faixa verde',A.vEco==null?'—':n0(A.vEco)+'%',situacao('eco',A.vEco,mo),'do tempo de motor')
   +linha('ml','Marcha lenta',A.vMl==null?'—':n0(A.vMl)+'%',situacao('ml',A.vMl,mo),'parado com motor ligado')
   +linha('vel','Acima do limite',A.vVel==null?'—':n0(A.vVel)+'%',situacao('vel',A.vVel,mo),'de velocidade')
   +'</div>';
  if(A.estado==='foco'){
    h+='<div class="bo_s bo_foco'+(A.foco.seg?' bo_seg':'')+'"><div class="bo_t">'+(A.foco.seg?'⚠ ':'→ ')+'Seu foco agora</div>'
     +'<div class="bo_ft">'+esc(A.foco.t)+'</div><div class="bo_x">'+esc(A.foco.d)+'</div>'
     +'<div class="bo_prox"><span>Na próxima viagem</span>'+esc(A.foco.dica)+'</div></div>';
  } else if(A.estado==='continue'){
    h+='<div class="bo_s bo_foco ok"><div class="bo_t">✓ Continue assim</div>'
     +'<div class="bo_x">Seus principais indicadores ficaram dentro do esperado neste período. Continue mantendo esse padrão.</div></div>';
  } else {
    h+='<div class="bo_s bo_foco neutro"><div class="bo_t">Ainda não há dados suficientes</div>'
     +'<div class="bo_x">Precisamos de mais medições para identificar sua principal oportunidade. Falta de medição não é desempenho ruim.</div></div>';
  }
  h+='<div class="bo_s bo_ler"><div class="bo_t">Como ler este cartão</div>'
   +'<div class="bo_r"><b>Consumo (km/l)</b><span>↑ maior é melhor</span></div>'
   +'<div class="bo_r"><b>Faixa verde</b><span>↑ mais tempo é melhor</span></div>'
   +'<div class="bo_r"><b>Marcha lenta</b><span>↓ menos tempo é melhor</span></div>'
   +'<div class="bo_r"><b>Acima do limite</b><span>↓ menos tempo é melhor</span></div>'
   +'<div class="bo_nr"><b>Nota de 0 a 100</b><span>80 ou mais: bom</span><span>60 a 79: pede atenção</span><span>abaixo de 60: prioridade</span></div>'
   +'<div class="bo_leg"><span><i style="border-color:var(--good);color:var(--goodink)">✓</i>dentro do esperado</span>'
   +'<span><i style="border-color:var(--warn);color:var(--warnink)">!</i>merece atenção</span>'
   +'<span><i style="border-color:var(--line2);color:var(--ink2)">—</i>sem medição</span></div></div>'
   +'<div class="bo_rod">km/l = quilômetros por litro de diesel · faixa verde = rotação econômica do motor · marcha lenta = parado com motor ligado</div>'
   +'</div>';
  return h;
}

function vCard(C,V,T,M){
  const nome=S.mot||(RANK[0]&&RANK[0].m);
  const mo=MOTIDX[nome];
  let h='<div class="card"><div class="hd"><div><h2>Cartão do motorista</h2>'
   +'<p class="cap">Feito para ser lido pelo próprio motorista. Primeiro a explicação; os números completos ficam em “Ver detalhes”.</p></div>'
   +'<div class="fg"><label for="f_card">Motorista</label><select id="f_card" style="min-width:260px">'
   + MOTP.slice().sort((a,b)=>a.m.localeCompare(b.m)).map(x=>'<option value="'+esc(x.m)+'"'+(x.m===nome?' selected':'')+'>'+esc(x.m)+(x.score==null?' (base parcial)':'')+'</option>').join('')
   +'</select></div></div>';
  if(!mo){h+='<p class="empty">Selecione um motorista.</p></div>';return h;}
  h+='</div>';

  const A=analiseMotorista(mo);
  const {dsel,i0,i1,ROT,S2,TOT,ctx,kml,tKml,acoes,pos,tot}=A;
  const sc=A.sScore;

  h+='<div class="cartao">';
  /* ---------- 1. COMO ESTOU ---------- */
  h+='<div class="ctopo"><div class="cnome"><h2>'+esc(mo.m)+'</h2>'
   +'<p>'+esc(ROT)+' · '+dsel.length+' dia(s) · '+esc(mo.modelo||'modelo não identificado')+'</p>'
   +'<p class="cplacas">'+((mo.placas||[]).map(p=>esc(p)+': '+tipoPlaca(p)+carretasDe(p,mo.m).map(c=>' · '+esc(c)+': carreta').join('')).join(' &nbsp;|&nbsp; ')||'sem placa')+'</p>'
   +chipSit(sc,'selo2')+'</div>'
   +'<div class="cscore"><div class="cs_lb">Sua nota '+infoI('score')+'</div>'
   +'<div class="cs_v" style="color:'+corScore(mo.score)+'">'+(mo.score==null?'—':n0(mo.score))+'</div>'
   +'<div class="cs_l">'+(mo.score==null?'sem medição suficiente para nota':'de 0 a 100'+(pos?'<br><b>'+pos+'º</b> de '+tot+' '+infoI('rank'):''))+'</div></div></div>';
  h+='<details class="vd vd_nota"><summary>Ver como a nota foi calculada</summary><div class="vd_c">';
  if(!mo.score_comp||!mo.score_comp.length) h+='<p class="ress">Sem componentes suficientes para montar a nota.</p>';
  else{
    h+='<div class="comp">';
    mo.score_comp.forEach(c=>{
      h+='<div class="cn">'+esc(c[0])+'<div style="font-size:12px;color:var(--ink3)">'+esc(c[3])+'</div></div>'
       +'<div class="cv">'+n1(c[2])+' / '+c[1]+'</div>'
       +'<div class="cb"><i style="width:'+(100*c[2]/c[1])+'%"></i></div><div></div>';
    });
    h+='</div><p class="ress">Cobertura da base: '+n0(mo.cobertura)+' dos 100 pontos possíveis. '
      +(mo.score_parcial?'Os pontos que não puderam ser medidos não contam contra o motorista — a nota é a média proporcional do que foi medido.':'Todos os componentes foram medidos.')
      +' A cobertura mínima de '+REGUA.minimo+' pontos é critério para entrar no ranking, não meta de desempenho.</p>';
  }
  h+='</div></details>';

  /* ---------- 2. O QUE VOCÊ PRECISA SABER ----------
     A interpretação vem pronta: como estou, o que fiz bem, o que pede
     atenção, o que fazer. Um foco principal e, no máximo, um secundário. */
  const comoFoi=[];
  comoFoi.push(mo.score==null
    ? 'A medição do período cobriu '+n0(mo.cobertura)+' dos 100 pontos da nota. Com menos de '+REGUA.minimo+', a nota não é comparada com a dos colegas. Falta de medição não é desempenho ruim.'
    : 'Nota <b>'+n0(mo.score)+'</b> de 100'+(pos?' — <b>'+pos+'º</b> lugar entre '+tot+' motoristas.':'.'));
  if(kml!=null) comoFoi.push('Consumo de <b>'+n2(kml)+' km/l</b>'+(mo.ader!=null?' — <b>'+n0(mo.ader)+'%</b> da referência do seu veículo.':'.'));
  h+='<div class="saber"><div class="sb_t">O que você precisa saber</div><div class="sbgrid">'
   +'<div class="sb" style="--sbc:'+sc.c+'"><div class="sb_l">Como você está</div><ul>'+comoFoi.map(t=>'<li>'+t+'</li>').join('')+'</ul></div>'
   +'<div class="sb" style="--sbc:var(--good)"><div class="sb_l">✓ O que você fez bem</div>'
     +(A.fortes.length?'<ul>'+A.fortes.slice(0,2).map(f=>'<li><b class="sb_k">'+esc(f.t)+'</b> — '+esc(f.d)+'</li>').join('')+'</ul>'
       :'<p>Neste período nenhum indicador passou da referência. Isso não apaga o trabalho feito — é o que a telemetria mediu.</p>')+'</div>';
  if(A.estado==='foco'){
    h+='<div class="sb" style="--sbc:'+(A.foco.seg?'var(--crit)':'var(--warn)')+'"><div class="sb_l">'+(A.foco.seg?'⚠ ':'')+'Precisa da sua atenção</div>'
     +'<p><b class="sb_n">'+esc(A.foco.t)+'</b><br>'+esc(A.foco.d)+'</p>'
     +(A.segundo?'<p class="sb_2">Também vale atenção: <b class="sb_k">'+esc(A.segundo.t)+'</b></p>':'')+'</div>'
     +'<div class="sb" style="--sbc:var(--acc)"><div class="sb_l">→ Na próxima viagem</div><p>'+esc(A.foco.dica)+'</p></div>';
  } else if(A.estado==='continue'){
    h+='<div class="sb" style="--sbc:var(--good)"><div class="sb_l">✓ Continue assim</div><p>Seus principais indicadores ficaram dentro do esperado neste período. Continue mantendo esse padrão.</p></div>'
     +'<div class="sb" style="--sbc:var(--acc)"><div class="sb_l">→ Na próxima viagem</div><p>Mantenha a mesma forma de dirigir: é ela que está dando resultado.</p></div>';
  } else {
    h+='<div class="sb" style="--sbc:var(--line2)"><div class="sb_l">Ainda não há dados suficientes</div><p>Precisamos de mais medições para identificar sua principal oportunidade.</p></div>'
     +'<div class="sb" style="--sbc:var(--line2)"><div class="sb_l">Por quê</div><p>A telemetria não trouxe leituras suficientes do seu caminhão no período. Falta de medição não é desempenho ruim.</p></div>';
  }
  h+='</div></div>';

  /* ---------- 3. COMO FOI MEU CONSUMO ----------
     Conclusão antes do gráfico. */
  const evo=!tKml.ok?'Ainda não dá para dizer se o consumo melhorou: '+(tKml.det||tKml.txt)
    :tKml.dir==='melhor'?'↑ Seu consumo melhorou ao longo do período: de '+n2(tKml.a)+' para '+n2(tKml.b)+' km/l.'
    :tKml.dir==='pior'?'↓ Seu consumo piorou ao longo do período: de '+n2(tKml.a)+' para '+n2(tKml.b)+' km/l.'
    :'= Seu consumo ficou estável: '+n2(tKml.a)+' km/l no começo e '+n2(tKml.b)+' km/l no fim do período.';
  const nMed=A.nBom+A.nAt+A.nRuim;
  h+='<div class="sec"><div class="sec_t">Seu consumo '+infoI('kml')+'</div>'
   +'<div class="cons"><div class="cons_v">'+(kml==null?'—':n2(kml))+'<span>km/l</span></div>'
   +'<div class="cons_t">'+chipSit(A.sKml)
   +'<p>'+(mo.meta_lo?'A referência do seu veículo ('+esc(mo.modelo||'')+') é '+(mo.meta_hi&&mo.meta_hi!==mo.meta_lo?n1(mo.meta_lo)+' a '+n1(mo.meta_hi):n2(mo.meta_lo))+' km/l.':'Seu veículo ainda não tem referência publicada.')
   +' '+setaDir('kml')+'.</p></div></div>'
   +'<div class="cons_g">'
   +(A.melhor?'<div><span>Melhor dia</span><b>'+dlab(A.melhor.d)+' — '+n2(A.melhor.v)+' km/l</b></div>':'')
   +(A.pior&&A.pior!==A.melhor?'<div><span>Dia que merece atenção</span><b>'+dlab(A.pior.d)+' — '+n2(A.pior.v)+' km/l</b></div>':'')
   +(nMed?'<div><span>Dias na referência ou acima</span><b>'+A.nBom+' de '+nMed+' dias medidos</b></div>':'')
   +'</div>'
   +'<p class="cons_e" style="color:'+corTend(tKml)+'">'+esc(evo)+'</p>'
   +diasKml(A);
  /* detalhes do consumo: o gráfico de linha, o calendário e a composição */
  const serKml=S2.map(a=>valMet('kml',a,ctx)).slice(i0,i1+1);
  const cls=A.dias.map(x=>{
    const dt=x.d.split('-').reverse().join('/');
    if(x.st==='semreg') return {c:'var(--surf3)',marca:'·',tip:'<b>'+dt+'</b><br>sem registro seu neste dia<br><span style="color:var(--ink3)">falta de telemetria não é falta de trabalho</span>'};
    if(x.st==='semmed') return {c:'var(--surf3)',borda:'var(--line2)',marca:'—',tip:'<b>'+dt+'</b><br>dia com registro, sem medição de consumo válida<br>'+n0(x.a.km||0)+' km lidos'};
    const c=x.st==='bom'?'var(--good)':x.st==='aten'?'var(--warn)':'var(--crit)', mk=x.st==='bom'?'✓':x.st==='aten'?'~':'!';
    return {c:c,marca:mk,tip:'<b>'+dt+'</b><br><b>'+n3(x.v)+'</b> km/l<br>'+n0(x.a.km)+' km · '+n0(x.a.L)+' L'+(mo.meta_lo?'<br>referência '+n2(mo.meta_lo)+' km/l':'')};
  });
  const grupos=[['na referência ou acima',A.nBom,'var(--good)'],['entre o piso e a referência',A.nAt,'var(--warn)'],
    ['abaixo do piso',A.nRuim,'var(--crit)'],['com registro, sem medição',A.nSemMed,'var(--line2)'],['sem registro seu',A.nSemReg,'var(--surf3)']];
  h+='<details class="vd"><summary>Ver detalhes do consumo</summary><div class="vd_c">'
   +'<div class="kv"><span>Consumo no período</span><b>'+(kml==null?'sem leitura':n3(kml)+' km/l')+'</b></div>'
   +(tKml.ok?'<div class="kv"><span>Começo → fim do período</span><b>'+n3(tKml.a)+' → '+n3(tKml.b)+' km/l ('+sgn(tKml.drel,1)+'%)</b></div>':'')
   +'<div class="kv"><span>Distância e diesel medidos</span><b>'+(TOT.km?n0(TOT.km)+' km':'—')+' · '+(TOT.L?n0(TOT.L)+' L':'—')+'</b></div>'
   +(nMed?figura('Gráfico de linha do consumo','km/l em cada dia · '+ROT,
      w=>lineChart([{nome:mo.m,c:corScore(mo.score),pts:serKml}],dsel.map(dlab),
        {w:w,unid:'km/l',dec:3,decx:2,
         band:(mo.meta_hi&&mo.meta_hi!==mo.meta_lo)?[mo.meta_lo,mo.meta_hi]:null,
         ref:(mo.meta_hi&&mo.meta_hi!==mo.meta_lo)?null:mo.meta_lo,piso:mo.piso,
         aria:'rendimento diário de '+mo.m}),
      'A faixa verde é a referência do seu veículo; a linha tracejada é o piso.',null):'')
   +'<div class="cdias2"><div class="cd_cal">'+figura('Seus dias no calendário','cor pelo km/l do dia contra a referência do veículo · não avalia segurança',
       w=>heatCal(dsel,cls,{w:w,aria:'rendimento por dia de '+mo.m}),null,null)+'</div>'
   +'<div class="cd_comp"><div class="cd_t">Seus '+dsel.length+' dias</div>'
   +'<div class="cd_row">'+donut(grupos.map(g=>({lb:g[0],v:g[1],c:g[2],tip:g[1]+' dia(s) '+g[0]})),{r:54,esp:15,centro:'dias',aria:'composição dos dias'})
   +'<ul class="cd_leg">'+grupos.map(g=>'<li><i style="background:'+g[2]+(g[2]==='var(--surf3)'?';border:1px solid var(--line2)':'')+'"></i><b>'+g[1]+'</b> '+esc(g[0])+'</li>').join('')+'</ul></div>'
   +'<p class="ress">Dia sem registro não quer dizer folga nem falta: a telemetria não trouxe leitura sua naquele dia.</p></div></div>'
   +'</div></details></div>';

  /* ---------- 4. COMO DIRIGI ---------- */
  h+='<div class="sec"><div class="sec_t">Como você dirigiu</div>';
  if(['eco','ml','vel'].some(k=>valMet(k,TOT,ctx)!=null))
    h+='<div class="mtgrid">'+['eco','ml','vel'].map(k=>blocoIndicador(A,k)).join('')+'</div>';
  else h+='<p class="ress">A telemetria não trouxe tempo de motor suficiente no período (mínimo de '+n0(REGUA.min_banda/3600)+' h). Sem essa base, faixa verde, marcha lenta e velocidade não são avaliadas — e isso não conta contra você.</p>';
  /* alertas: transformados em orientação */
  const ac=acoes.filter(a=>a.cat!=='Combustível');
  h+='<div class="evb"><div class="mt_h"><span class="mt_n">Alertas de direção</span>'+infoI('ev')+'</div>';
  if(!ac.length) h+='<p class="mt_e">Nenhum alerta de direção registrado para você no período.</p>'
    +'<p class="ress">Sem alerta registrado quer dizer sem registro de alerta — depende de os sensores terem coberto todo o período.</p>';
  else{
    const a=ac[0];
    h+='<div class="evb_p"><span>Principal ponto de atenção</span><b>'+esc(a.ev)+'</b><em>'+a.n+' ocorrência(s)</em></div>'
     +'<p class="mt_e">'+(a.prio==='A'?'É o alerta que mais pesa no seu resultado e na sua segurança neste período.':'É o alerta que mais apareceu para você neste período.')+'</p>'
     +'<p class="mt_c"><b>Como melhorar:</b> '+esc(a.orient)+'</p>';
  }
  if(acoes.length){
    h+='<details class="vd"><summary>Ver todos os alertas ('+acoes.length+')</summary><div class="vd_c">'
     +'<div class="tw" style="margin-top:0"><table><thead><tr><th>Comportamento</th><th class="r">Qtde</th><th>Prioridade</th></tr></thead><tbody>';
    acoes.forEach(a=>{h+='<tr><td style="font-size:13px" data-ev="'+esc(a.ev)+'">'+esc(a.ev)+'</td><td class="r mono">'+a.n+'</td>'
      +'<td><span class="prio2 p'+a.prio+'">'+PRIOICON[a.prio]+' '+PRIONOME[a.prio]+'</span></td></tr>';});
    h+='</tbody></table></div><p class="ress">Toque ou passe o mouse no nome do alerta para ver a orientação. Alerta de equipamento é indício de comportamento, não infração comprovada.</p></div></details>';
  }
  h+='</div></div>';

  /* ---------- resumo de bolso (só na imagem) ---------- */
  h+=resumoBolso(A);
  h+='</div>';  /* fim .cartao */

  /* ---------- 9. DETALHAMENTO ---------- */
  const nBom=A.nBom,nAt=A.nAt,nRuim=A.nRuim;
  h+='<details class="card vdcard"><summary><span><b>Ver detalhamento técnico completo</b><br><small>A conta por trás de cada número, para conferência do gestor.</small></span></summary><div class="cardgrid det2">';
  h+='<div class="blk"><h3>Resultado</h3>'
   +'<div class="kv"><span>Consumo realizado</span><b>'+(kml==null?'sem leitura':n3(kml)+' km/l')+'</b></div>'
   +'<div class="kv"><span>Referência do veículo</span><b>'+(mo.meta_lo?(mo.meta_hi&&mo.meta_hi!==mo.meta_lo?n1(mo.meta_lo)+'–'+n1(mo.meta_hi):n2(mo.meta_lo))+' km/l':'—')+'</b></div>'
   +'<div class="kv"><span>Diferença</span><b class="'+(mo.difp==null?'':mo.difp<0?'neg':'pos')+'">'+(mo.difp==null?'—':sgn(mo.difp,1)+'%')+'</b></div>'
   +'<div class="kv"><span>Aderência à referência</span><b>'+(mo.ader==null?'—':n0(mo.ader)+'%')+'</b></div>'
   +'<div class="kv"><span>Distância medida</span><b>'+(TOT.km?n0(TOT.km)+' km':'—')+'</b></div>'
   +'<div class="kv"><span>Diesel medido</span><b>'+(TOT.L?n0(TOT.L)+' L':'—')+'</b></div>'
   +(TOT.L?'<div class="kv"><span>Custo do diesel</span><b>'+rs(TOT.L*S.preco)+'</b></div>':'')
   +'<div class="kv"><span>Dias com medição de consumo</span><b>'+(nBom+nAt+nRuim)+' de '+dsel.length+'</b></div>'
   +'<div class="ress">Referência: '+esc(mo.origem_meta||'—')+'</div></div>';
  h+='<div class="blk"><h3>Comportamento ao volante</h3>'
   +(valMet('eco',TOT,ctx)==null?'<p class="ress">Sem tempo por faixa de rotação suficiente no período.</p>'
     :'<div class="kv"><span>Faixa verde <i>(rotação econômica)</i></span><b>'+n0(valMet('eco',TOT,ctx))+'%</b></div>'
      +'<div class="kv"><span>Faixa amarela ou vermelha</span><b>'+n0(mo.p_amarela)+'%</b></div>'
      +'<div class="kv"><span>Marcha lenta <i>(parado ligado)</i></span><b>'+n0(valMet('ml',TOT,ctx))+'%</b></div>'
      +'<div class="kv"><span>Acima do limite de velocidade</span><b>'+n0(valMet('vel',TOT,ctx))+'%</b></div>'
      +'<div class="kv"><span>Em inércia</span><b>'+n0(mo.p_inercia||0)+'%</b></div>'
      +'<div class="kv"><span>Horas de motor medidas</span><b>'+n1(bandaDe(TOT).base/3600)+' h</b></div>')
   +'<div class="kv" style="margin-top:6px"><span>Alertas de segurança</span><b>'+mo.n_seg+'</b></div>'
   +'<div class="kv"><span>Alertas de fadiga e conduta</span><b>'+mo.n_fad+'</b></div>'
   +'<div class="kv"><span>Alertas de eficiência</span><b>'+mo.n_efi+'</b></div>'
   +'<div class="kv"><span>Pontos de evento por 100 km</span><b>'+(mo.ev100==null?'—':n1(mo.ev100))+'</b></div>'
   +'<div class="ress">Horas de motor é tempo de máquina ligada lido pela telemetria — não é jornada de trabalho. '
   +'Alerta de equipamento é indício de comportamento, não infração comprovada.</div></div>';
  h+='<div class="blk"><h3>Como a nota foi montada</h3>';
  if(!mo.score_comp||!mo.score_comp.length) h+='<p class="ress">Sem componentes suficientes.</p>';
  else{
    h+='<div class="comp">';
    mo.score_comp.forEach(c=>{
      h+='<div class="cn">'+esc(c[0])+'<div style="font-size:11.5px;color:var(--ink3)">'+esc(c[3])+'</div></div>'
       +'<div class="cv">'+n1(c[2])+' / '+c[1]+'</div>'
       +'<div class="cb"><i style="width:'+(100*c[2]/c[1])+'%"></i></div><div></div>';
    });
    h+='</div><div class="ress">Cobertura da base: '+n0(mo.cobertura)+' dos 100 pontos possíveis. '
      +(mo.score_parcial?'Os pontos ausentes não contam contra o motorista — a nota é a média proporcional do que foi medido.':'Todos os componentes foram medidos.')
      +' Os '+REGUA.minimo+' pontos de cobertura mínima são critério de base para entrar no ranking, não meta de desempenho.</div>';
  }
  h+='</div>';
  h+='<div class="blk"><h3>Oportunidades de melhoria</h3>';
  if(!acoes.length) h+='<p class="ress">Nenhum comportamento de risco registrado no período.</p>';
  else{
    h+='<div class="tw" style="margin-top:0"><table><thead><tr><th>Comportamento</th><th class="r">Qtde</th><th>Prioridade</th></tr></thead><tbody>';
    acoes.slice(0,6).forEach(a=>{h+='<tr><td style="font-size:12.5px">'+esc(a.ev)+'</td><td class="r mono">'+a.n+'</td>'
      +'<td><span class="prio2 p'+a.prio+'">'+PRIOICON[a.prio]+' '+PRIONOME[a.prio]+'</span></td></tr>';});
    h+='</tbody></table></div>';
  }
  h+='</div></div></details>';

  /* ---------- 10. TRAJETOS ---------- */
  const meus=[];
  (mo.placas||[]).forEach(p=>{
    Object.keys(TRAJ[p]||{}).forEach(d=>{
      const j=DIAS.indexOf(d);
      if(j<i0||j>i1) return;
      if(motDe(p,d)!==mo.m) return;
      if(S.placa&&p!==S.placa) return;
      meus.push({p:p,d:d,r:TRAJ[p][d]});
    });
  });
  meus.sort((a,b)=>a.d<b.d?1:-1);
  h+='<details class="card vdcard"><summary><span><b>Ver onde o veículo esteve</b><br><small>'+(meus.length?meus.length+' dia(s) com trajeto registrado':'nenhum trajeto no recorte')+' · links do Google Maps</small></span></summary>'
   +'<p class="cap">Os trechos dos dias atribuídos a você no recorte. Posição registrada pela telemetria — '+esc(MAPS_AVISO)+'</p>';
  if(!meus.length) h+='<p class="empty">Nenhum trecho com coordenada para você no recorte atual.</p>';
  else{
    const movel=ehMovel();
    h+='<div class="tw"><table><thead><tr><th>Dia</th><th>Placa</th><th class="r">Posições</th><th>Período observado</th><th class="r">Paradas</th><th>Google Maps</th></tr></thead><tbody>';
    meus.slice(0,20).forEach(x=>{
      const segs=(x.r.pl||[]).map(t=>decPoly(t,4)), pts=[].concat.apply([],segs);
      const ls=gmapsTrechos(pts,movel);
      h+='<tr><td class="mono">'+dlab(x.d)+'</td><td class="mono">'+esc(x.p)+'</td>'
       +'<td class="r mono">'+n0(x.r.n)+'</td>'
       +'<td class="mono">'+hhmm(x.r.t0)+'–'+hhmm(x.r.t1)+'</td>'
       +'<td class="r mono">'+((x.r.pa||[]).length)+'</td>'
       +'<td>'+(ls.length?(ls.length>1?'<a class="lnk" target="_blank" rel="noopener" href="'+gmapsDir(pts,movel)+'" title="Rota completa do dia em um só link (pontos amostrados)"><b>Rota completa ↗</b></a> · ':'')+ls.map((u,i)=>'<a class="lnk" target="_blank" rel="noopener" href="'+u+'">'+(ls.length>1?'Trecho '+(i+1):'Ver trajeto')+' ↗</a>').join(' · ')
              :(pts.length===1?'<a class="lnk" target="_blank" rel="noopener" href="'+gmapsLoc(pts[0][0],pts[0][1])+'">Ver localização ↗</a>':'<span class="ress">sem coordenada suficiente</span>'))+'</td></tr>';
    });
    h+='</tbody></table></div>';
    if(meus.length>20) h+='<p class="ress">Mostrando 20 de '+meus.length+' dia(s). A aba Rotas e trajetos traz todos, com traçado e paradas.</p>';
    h+='<p style="margin-top:12px"><button class="lnk" data-ir="rotas">Abrir a aba Rotas e trajetos com este motorista ↗</button></p>';
  }
  h+='</details>';
  h+=blocoWhats(mo.m);
  return h;
}
