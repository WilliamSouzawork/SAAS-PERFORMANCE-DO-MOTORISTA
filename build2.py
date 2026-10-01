# -*- coding: utf-8 -*-
import pandas as pd, numpy as np, json, re, unicodedata
B=pd.read_pickle('base.pkl'); df=pd.read_pickle('df.pkl'); res=pd.read_pickle('res.pkl')
ATTR,ORIG,PD,CAT,FAIXA,rom,cad=B['ATTR'],B['ORIG'],B['PD'],B['CAT'],B['FAIXA'],B['rom'],B['cad']
TEM_SSW=len(rom)>0
import json as _json
DIAS=_json.load(open('periodo.json'))['dias']
TESTE={'Gustavo Teste Motorista'}
P=json.load(open('dados.json'))
PLMOD={v['p']:v['m'] for v in P['veic']}; PTIPO={v['p']:v.get('tipo') for v in P['veic']}; FAIXAS=P['faixas']; REFS=P['refs']  # PTIPO: 1=cavalo, 2=carreta (cadastro Ravex, confirmado pelo William 30/09/2026)
QUAL=dict(zip(res['placa'],res['qualidade']))

def norm(s):
    s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().upper()
    return re.sub(r'\s+',' ',re.sub(r'[^A-Z ]','',s)).strip()
def titulo(s):
    return ' '.join(w.lower() if w.lower() in ('de','da','do','dos','das','e') else w.capitalize()
                    for w in str(s).strip().split())
CANON={norm(v):v for v in set(cad.values())}
def canon(nome):
    n=norm(nome)
    if n in CANON: return CANON[n]
    for c,v in CANON.items():
        if c.startswith(n) or n.startswith(c): return v
    return titulo(nome)

# ---------- QUEM DIRIGIU ----------
# build2 NAO decide atribuicao. Ela ja foi decidida uma unica vez em
# etapas/atribuicao.py e gravada no base.pkl pelo motor.py. Recalcular aqui foi
# o erro que, em versoes anteriores, deixou o total certo e o detalhe errado.
import os
A=dict(ATTR); O=dict(ORIG)
STATUS=B.get('STATUS',{}); LAC=B.get('LAC',[])
# conflito para auditoria: onde o cadastro fixo da Ravex discorda da Apisul.
# E' so' exibicao — o cadastro nao atribui nada.
CONF=[[p,dia,'Apisul: '+m,'Cadastro Ravex: '+cad[p]]
      for (p,dia),m in A.items()
      if O.get((p,dia))=='apisul' and cad.get(p) and canon(cad[p])!=m]
# quem o William marcou como IGNORAR (agregado/autonomo/terceiro) continua
# atribuido — os km contam na cobertura — mas nao entra no ranking nem nos KPIs.
IGNORA=set(pd.read_pickle('smp.pkl').get('ignorados',[])) if os.path.exists('smp.pkl') else set()
if IGNORA: print('   fora da avaliacao por decisao (IGNORAR): '+', '.join(sorted(IGNORA)))

