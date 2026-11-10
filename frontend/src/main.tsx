import { createContext, StrictMode, useContext, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router';
import { eventoSessaoExpirada, formatarMoeda, useConsulta } from './api';
import { CampoData, dataLocalISO } from './calendario';
import { LogoAkrk, TelaAcesso, TelaCategorias, TelaTransacoes } from './telas';
import './estilos.css';

type Resumo = {
  balanceCents: number; incomeCents: number; expenseCents: number;
  topExpenseCategories: { categoryId: string; name: string; amountCents: number }[];
};
const chaveSessao = 'akrk:token';
const ContextoSessao = createContext({ token: null as string | null, definir: (_token: string | null) => {} });
const icones = {
  visao: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  transacoes: 'M5 8h14m-4-4 4 4-4 4M19 16H5m4-4-4 4 4 4',
  categorias: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  sair: 'M10 17l5-5-5-5m5 5H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7',
  saldo: 'M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7l14-3v3m4 5h-5v4h5',
  entrada: 'M6 18 18 6m-9 0h9v9',
  saida: 'M6 6l12 12m-9 0h9V9',
  grafico: 'M3 3v18h18M8 16v-5m5 5V7m5 9V4',
};
const estrelas = [[5, 12, 1], [12, 6, 3], [17, 16, 2], [25, 5, 4], [34, 8, 1], [43, 4, 3],
  [51, 12, 2], [61, 6, 5], [69, 10, 1], [78, 4, 3], [91, 9, 4], [96, 21, 2], [4, 29, 3], [95, 38, 1]];

function Cenario({ completo }: { completo: boolean }) {
  return <div className={completo ? 'ceu' : 'ceu ceu-acesso'} aria-hidden="true">
    <div className="nuvens" />
    {completo && <div className="astros">
      <div className="lua" />
      {estrelas.map(([x, y, atraso]) => <i key={x} className="estrela" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `-${atraso}s` }} />)}
      <i className="cadente" />
      <svg className="foguete" viewBox="0 0 40 54">
          <path className="chama" d="M15 38q-2 7 5 15 7-8 5-15" fill="#f0a45f" />
          <path d="M13 28 7 39l8-2m12-9 6 11-8-2" fill="#b37e8e" />
          <path d="M20 3c-8 7-10 18-7 32l3 4h8l3-4c3-14 1-25-7-32Z" fill="#e0ddd9" />
          <circle cx="20" cy="20" r="4.5" fill="#537d8d" stroke="#b9e3e5" strokeWidth="1.4" />
      </svg>
    </div>}
  </div>;
}

function Icone({ tipo }: { tipo: keyof typeof icones }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icones[tipo]} /></svg>;
}

function Menu() {
  const { definir } = useContext(ContextoSessao);
  return <aside className="menu">
    <div className="marca"><LogoAkrk /><span>Controle Financeiro</span></div>
    <nav aria-label="Menu principal">
      <NavLink to="/" end><Icone tipo="visao" />Visão geral</NavLink>
      <NavLink to="/transacoes"><Icone tipo="transacoes" />Transações</NavLink>
      <NavLink to="/categorias"><Icone tipo="categorias" />Categorias</NavLink>
    </nav>
    <button className="sair" type="button" onClick={() => definir(null)}><Icone tipo="sair" />Sair</button>
  </aside>;
}

function Cartao({ rotulo, valor, tipo, nota }: {
  rotulo: string; valor: number | undefined; tipo: 'saldo' | 'entrada' | 'saida'; nota: string;
}) {
  return <article className={`indicador indicador-${tipo}`}>
    <span className="indicador-icone"><Icone tipo={tipo} /></span>
    <h2>{rotulo}</h2>
    <strong>{valor === undefined ? '—' : formatarMoeda(valor)}</strong>
    <span className="indicador-nota">{nota}</span>
  </article>;
}

