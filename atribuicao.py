# -*- coding: utf-8 -*-
"""QUEM DIRIGIU — regra unica de atribuicao de motorista.

   Definida pelo William em 17/09/2026, revisada em 21/09/2026 e
   REVISADA NOVAMENTE em 29/09/2026 — valida para todo o projeto:

     A RAVEX diz o que aconteceu com o veiculo.
     A PLACA identifica o veiculo.
     A DATA/HORA determina quando aconteceu.
     O CRG LOG diz quem REALIZOU A VIAGEM — hoje considerada pelo William a
     fonte mais confiavel para a operacao, por isso e' consultado primeiro.
     A APISUL (RelatorioAnaliticoSMP) diz QUEM era o motorista, quando o
     CRG LOG nao cobre o dia — continua confiavel, so' deixou de ser a
     primeira camada (decisao do William, 29/09/2026).
     O SSW diz quem ASSINOU O ROMANEIO daquele dia — terceira e ultima camada,
     usada so' onde as duas anteriores nao cobrem (decisao do William, 21/09/2026).
     O CADASTRO CPF nao prova quem dirigiu: so' diz qual e' o nome oficial da
     pessoa encontrada. Normalizar identidade nao e' descobrir identidade.
     Se nenhuma das tres permitir identificar sem duvida, NAO INVENTE: lacuna.

   Ordem ATE 28/09/2026: manual > Apisul > CRG LOG > SSW > lacuna.
   Ordem A PARTIR DE 29/09/2026: manual > CRG LOG > Apisul > SSW > lacuna.

   Viagem do CRG LOG "em andamento" (sem Fim Viagem): a janela de cobertura
   pode se estender por ate 7 dias corridos a partir do inicio, sem passar de
   hoje nem invadir o inicio da proxima viagem conhecida da mesma placa —
   nunca vira um vinculo indefinido (decisao do William, 29/09/2026; a
   extensao em si e' feita em crglog.py/por_placa_dia).

   O romaneio do SSW vale SOMENTE para o dia da emissao. A versao antiga do
   projeto estendia o motorista do romaneio ate o romaneio seguinte — isso era
   inferencia e fica proibido.

   Classificacao automatica por raio geografico (decisao do William, 29/09/2026,
   ver etapas/raio.py): um placa-dia cuja telemetria mostra o veiculo dentro de
   1 km da CRG ou da RMMG o dia inteiro nao e' uma viagem — e' manobra interna
   (patio) ou deslocamento para a RMMG. Nesses casos nao se procura motorista
   nas fontes documentais: vira classificacao OPERACIONAL, igual a OFICINA,
   mas so' depois de checar o livro-razao (a decisao humana sempre vence).
   A placa SJB5D52 e' usada exclusivamente para manobra/RMMG; um dia dela que
   nao se enquadre em nenhum dos dois raios vai direto para lacuna, marcado
   para investigacao — nao segue para CRG LOG/Apisul/SSW.

   ROTA CONHECIDA (William, 30/09/2026): mas se o trajeto do dia bate com
   lugares que a mesma SJB5D52 ja' visitou em outro dia do periodo (ver
   etapas/raio.py), e' rotina recorrente, nao pendencia — vira classificacao
   OPERACIONAL igual PATIO/RMMG (tambem nao segue para CRG LOG/Apisul/SSW).
   So' um trajeto genuinamente novo continua indo para lacuna/investigacao.

   O que esta PROIBIDO aqui, por decisao expressa:
     - usar o nome de motorista que vem na propria telemetria da Ravex;
     - usar o motorista do romaneio do SSW, nem como desempate, nem como reserva;
     - inferir pelo dia anterior ou seguinte, por frequencia, por cadastro fixo
       do veiculo, por semelhanca de nome ou por qualquer regra probabilistica.

   Este arquivo e' o UNICO lugar onde a atribuicao e' decidida. motor.py e
   build2.py consomem o resultado; nenhum dos dois reimplementa a regra.
"""
import pandas as pd, os, re, importlib.util

MOTIVOS = ['SEM_APISUL','SEM_CRG_LOG','SEM_ROMANEIO','MULTIPLOS_MOTORISTAS','SOBREPOSICAO',
           'NOME_SEM_CADASTRO','PLACA_INVALIDA','DATA_INVALIDA','HORARIO_INSUFICIENTE',
           'DIVERGENCIA_DE_DADOS','TROCA_DE_MOTORISTA','OUTRO']