# placa-dia classificado como OPERACIONAL (oficina, patio/manobra, deslocamento
# RMMG, rota conhecida da SJB5D52) pelo livro-razao ou por raio.py: nao e'
# motorista, entao nunca entra no ranking nem nos KPIs de pessoa — mas o
# litro/km continuam existindo e precisam ficar visiveis nos totais da frota
# (aba Patio, desde 30/09/2026 — antes era um bloco unico na aba Pendencias).
# "Estava na oficina"/"em manobra"/"foi a' RMMG" nao encerra sozinho a analise
# do consumo: isso so' descreve QUEM/O QUE nao dirigiu, nao SE o consumo esta'
# ok. Tres grupos, pedido pelo William para ficarem visualmente separados:
#   PATIO         manobra interna, perto da CRG (raio.py, classif=='PATIO')
#   DESLOCAMENTO  RMMG + rota conhecida da SJB5D52 (mesma coisa, so' muda o
#                 destino geografico — decisao do William, 30/09/2026)
#   OFICINA       classificacao manual do livro-razao (nao vem de raio.py)
OPROT=B.get('OPROT',{}); VIAGENS_RMMG=B.get('VIAGENS_RMMG',{}); TEMPO_RAIO=B.get('TEMPO_RAIO',{})
OFICINA=[]; PATIO=[]; DESLOCAMENTO=[]
for (p,dia),m in A.items():
    if O.get((p,dia))!='operacional': continue
    rr=PD.get((p,dia),{})
    km_=rr.get('km') or 0.0; L_=rr.get('L') or 0.0
    base=dict(PLACA=p,DIA=dia,CLASSIFICACAO=m,
              km=round(km_,1),L=round(L_,1),
              kml=round(km_/L_,3) if L_ else None,
              qualidade=QUAL.get(p))
    rot=OPROT.get((p,dia),{})
    # tempo dentro do raio de referencia da linha (min): RMMG -> raio da RMMG;
    # pátio e rota recorrente -> raio da CRG; oficina (manual) -> sem referencia
    _t=TEMPO_RAIO.get((p,dia))
    if _t is not None and not (m.startswith('PATIO') or m.startswith('DESLOCAMENTO RMMG') or 'ROTA RECORRENTE' in m):
        _t=None
    _k='rmmg' if m.startswith('DESLOCAMENTO RMMG') else 'crg'
    base['TIPO']={1:'cavalo',2:'carreta'}.get(PTIPO.get(p)); base['MODELO']=PLMOD.get(p) or ''
    base['TEMPO_MIN']=_t[_k] if _t else None
    base['TEMPO_PARADO_MIN']=_t.get(_k+'_parado') if _t else None
    base['ROTEIRO']=rot.get('ROTEIRO',''); base['MAPA']=rot.get('MAPA','')
    OFICINA.append(dict(base))  # mantido por compatibilidade (nao usado mais no front)
    if m.startswith('PATIO'):
        PATIO.append(base)
    elif m.startswith('DESLOCAMENTO RMMG') or 'ROTA RECORRENTE' in m:
        d2=dict(base)
        d2['DESTINO']='RMMG' if m.startswith('DESLOCAMENTO RMMG') else 'SJB5D52 (rota recorrente)'
        d2['VIAGENS']=VIAGENS_RMMG.get((p,dia))
        DESLOCAMENTO.append(d2)
# a lista OFICINA acima ficou com TUDO (compatibilidade); a de verdade so'
# manutencao/oficina (o que nao e' patio nem deslocamento) e' filtrada aqui:
OFICINA=[x for x in OFICINA if not x['CLASSIFICACAO'].startswith('PATIO')
         and not x['CLASSIFICACAO'].startswith('DESLOCAMENTO RMMG')
         and 'ROTA RECORRENTE' not in x['CLASSIFICACAO']]
if PATIO or DESLOCAMENTO or OFICINA:
    print('   classificados como operacional (fora do ranking, dentro dos totais): patio=%d deslocamento=%d oficina=%d'
          %(len(PATIO),len(DESLOCAMENTO),len(OFICINA)))

dd=df.copy(); dd['dia']=dd['dt'].dt.strftime('%Y-%m-%d')
dd['mot']=[A.get((p,x)) for p,x in zip(dd['Veiculo_Placa'],dd['dia'])]
BANDAS=['marcha_lenta','transicao','verde','verde_eco','amarela','vermelha']
MOT={}
def novo(m):
    # 'dd' guarda o mesmo que os totais, mas dia a dia: e' o que permite ao painel
    # recalcular o score de um recorte de datas sem inventar rateio.
    return dict(m=m,placas={},dias=set(),orig=set(),faixa={},ml=0.0,ev={},evdia={},
                km=0.0,L=0.0,diasKm=0,serie={},dd={})
def _dd(o,dia):
    return o['dd'].setdefault(dia,{'faixa':{},'ml':0.0,'ev':{},'km':0.0,'L':0.0,'pl':[],'nv':0,'det':{}})