function VisaoGeral({ token }: { token: string }) {
  const [datasIniciais] = useState(() => {
    const hoje = dataLocalISO();
    return { startDate: `${hoje.slice(0, 7)}-01`, endDate: hoje };
  });
  const [periodo, definirPeriodo] = useState(() => new URLSearchParams(datasIniciais).toString());
  const resumo = useConsulta<{ data: Resumo }>(periodo ? `/transactions/summary?${periodo}` : '/transactions/summary', token);
  const dados = resumo.dados?.data;
  const valores = [{ rotulo: 'Entradas', valor: dados?.incomeCents ?? 0, tipo: 'entrada' },
    { rotulo: 'Saídas', valor: dados?.expenseCents ?? 0, tipo: 'saida' }];
  const maximo = Math.max(1, ...valores.map(({ valor }) => valor));
  const maiorSaida = dados?.topExpenseCategories[0]?.amountCents || 1;

  function consultar(consulta: string) {
    if (consulta === periodo) resumo.atualizar();
    else definirPeriodo(consulta);
  }

  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const filtros = new URLSearchParams();
    for (const [campo, valor] of new FormData(evento.currentTarget)) {
      if (typeof valor === 'string' && valor) filtros.set(campo, valor);
    }
    consultar(filtros.toString());
  }

  return <section className="tela" aria-busy={resumo.carregando}>
    <header className="cabecalho-tela">
      <div><p className="sobretitulo">GRUPO AKRK</p><h1>Visão geral</h1><p>Acompanhe suas entradas e saídas.</p></div>
      <form className="periodo faixa-filtros" aria-label="Período do resumo" onSubmit={aplicar} onReset={(evento) => {
        evento.preventDefault();
        for (const campo of evento.currentTarget.querySelectorAll<HTMLInputElement>('input[type=date]')) campo.value = '';
        consultar('');
      }}>
        <CampoData rotulo="Data inicial" name="startDate" defaultValue={datasIniciais.startDate} />
        <CampoData rotulo="Data final" name="endDate" defaultValue={datasIniciais.endDate} />
        <div className="acoes">
          <button className="botao" type="submit">Aplicar</button>
          <button className="botao-secundario" type="reset">Todo o período</button>
        </div>
      </form>
    </header>
    {resumo.erro && <p className="aviso erro" role="alert">{resumo.erro}</p>}
    {resumo.carregando && !dados && <p className="texto-suave" role="status">Carregando resumo…</p>}
    <div className="indicadores">
      <Cartao tipo="saldo" rotulo="Saldo atual" valor={dados?.balanceCents} nota="Todos os lançamentos" />
      <Cartao tipo="entrada" rotulo="Entradas no período" valor={dados?.incomeCents} nota="Recebimentos" />
      <Cartao tipo="saida" rotulo="Saídas no período" valor={dados?.expenseCents} nota="Despesas" />
    </div>
    <div className="dashboard-paineis">
      <article className="painel painel-dashboard">
        <h2><Icone tipo="grafico" />Resumo do período</h2>
        <div className="grafico">
          {valores.map(({ rotulo, valor, tipo }) => <div className="grafico-coluna" key={tipo}>
            <strong>{dados ? formatarMoeda(valor) : '—'}</strong>
            <div className="grafico-trilho" aria-hidden="true"><div className={`grafico-barra barra-${tipo}`} style={{ height: `${valor / maximo * 100}%` }} /></div>
            <span>{rotulo}</span>
          </div>)}
        </div>
      </article>
      <article className="painel painel-dashboard">
        <h2><Icone tipo="categorias" />Maiores saídas por categoria</h2>
        {dados?.topExpenseCategories.length ? <ol className="ranking">
          {dados.topExpenseCategories.map(({ categoryId, name, amountCents }) => <li key={categoryId}>
            <div><span>{name}</span><strong>{formatarMoeda(amountCents)}</strong></div>
            <div className="ranking-trilho" aria-hidden="true"><span style={{ width: `${amountCents / maiorSaida * 100}%` }} /></div>
          </li>)}
        </ol> : dados && <p className="lista-vazia">
          {dados.incomeCents === 0 && dados.expenseCents === 0
            ? <>Nenhuma movimentação neste período. Ajuste as datas ou <Link to="/transacoes">registre uma transação</Link>.</>
            : 'Nenhuma saída para mostrar.'}
        </p>}
      </article>
    </div>
  </section>;
}

function Janela() {
  const { token, definir } = useContext(ContextoSessao);
  return <div className={token ? 'palco' : 'palco palco-acesso'}>
    <Cenario completo={!!token} />
    <div className={`janela${token ? '' : ' janela-acesso'}`}>
      {token ? <>
        <div className="barra-janela" aria-hidden="true"><i /><i /><i /></div>
        <div className="corpo-janela">
          <Menu />
          <main className="conteudo">
            <Routes>
              <Route path="/" element={<VisaoGeral token={token} />} />
              <Route path="/transacoes" element={<TelaTransacoes token={token} />} />
              <Route path="/categorias" element={<TelaCategorias token={token} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </> : <main><TelaAcesso aoEntrar={definir} /></main>}
    </div>
  </div>;
}

function Aplicacao() {
  const [token, definirToken] = useState(() => {
    try { return sessionStorage.getItem(chaveSessao); } catch { return null; }
  });
  function definir(novo: string | null) {
    try {
      if (novo) sessionStorage.setItem(chaveSessao, novo);
      else sessionStorage.removeItem(chaveSessao);
    } catch {}
    definirToken(novo);
  }
  useEffect(() => {
    const expirar = (evento: Event) => {
      if ((evento as CustomEvent<string>).detail === token) definir(null);
    };
    window.addEventListener(eventoSessaoExpirada, expirar);
    return () => window.removeEventListener(eventoSessaoExpirada, expirar);
  }, [token]);
  return <ContextoSessao.Provider value={{ token, definir }}><BrowserRouter><Janela /></BrowserRouter></ContextoSessao.Provider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Aplicacao /></StrictMode>);