def placa_norm(x):
    """Placa comparavel: sem espaco, sem hifen, sem caractere invisivel, maiuscula.
       Nunca troca letra por numero nem 'corrige' suposto erro de digitacao."""
    return re.sub(r'[^A-Z0-9]','',str(x).upper())

def dia_valido(d):
    return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(d).strip()))

def _colab():
    if not os.path.exists('colab.pkl'): return None,None,None
    c=pd.read_pickle('colab.pkl')
    sp=importlib.util.spec_from_file_location('col',os.path.join(os.path.dirname(os.path.abspath(__file__)),'colaboradores.py'))
    M=importlib.util.module_from_spec(sp); sp.loader.exec_module(M)
    return c['porNome'],c['porCpf'],M

def le_livro(arq):
    """Livro-razao de decisoes humanas. O nome ja veio resolvido pelo livro.py.

       Coluna CLASSIFICACAO (opcional): quando preenchida (ex.: OFICINA), o texto
       em MOTORISTA e' uma classificacao OPERACIONAL do veiculo naquele dia — nao
       o nome de uma pessoa. Nesse caso NAO passa pela normalizacao de identidade
       (nao faz sentido procurar "MOTORISTA OFICINA" no cadastro) e o chamador
       (resolver) precisa saber disso para nunca deixar esse texto virar um
       "motorista" ranqueado. Devolve {(placa,dia): (nome_ou_texto, classificacao)}.
    """
    m={}
    if not os.path.exists(arq): return m
    porNome,porCpf,M=_colab()
    t=pd.read_csv(arq,sep=';',dtype=str,encoding='utf-8-sig').fillna('')
    for _,r in t.iterrows():
        nome=str(r.get('MOTORISTA','')).strip()
        if not nome: continue
        cls=str(r.get('CLASSIFICACAO','')).strip().upper()
        if cls:
            m[(placa_norm(r['PLACA']),str(r['DIA']).strip())]=(nome,cls)
            continue
        if str(r.get('ORIGEM','')).strip().lower()!='fora do quadro' and porNome:
            cpf=str(r.get('CPF','')).strip() or None
            nome=M.oficial(nome,porNome,cpf,porCpf)
        m[(placa_norm(r['PLACA']),str(r['DIA']).strip())]=(nome,'')
    return m