def _det(d0,placa):
    # detalhe por placa dentro do dia. So' 2,3% dos dias-motorista tem mais de uma
    # placa, mas nesses o total do dia NAO pode ser exibido como se fosse de uma
    # placa so'. Guardar o detalhe e' o que permite ao filtro de placa/modelo
    # responder com o que e' daquela placa, e nao com o total do motorista.
    return d0['det'].setdefault(placa,{'faixa':{},'ml':0.0,'ev':{},'km':0.0,'L':0.0,'nv':0})
for r in dd[dd['mot'].notna()].itertuples(index=False):
    m=r.mot
    if m in IGNORA or O.get((r.Veiculo_Placa,r.dia))=='operacional': continue
    o=MOT.setdefault(m,novo(m)); ev=r.Evento_Nome
    o['placas'][r.Veiculo_Placa]=o['placas'].get(r.Veiculo_Placa,0)+1
    o['dias'].add(r.dia); o['orig'].add(O.get((r.Veiculo_Placa,r.dia)))
    if not isinstance(ev,str): continue
    d0=_dd(o,r.dia); dt_=_det(d0,r.Veiculo_Placa)
    if ev in FAIXA:
        v=r.Posicao_CanDuracaoEventoSegundos
        if v==v and v is not None:
            o['faixa'][FAIXA[ev]]=o['faixa'].get(FAIXA[ev],0)+float(v)
            d0['faixa'][FAIXA[ev]]=d0['faixa'].get(FAIXA[ev],0)+float(v)
            dt_['faixa'][FAIXA[ev]]=dt_['faixa'].get(FAIXA[ev],0)+float(v)
    if ev=='marcha lenta excessiva (CAN)':
        v=r.Posicao_MarchaLentaSegundos
        if v==v and v is not None: o['ml']+=float(v); d0['ml']+=float(v); dt_['ml']+=float(v)
    if ev in CAT:
        o['ev'][ev]=o['ev'].get(ev,0)+1
        d0['ev'][ev]=d0['ev'].get(ev,0)+1
        dt_['ev'][ev]=dt_['ev'].get(ev,0)+1
        if CAT[ev][0] in ('Segurança','Fadiga e conduta'):
            o['evdia'][r.dia]=o['evdia'].get(r.dia,0)+CAT[ev][1]
for (p,dia),m in A.items():
    if m in IGNORA or O.get((p,dia))=='operacional': continue
    o=MOT.setdefault(m,novo(m)); o['orig'].add(O.get((p,dia))); o['placas'].setdefault(p,0)
    _d=_dd(o,dia)
    if p not in _d['pl']: _d['pl'].append(p)
    rr=PD.get((p,dia),{})
    if QUAL.get(p) in ('Alta','Media') and rr.get('km') and rr.get('L'):
        k,L=rr['km'],rr['L']
        if 0.8<=k/L<=6.0:
            o['km']+=k; o['L']+=L; o['diasKm']+=1
            e=o['serie'].setdefault(dia,{'km':0.0,'L':0.0,'p':p}); e['km']+=k; e['L']+=L
            d0=_dd(o,dia); d0['km']+=k; d0['L']+=L; d0['nv']+=1
            dt_=_det(d0,p); dt_['km']+=k; dt_['L']+=L; dt_['nv']+=1
# o nome do romaneio vem truncado em 30 caracteres: passa pelo cadastro antes de
# somar carga e frete, senao nao casa com o nome oficial e a aba Motorista e
# carga fica vazia mesmo com o SSW presente
_CADN=None
if os.path.exists('crglog.pkl'):
    try:
        import importlib.util as _iu3
        _s3=_iu3.spec_from_file_location('crglog',os.path.join(os.path.dirname(os.path.abspath(__file__)),'crglog.py'))
        _CL3=_iu3.module_from_spec(_s3); _s3.loader.exec_module(_CL3)
        _c3=pd.read_pickle('crglog.pkl'); _CADN=(_CL3,_c3['cadastro'],_c3.get('equiv',{}))
    except Exception: _CADN=None
def _nomeRom(n):
    if _CADN:
        o=_CADN[0].identidade(n,_CADN[1],_CADN[2])[0]
        if o: return o
    return canon(n)