def resolver(pares, atividade=None, livro='atribuicao_manual.csv'):
    """pares: iteravel de (placa, dia) que precisam de motorista.
       atividade: {(placa,dia): (primeiro_ts, ultimo_ts)} da telemetria daquele dia.
                  So e' usada para desempatar por horario — nunca para inferir nome.
       Devolve (ATTR, ORIG, STATUS, LACUNAS).
    """
    APIS={}
    if os.path.exists('smp.pkl'):
        APIS=pd.read_pickle('smp.pkl').get('attr',{})
    APIS={(placa_norm(p),d):l for (p,d),l in APIS.items()}
    MAN=le_livro(livro)
    atividade=atividade or {}

    # Classificacao automatica de patio/manobra e deslocamento RMMG por raio
    # geografico (decisao do William, 29/09/2026 — ver etapas/raio.py).
    RAIO={}; SJB_INVEST=set()
    if os.path.exists('raio.pkl'):
        _r=pd.read_pickle('raio.pkl')
        RAIO={(placa_norm(p),d):v for (p,d),v in _r.get('classif',{}).items()}
        SJB_INVEST={(placa_norm(p),d) for (p,d) in _r.get('sjb_investigar',[])}

    # CRG LOG: primeira camada documental a partir de 29/09/2026 (decisao do William)
    LOG={}; CAD=None; EQV={}; CL=None
    _aqui=os.path.dirname(os.path.abspath(__file__))
    if os.path.exists('crglog.pkl') or os.path.exists('colab.pkl'):
        sp=importlib.util.spec_from_file_location('crglog',os.path.join(_aqui,'crglog.py'))
        CL=importlib.util.module_from_spec(sp); sp.loader.exec_module(CL)
    if os.path.exists('crglog.pkl'):
        _c=pd.read_pickle('crglog.pkl')
        LOG=_c['pordia']; CAD=_c['cadastro']; EQV=_c.get('equiv',{})
    elif os.path.exists('colab.pkl'):
        # sem CRG LOG no ciclo, o cadastro ainda e' necessario para normalizar o
        # nome que vem do romaneio do SSW (truncado em 30 caracteres)
        _k=pd.read_pickle('colab.pkl')
        CAD=pd.DataFrame([{'nome':n,'cpf':c,'desligado':False} for c,n in _k['porCpf'].items()])
        EQV=CL.ler_equivalencias() if CL else {}

    # SSW: romaneio por placa + dia de emissao. So' o dia da emissao, sem estender.
    SSW={}
    if os.path.exists('ssw.pkl'):
        _w=pd.read_pickle('ssw.pkl')
        _w=_w[_w['SITUACAO']!='CANCELADO']
        for _,r in _w.dropna(subset=['dt_emissao']).iterrows():
            nome=str(r.get('MOTORISTA','')).strip()
            if not nome: continue
            SSW.setdefault((placa_norm(r['PLACA']),r['dt_emissao'].strftime('%Y-%m-%d')),set()).add(nome)

    def do_ssw(pn,dia):
        """Terceira camada. Devolve (nome_oficial, motivo_se_falhou, detalhe)."""
        nomes=sorted(SSW.get((pn,dia),[]))
        if not nomes: return None,'SEM_ROMANEIO','placa+data sem romaneio no SSW'
        if len(nomes)>1: return None,'MULTIPLOS_MOTORISTAS','SSW: '+' | '.join(nomes)
        if CL is None: return None,'NOME_SEM_CADASTRO','SSW "%s": sem cadastro para normalizar'%nomes[0]
        nome,cpf,nivel,metodo,cands=CL.identidade(nomes[0],CAD,EQV)
        if nome and nivel in ('A','B','C'):
            return nome,None,'SSW "%s" -> %s (nivel %s)'%(nomes[0],nome,nivel)
        return None,'NOME_SEM_CADASTRO','SSW "%s": %s%s'%(nomes[0],metodo,
               ' | candidatos: '+', '.join(cands) if cands else '')

    def do_log(pn,dia,a):
        """Devolve (nome_oficial, motivo_se_falhou, detalhe)."""
        if CL is None: return None,'SEM_CRG_LOG','ciclo sem arquivo CRG LOG'
        l=LOG.get((pn,dia),[])
        if not l: return None,'SEM_CRG_LOG','placa+data sem viagem no CRG LOG'
        nomes=sorted({x['mot'] for x in l if str(x['mot']).strip()})
        if not nomes: return None,'SEM_CRG_LOG','viagem no CRG LOG sem motorista'
        if len(nomes)>1:
            cobre={x['mot'] for x in l if a and a[0] and a[1] and x['ini']<=a[0] and x['fim']>=a[1]}
            if len(cobre)!=1:
                return None,'MULTIPLOS_MOTORISTAS','CRG LOG: '+' | '.join(nomes)
            nomes=[list(cobre)[0]]
        nome,cpf,nivel,metodo,cands=CL.identidade(nomes[0],CAD,EQV)
        marca=' [via janela de viagem em andamento, ate 7 dias]' if any(x.get('janela_aberta') for x in l) else ''
        if nome and nivel in ('A','B','C'): return nome,None,'CRG LOG "%s" -> %s (nivel %s)%s'%(nomes[0],nome,nivel,marca)
        return None,'NOME_SEM_CADASTRO','CRG LOG "%s": %s%s'%(nomes[0],metodo,
               ' | candidatos: '+', '.join(cands) if cands else '')

    ATTR={}; ORIG={}; STATUS={}; LAC=[]
    def lacuna(p,dia,motivo,nomes=(),obs=''):
        a=atividade.get((p,dia)) or atividade.get((placa_norm(p),dia)) or (None,None)
        LAC.append(dict(PLACA=p, DIA=dia,
                        TELEMETRIA_INICIO=str(a[0] or ''), TELEMETRIA_FIM=str(a[1] or ''),
                        MOTORISTAS_APISUL=' | '.join(sorted(set(nomes))),
                        REGISTROS_APISUL=len(nomes), MOTIVO_LACUNA=motivo,
                        FONTE_CONFLITO='Apisul' if nomes else '—',
                        OBSERVACAO=obs, STATUS='PENDENTE',
                        MOTORISTA='', QUEM_PREENCHEU='', DATA_PREENCHIMENTO=''))

    for p,dia in pares:
        pn=placa_norm(p)
        if not pn or len(pn)<7:
            lacuna(p,dia,'PLACA_INVALIDA',obs='placa fora do padrao de 7 caracteres'); continue
        if not dia_valido(dia):
            lacuna(p,dia,'DATA_INVALIDA',obs='data nao reconhecida'); continue

        # 1. decisao humana registrada no livro-razao — a unica que vence a Apisul
        if (pn,dia) in MAN:
            nome,cls=MAN[(pn,dia)]
            ATTR[(p,dia)]=nome
            if cls:
                # classificacao operacional (ex.: OFICINA): texto descritivo do
                # que aconteceu com o veiculo, nunca uma pessoa. build2.py usa
                # ORIG=='operacional' para tirar isso do ranking de motoristas.
                ORIG[(p,dia)]='operacional'; STATUS[(p,dia)]='CLASSIFICADO_OPERACIONAL'
            else:
                ORIG[(p,dia)]='manual'; STATUS[(p,dia)]='CORRIGIDO_MANUALMENTE'
            continue

        # 1.5 classificacao automatica por raio geografico (patio/RMMG) —
        # decisao do William, 29/09/2026. So' entra se o livro-razao nao ja'
        # decidiu (regra 1 acima sempre vence). Mesmo mecanismo do OFICINA:
        # ORIG='operacional' tira do ranking, mas mantem km/L nos totais.
        cls_raio=RAIO.get((pn,dia))
        if cls_raio:
            rotulo={'PATIO':'PATIO (manobra interna, raio de 1 km da CRG)',
                    'RMMG':'DESLOCAMENTO RMMG (raio de 1 km da RMMG)',
                    'ROTA_CONHECIDA':'SJB5D52 — ROTA RECORRENTE (mesmo trajeto ja observado em outro dia)'}
            ATTR[(p,dia)]=rotulo[cls_raio]
            ORIG[(p,dia)]='operacional'; STATUS[(p,dia)]='CLASSIFICADO_OPERACIONAL'
            continue
        if (pn,dia) in SJB_INVEST:
            # SJB5D52 e' de uso exclusivo para manobra/RMMG (decisao do William).
            # Nao se enquadrando em nenhum dos dois raios, nao faz sentido
            # procurar motorista no CRG LOG/Apisul/SSW: vai direto para lacuna,
            # marcada para investigacao humana.
            lacuna(p,dia,'OUTRO',
                   obs='SJB5D52 (uso exclusivo para manobra/deslocamento RMMG): a telemetria do dia nao se enquadra em nenhum dos dois raios (1 km da CRG ou da RMMG) — requer investigacao humana, nao segue para CRG LOG/Apisul/SSW.')
            continue

        a=atividade.get((p,dia)) or atividade.get((pn,dia))

        # 2. CRG LOG — primeira camada a partir de 29/09/2026
        nome,motivo,det=do_log(pn,dia,a)
        if nome:
            ATTR[(p,dia)]=nome; ORIG[(p,dia)]='crg log'
            STATUS[(p,dia)]='CONFIRMADO'; continue

        # 3. CRG LOG nao resolveu: tenta a Apisul
        l=APIS.get((pn,dia),[])
        nomes=sorted({x[0] for x in l})
        if len(nomes)==1:
            ATTR[(p,dia)]=nomes[0]; ORIG[(p,dia)]='apisul'
            STATUS[(p,dia)]='CONFIRMADO'; continue
        if len(nomes)>1:
            # mais de um motorista no mesmo dia: so resolve se o horario provar
            cobre={x[0] for x in l if x[2] is not None and x[3] is not None
                   and a and a[0] and a[1] and x[2]<=a[0] and x[3]>=a[1]}
            if len(cobre)==1:
                ATTR[(p,dia)]=list(cobre)[0]; ORIG[(p,dia)]='apisul'
                STATUS[(p,dia)]='CONFIRMADO'; continue

        # 4. ultima camada: romaneio do SSW, so' no dia da emissao
        nome2,motivo2,det2=do_ssw(pn,dia)
        if nome2:
            ATTR[(p,dia)]=nome2; ORIG[(p,dia)]='romaneio'
            STATUS[(p,dia)]='CONFIRMADO'; continue
        det=(det+' | '+det2) if det2 else det
        if motivo=='SEM_CRG_LOG' and motivo2 not in (None,'SEM_ROMANEIO'): motivo=motivo2
        if nomes:
            lacuna(p,dia,motivo if motivo in ('MULTIPLOS_MOTORISTAS','NOME_SEM_CADASTRO') else 'MULTIPLOS_MOTORISTAS',
                   nomes,'CRG LOG nao resolveu e a Apisul tem %d motoristas no dia sem desempate. %s'%(len(nomes),det))
        else:
            lacuna(p,dia,motivo or 'SEM_APISUL',
                   obs='sem viagem no CRG LOG nem na Apisul. '+det)
    return ATTR,ORIG,STATUS,LAC