for _,r in rom.iterrows():
    m=_nomeRom(r['motorista'])
    if m in MOT:
        MOT[m]['peso']=MOT[m].get('peso',0)+(r['peso'] or 0)/1000
        MOT[m]['frete']=MOT[m].get('frete',0)+(r['frete'] or 0)
        MOT[m]['rom']=MOT[m].get('rom',0)+1
        MOT[m]['ctrc']=MOT[m].get('ctrc',0)+0

def meta_de(placas):
    ms=sorted({PLMOD.get(p) for p in placas if PLMOD.get(p)})
    if len(ms)==1:
        m=ms[0]
        if m in FAIXAS: f=FAIXAS[m]; return m,f['alvo'][0],f['alvo'][1],f['piso'],'faixa de campo do modelo'
        if m in REFS:  return m,REFS[m],None,round(REFS[m]*0.85,2),'referência interna, não validada'
    if len(ms)>1:
        lo=[];hi=[];pi=[]
        for m in ms:
            if m in FAIXAS: lo.append(FAIXAS[m]['alvo'][0]);hi.append(FAIXAS[m]['alvo'][1]);pi.append(FAIXAS[m]['piso'])
            elif m in REFS: lo.append(REFS[m]);hi.append(REFS[m]);pi.append(REFS[m]*0.85)
        if lo: return ' + '.join(ms),round(float(np.mean(lo)),2),round(float(np.mean(hi)),2),round(float(np.mean(pi)),2),'média dos modelos dirigidos'
    return None,None,None,None,None

def lin(x,a,b):
    if x is None: return None
    return float(min(1,max(0,(x-a)/(b-a))))

# Pontos de corte da regua, num lugar so'. O painel recebe este dicionario e usa
# exatamente os mesmos numeros quando recalcula o score de um recorte de datas —
# assim as duas pontas nunca divergem.
REGUA=dict(ader=[70,100,30], eco=[20,70,20], ml=[10,35,5], vel=[5,35,10],
           ev100=[0,80,20], cons=[0,100,10], evol=[-5,5,5], minimo=75, min_banda=3600)

OUT=[]
for m,o in MOT.items():
    placas=[p for p,n in sorted(o['placas'].items(),key=lambda x:-x[1])]
    modn,lo,hi,piso,om=meta_de(placas)
    kml=(o['km']/o['L']) if o['L'] else None
    banda=sum(o['faixa'].get(k,0) for k in ['transicao','verde','verde_eco','amarela','vermelha'])
    base=banda+o['ml']
    ok_beh=(banda>=REGUA['min_banda'])   # exige pelo menos 1h de faixa de RPM lida; marcha lenta sozinha nao basta
    pc=lambda k: round(100*o['faixa'].get(k,0)/base,1) if ok_beh else None
    p_eco=round(100*(o['faixa'].get('verde_eco',0)+o['faixa'].get('verde',0))/base,1) if ok_beh else None
    p_am=round(100*(o['faixa'].get('amarela',0)+o['faixa'].get('vermelha',0))/base,1) if ok_beh else None
    p_ml=round(100*o['ml']/base,1) if ok_beh else None
    p_ex=pc('excesso_vel'); p_in=pc('inercia'); p_fm=pc('freio_motor')
    pesoev=sum(n*CAT[e][1] for e,n in o['ev'].items() if CAT[e][0] in ('Segurança','Fadiga e conduta'))
    ev100=round(pesoev/(o['km']/100),1) if o['km'] else None
    serie=[]; 
    for dia in DIAS:
        e=o['serie'].get(dia); serie.append(round(e['km']/e['L'],4) if e and e['L'] else None)
    val=[x for x in serie if x]
    cons=round(100*sum(1 for x in val if piso and x>=piso)/len(val),0) if (val and piso) else None
    evol=None
    if len(val)>=4:
        h=len(val)//2; a=float(np.mean(val[:h])); b=float(np.mean(val[-h:]))
        evol=round(100*(b/a-1),1) if a else None
    ader=round(100*kml/lo,1) if (kml and lo) else None
    # ---------- SCORE ----------
    comp=[]; tot=0.0; peso_tot=0.0
    if ader is not None:
        f=lin(ader,*REGUA['ader'][:2]); comp.append(('Eficiência vs meta',30,round(30*f,1),f'aderência de {ader:.0f}% ao mínimo da faixa')); tot+=30*f; peso_tot+=30
    if p_eco is not None:
        f=lin(p_eco,*REGUA['eco'][:2]); comp.append(('Condução em faixa verde',20,round(20*f,1),f'{p_eco:.0f}% do tempo de motor')); tot+=20*f; peso_tot+=20
        f2=1-lin(p_ml,*REGUA['ml'][:2]); comp.append(('Controle de marcha lenta',5,round(5*f2,1),f'{p_ml:.0f}% do tempo parado com motor ligado')); tot+=5*f2; peso_tot+=5
    if p_ex is not None:
        f=1-lin(p_ex,*REGUA['vel'][:2]); comp.append(('Respeito à velocidade',10,round(10*f,1),f'{p_ex:.0f}% do tempo acima do limite')); tot+=10*f; peso_tot+=10
    if ev100 is not None:
        f=1-lin(ev100,*REGUA['ev100'][:2]); comp.append(('Segurança e conduta',20,round(20*f,1),f'{ev100:.0f} pontos de evento por 100 km')); tot+=20*f; peso_tot+=20
    if cons is not None:
        f=cons/100; comp.append(('Consistência',10,round(10*f,1),f'{cons:.0f}% dos dias no piso')); tot+=10*f; peso_tot+=10
    if evol is not None:
        f=lin(evol,*REGUA['evol'][:2]); comp.append(('Evolução no período',5,round(5*f,1),f'{evol:+.0f}%')); tot+=5*f; peso_tot+=5
    cob=round(peso_tot,0)
    score=round(100*tot/peso_tot,1) if peso_tot>=REGUA['minimo'] else None
    score_bruto=round(100*tot/peso_tot,1) if peso_tot else None
    # eventos principais
    evs=sorted(o['ev'].items(),key=lambda x:-x[1]*CAT[x[0]][1])
    prin=[[e,n,CAT[e][0],CAT[e][1],CAT[e][2]] for e,n in evs[:6]]
    OUT.append(dict(m=m,teste=m in TESTE,placas=placas,modelo=modn,origem=sorted([x for x in o['orig'] if x]),
      dias=len(o['dias']),diasKm=o['diasKm'],km=round(o['km']) if o['km'] else None,L=round(o['L']) if o['L'] else None,
      kml=round(kml,3) if kml else None,meta_lo=lo,meta_hi=hi,piso=piso,origem_meta=om,ader=ader,
      difp=round(100*(kml/lo-1),1) if (kml and lo) else None,serie=serie,cons=cons,evol=evol,
      h_motor=round(base/3600,1) if base else 0,p_eco=p_eco,p_amarela=p_am,p_lenta=p_ml,
      p_excesso=p_ex,p_inercia=p_in,p_freio=p_fm,
      ev=o['ev'],evdia=[o['evdia'].get(x,0) for x in DIAS],pesoev=pesoev,ev100=ev100,
      n_seg=sum(n for e,n in o['ev'].items() if CAT[e][0]=='Segurança'),
      n_fad=sum(n for e,n in o['ev'].items() if CAT[e][0]=='Fadiga e conduta'),
      n_efi=sum(n for e,n in o['ev'].items() if CAT[e][0]=='Eficiência'),
      n_comb=sum(n for e,n in o['ev'].items() if CAT[e][0]=='Combustível'),
      principais=prin,score=score,score_bruto=score_bruto,cobertura=cob,score_comp=comp,score_parcial=(peso_tot<100),
      peso=round(o.get('peso',0),2),frete=round(o.get('frete',0),2),rom=o.get('rom',0),
      # dia a dia, na ordem de DIAS: [km, L, marcha_lenta_s, {faixa_s}, {evento:qtd}, placa]
      # E' o que o filtro de periodo do painel usa para refazer o score do recorte.
      dd=[([round(v['km'],1),round(v['L'],1),round(v['ml']),
            {k:round(x) for k,x in v['faixa'].items() if x},
            v['ev'],v['pl'],v['nv']]
           +([{pp:[round(w['km'],1),round(w['L'],1),round(w['ml']),
                   {k:round(x) for k,x in w['faixa'].items() if x},w['ev'],w['nv']]
               for pp,w in v['det'].items()}] if len(v['pl'])>1 else [])
           if v else 0)
          for v in (o['dd'].get(x) for x in DIAS)]))