def reconciliacao(ATTR,STATUS,LAC,PD=None,ORIG=None):
    """Tabela de reconciliacao com contagem e km, para auditoria.

       So conta o universo que move indicador: placa-dia com km E litros medidos.
       Carreta e dia parado ficam de fora — se entrassem, a tabela mostraria
       centenas de 'sem Apisul' que nunca afetariam numero nenhum."""
    PD=PD or {}
    UNI={k for k,v in PD.items() if v.get('km') and v.get('L')}
    km=lambda k:PD.get(k,{}).get('km') or 0.0
    linhas=[]
    ORIG=ORIG or {}
    conf=[k for k,v in STATUS.items() if v=='CONFIRMADO' and k in UNI]
    manu=[k for k,v in STATUS.items() if v=='CORRIGIDO_MANUALMENTE' and k in UNI]
    oper=[k for k,v in STATUS.items() if v=='CLASSIFICADO_OPERACIONAL' and k in UNI]
    api=[k for k in conf if ORIG.get(k) not in ('crg log','romaneio')]
    log=[k for k in conf if ORIG.get(k)=='crg log']
    rom=[k for k in conf if ORIG.get(k)=='romaneio']
    linhas.append(('Placa+Data com motorista Apisul confirmado',len(api),sum(km(k) for k in api)))
    if log: linhas.append(('Placa+Data confirmada pelo CRG LOG',len(log),sum(km(k) for k in log)))
    if rom: linhas.append(('Placa+Data confirmada pelo romaneio do SSW',len(rom),sum(km(k) for k in rom)))
    linhas.append(('Placa+Data resolvida no livro-razao (decisao humana)',len(manu),sum(km(k) for k in manu)))
    if oper: linhas.append(('Placa+Data classificada como operacional (ex.: oficina) — nao vira motorista',len(oper),sum(km(k) for k in oper)))
    porMotivo={}
    for r in LAC:
        k=(r['PLACA'],r['DIA'])
        if k in UNI: porMotivo.setdefault(r['MOTIVO_LACUNA'],[]).append(k)
    rot={'SEM_APISUL':'Sem correspondencia na Apisul, CRG LOG ou SSW',
         'SEM_CRG_LOG':'Sem correspondencia na Apisul, CRG LOG ou SSW',
         'SEM_ROMANEIO':'Sem correspondencia na Apisul, CRG LOG ou SSW',
         'NOME_SEM_CADASTRO':'Motorista do CRG LOG sem correspondencia no cadastro',
         'MULTIPLOS_MOTORISTAS':'Multiplos motoristas no mesmo dia',
         'SOBREPOSICAO':'Sobreposicao de horarios',
         'PLACA_INVALIDA':'Problema de placa','DATA_INVALIDA':'Problema de data',
         'HORARIO_INSUFICIENTE':'Horario insuficiente para decidir',
         'DIVERGENCIA_DE_DADOS':'Divergencia de dados','TROCA_DE_MOTORISTA':'Troca de motorista',
         'OUTRO':'Outras ambiguidades'}
    for m,ks in sorted(porMotivo.items(),key=lambda x:-len(x[1])):
        linhas.append((rot.get(m,m),len(ks),sum(km(k) for k in ks)))
    tot=[k for k in ((r['PLACA'],r['DIA']) for r in LAC) if k in UNI]
    linhas.append(('TOTAL enviado para lacunas',len(tot),sum(km(k) for k in tot)))
    return linhas