OUT.sort(key=lambda x:-(x['score'] or -1))
# atribuicao dia a dia com o MESMO nome canonico usado em OUT — sem isso o
# filtro de motorista do painel nao encontra ninguem (causa raiz corrigida em 09/09)
ATTRC={}; ORIGC={}
for (p,dia),m in A.items():
    ATTRC.setdefault(p,{})[dia]=m
    ORIGC.setdefault(p,{})[dia]=O.get((p,dia))
# carreta associada por viagem (contexto, nunca vinculo fixo do cavalo — a
# carreta pode mudar de viagem para viagem). So' preenche quando uma unica
# carreta cobre aquele placa-dia no CRG LOG; ambiguidade fica sem informacao,
# preservando a apresentacao atual (decisao do William, 29/09/2026).
CARRETAC={}
if os.path.exists('crglog.pkl'):
    try:
        _ccp=pd.read_pickle('crglog.pkl').get('pordia',{})
        _pn3=lambda x: re.sub(r'[^A-Z0-9]','',str(x).upper())
        for (p,dia) in A.keys():
            entradas=_ccp.get((_pn3(p),dia))
            if not entradas: continue
            cars={str(e.get('carreta','')).strip() for e in entradas if str(e.get('carreta','')).strip()}
            if len(cars)==1:
                CARRETAC.setdefault(p,{})[dia]=list(cars)[0]
    except Exception:
        CARRETAC={}
# resumo da atribuicao para o painel: numero conferivel, nao texto solto
_lj=json.load(open('lacunas.json')) if os.path.exists('lacunas.json') else {}
ATRIBR={'confirmado':sum(1 for k,v in STATUS.items() if v=='CONFIRMADO' and O.get(k) not in ('crg log','romaneio')),
        'crglog':sum(1 for k,v in STATUS.items() if v=='CONFIRMADO' and O.get(k)=='crg log'),
        'romaneio':sum(1 for k,v in STATUS.items() if v=='CONFIRMADO' and O.get(k)=='romaneio'),
        'manual':sum(1 for v in STATUS.values() if v=='CORRIGIDO_MANUALMENTE'),
        'lacunas':_lj.get('na_planilha',0),'km_lacuna':_lj.get('km_sem_dono',0),
        'cobertura':_lj.get('cobertura_km',0),'motivos':_lj.get('motivos',{}),
        'reconciliacao':_lj.get('reconciliacao',[])}
QUAL_OK=sum(1 for q in QUAL.values() if q in ('Alta','Media'))
BASEF={'tipos_evento':len(set(dd['Evento_Nome'].dropna())) if 'Evento_Nome' in dd.columns else None,
       'placas_com_contador':QUAL_OK,'placas_total':len(QUAL),'dias':len(DIAS)}
json.dump({'mot':OUT,'conf':CONF,'basef':BASEF,'cat':{k:[v[0],v[1],v[2]] for k,v in CAT.items()},
           'attr':ATTRC,'attrOrig':ORIGC,'carreta':CARRETAC,'atrib':ATRIBR,'regua':REGUA,
           'oficina':OFICINA,'patio':PATIO,'deslocamento':DESLOCAMENTO},
          open('mot.json','w'),ensure_ascii=False)
r=pd.DataFrame(OUT); pd.set_option('display.width',250);pd.set_option('display.max_rows',60)
print(r[['m','placas','score','cobertura','kml','ader','p_eco','p_lenta','p_excesso','p_inercia','ev100','cons','evol','km','h_motor','origem']].to_string(index=False))
print('\ncom score ranqueavel:',r['score'].notna().sum(),'de',len(r))
print('\nconflitos cadastro fixo da Ravex x Apisul (so auditoria):',len(CONF))
