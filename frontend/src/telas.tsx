import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, formatarMoeda, mensagemErro, useConsulta } from './api';
import { CampoData } from './calendario';

type Feedback = { texto: string; tipo: 'erro' | 'sucesso' };
type Categoria = { id: string; name: string; description: string | null };
type Transacao = {
  id: string; description: string; amountCents: number;
  type: 'INCOME' | 'EXPENSE'; date: string; categoryId: string;
};
type PaginaTransacoes = {
  data: Transacao[]; meta: { total: number; totalPages: number };
};
type Resposta<T> = { data: T };
const ler = (dados: FormData, campo: string) => String(dados.get(campo) ?? '');
const dataLocal = (data: string) => data.split('-').reverse().join('/');

function Aviso({ feedback }: { feedback: Feedback | null }) {
  return feedback && <p className={`aviso ${feedback.tipo}`} role={feedback.tipo === 'erro' ? 'alert' : 'status'}>{feedback.texto}</p>;
}

function useAcao() {
  const [ocupado, definirOcupado] = useState(false);
  const [feedback, definirFeedback] = useState<Feedback | null>(null);

  async function executar(acao: () => Promise<string | void>) {
    if (ocupado) return;
    definirOcupado(true);
    definirFeedback(null);
    try {
      const texto = await acao();
      if (texto) definirFeedback({ texto, tipo: 'sucesso' });
    } catch (erro) {
      definirFeedback({ texto: mensagemErro(erro), tipo: 'erro' });
    } finally {
      definirOcupado(false);
    }
  }

  return { ocupado, feedback, definirFeedback, executar };
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="campo"><span>{rotulo}</span>{children}</label>;
}

export function LogoAkrk() {
  return <img className="logo-akrk" src="/grupo-akrk.png" alt="Grupo AKRK" width={364} height={174} />;
}

function CampoSenha({ nome, rotulo, autoComplete, descricao, invalido, children }: {
  nome: string; rotulo: string; autoComplete: string; descricao?: string; invalido?: boolean; children?: ReactNode;
}) {
  const [visivel, definirVisivel] = useState(false);
  return <div className="campo">
    <label htmlFor={nome}>{rotulo}</label>
    <div className="campo-senha">
      <input id={nome} name={nome} type={visivel ? 'text' : 'password'} required minLength={8} maxLength={128}
        autoComplete={autoComplete} aria-describedby={descricao} aria-invalid={invalido || undefined} />
      <button type="button" aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo.toLowerCase()}`}
        aria-controls={nome} onClick={() => definirVisivel(!visivel)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
          <circle cx="12" cy="12" r="2.5" />
          {visivel && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
    {children}
  </div>;
}

const rotulosForca = ['Mínimo de 8 caracteres', 'Fraca', 'Média', 'Forte'];
const chaveEmail = 'akrk:email';

function guardarEmail(email: string) {
  try {
    if (email) localStorage.setItem(chaveEmail, email);
    else localStorage.removeItem(chaveEmail);
  } catch {}
}

function medirForca(senha: string) {
  if (!senha) return 0;
  if (senha.length < 8) return 1;
  const grupos = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}\s]/u].filter((regra) => regra.test(senha)).length;
  if (senha.length >= 12 && grupos >= 3) return 3;
  return grupos >= 2 ? 2 : 1;
}

export function TelaAcesso({ aoEntrar }: { aoEntrar: (token: string) => void }) {
  const [cadastro, definirCadastro] = useState(false);
  const { ocupado, feedback, definirFeedback, executar } = useAcao();
  const [forca, definirForca] = useState(0);
  const [senhasConferem, definirSenhasConferem] = useState<boolean | null>(null);
  const [emailLembrado] = useState(() => {
    try { return localStorage.getItem(chaveEmail) ?? ''; } catch { return ''; }
  });
  const [lembrarEmail, definirLembrarEmail] = useState(!!emailLembrado);

  function acompanharSenhas(evento: FormEvent<HTMLFormElement>) {
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement) || (campo.name !== 'password' && campo.name !== 'confirmacaoSenha')) return;
    const dados = new FormData(evento.currentTarget);
    const senha = ler(dados, 'password');
    const confirmacao = ler(dados, 'confirmacaoSenha');
    definirForca(medirForca(senha));
    definirSenhasConferem(confirmacao ? senha === confirmacao : null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;
    const dados = new FormData(evento.currentTarget);
    const credenciais = { email: ler(dados, 'email'), password: ler(dados, 'password') };
    if (cadastro && credenciais.password !== ler(dados, 'confirmacaoSenha')) {
      definirSenhasConferem(false);
      return;
    }
    await executar(async () => {
      if (cadastro) {
        await api('/auth/register', { metodo: 'POST', corpo: { ...credenciais, name: ler(dados, 'name') } });
        definirCadastro(false);
        return 'Conta criada. Entre com seu e-mail e senha.';
      }
      const { data } = await api<Resposta<{ accessToken: string }>>('/auth/login', { metodo: 'POST', corpo: credenciais });
      guardarEmail(lembrarEmail ? credenciais.email.trim() : '');
      aoEntrar(data.accessToken);
    });
  }

  return <section className={cadastro ? 'acesso acesso-cadastro' : 'acesso'}>
    <div className={cadastro ? 'mascote mascote-cadastro' : 'mascote'} aria-hidden="true">
      {cadastro ? senhasConferem && <span className="mascote-check">✓</span>
        : <span className="mascote-fala">Que bom te ver!</span>}
    </div>
    <LogoAkrk />
    <h1>{cadastro ? 'Crie sua conta' : 'Controle Financeiro'}</h1>
    <Aviso feedback={feedback} />
    <form className="formulario" onSubmit={enviar} onInput={cadastro ? acompanharSenhas : undefined}>
      {cadastro && <Campo rotulo="Nome"><input name="name" required minLength={2} maxLength={100} autoComplete="name" /></Campo>}
      <Campo rotulo="E-mail"><input name="email" type="email" required defaultValue={emailLembrado} autoComplete={cadastro ? 'email' : 'username'} /></Campo>
      <CampoSenha key={cadastro ? 'nova' : 'atual'} nome="password" rotulo="Senha" autoComplete={cadastro ? 'new-password' : 'current-password'}
        descricao={cadastro ? 'forca-senha' : undefined} />
      {cadastro && <>
        <div className="forca-senha" id="forca-senha">
          <meter min={0} max={3} low={1.5} high={2.5} optimum={3} value={forca} aria-label="Força da senha" aria-valuetext={rotulosForca[forca]} />
          <span aria-live="polite">{rotulosForca[forca]}</span>
        </div>
        <CampoSenha nome="confirmacaoSenha" rotulo="Repita a senha" autoComplete="new-password"
          descricao="validacao-senha" invalido={senhasConferem === false}>
          <p id="validacao-senha" className={`validacao-senha ${senhasConferem ? 'entrada' : 'saida'}`} role="status">
            {senhasConferem === null ? '' : senhasConferem ? 'As senhas conferem.' : 'As senhas não coincidem.'}
          </p>
        </CampoSenha>
      </>}
      {!cadastro && <label className="lembrar-email">
        <input type="checkbox" checked={lembrarEmail} onChange={(evento) => {
          definirLembrarEmail(evento.currentTarget.checked);
          if (!evento.currentTarget.checked) guardarEmail('');
        }} />
        Lembrar meu e-mail
      </label>}
      <button className="botao" disabled={ocupado}>{ocupado ? 'Aguarde…' : cadastro ? 'Criar conta' : 'Entrar'}</button>
    </form>
    <button className="link-botao" type="button" disabled={ocupado} onClick={() => {
      definirCadastro(!cadastro);
      definirFeedback(null);
      definirForca(0);
      definirSenhasConferem(null);
    }}>
      {cadastro ? 'Já tenho conta' : 'Criar conta'}
    </button>
  </section>;
}

export function TelaCategorias({ token }: { token: string }) {
  const lista = useConsulta<Resposta<Categoria[]>>('/categories', token);
  const [edicao, definirEdicao] = useState<Categoria | null>(null);
  const { ocupado, feedback, definirFeedback, executar } = useAcao();

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    await executar(async () => {
      await api(edicao ? `/categories/${edicao.id}` : '/categories', {
        token, metodo: edicao ? 'PATCH' : 'POST',
        corpo: { name: ler(dados, 'name'), description: ler(dados, 'description').trim() || null },
      });
      formulario.reset();
      definirEdicao(null);
      lista.atualizar();
      return edicao ? 'Categoria atualizada.' : 'Categoria criada.';
    });
  }

  async function excluir(categoria: Categoria) {
    if (!window.confirm(`Excluir a categoria ${categoria.name}?`)) return;
    await executar(async () => {
      await api<void>(`/categories/${categoria.id}`, { token, metodo: 'DELETE' });
      if (edicao?.id === categoria.id) definirEdicao(null);
      lista.atualizar();
      return 'Categoria excluída.';
    });
  }

  return <section className="tela">
    <header className="cabecalho-tela"><div><h1>Categorias</h1><p>Organize suas entradas e saídas.</p></div></header>
    <Aviso feedback={feedback} />
    {lista.erro && <Aviso feedback={{ texto: lista.erro, tipo: 'erro' }} />}
    <form key={edicao?.id ?? 'nova'} className="painel formulario formulario-linha formulario-categoria" onSubmit={gravar}>
      <Campo rotulo="Nome"><input name="name" required maxLength={100} defaultValue={edicao?.name} /></Campo>
      <Campo rotulo="Descrição opcional"><input name="description" maxLength={255} defaultValue={edicao?.description ?? ''} /></Campo>
      <div className="acoes">
        {edicao && <button className="botao-secundario" type="button" disabled={ocupado} onClick={() => definirEdicao(null)}>Cancelar</button>}
        <button className="botao" disabled={ocupado}>{edicao ? 'Salvar' : 'Criar categoria'}</button>
      </div>
    </form>
    <div className="painel tabela-wrap">
      <table className="tabela"><thead><tr><th scope="col">Categoria</th><th scope="col">Descrição</th><th scope="col">Ações</th></tr></thead><tbody>
        {lista.dados?.data.map((categoria) => <tr key={categoria.id}>
          <td>{categoria.name}</td><td>{categoria.description || '—'}</td>
          <td><div className="acoes">
            <button type="button" className="acao-tabela" disabled={ocupado} onClick={() => { definirEdicao(categoria); definirFeedback(null); }}>Editar</button>
            <button type="button" className="acao-tabela perigo" disabled={ocupado} onClick={() => void excluir(categoria)}>Excluir</button>
          </div></td>
        </tr>)}
      </tbody></table>
      {(lista.carregando || lista.dados?.data.length === 0) && <p className="lista-vazia">{lista.carregando ? 'Carregando…' : 'Nenhuma categoria para mostrar.'}</p>}
    </div>
  </section>;
}

const filtrosIniciais = { type: '', categoryId: '', startDate: '', endDate: '', page: 1 };

function converterCentavos(valor: string) {
  const partes = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(valor.trim());
  if (!partes) return null;
  const centavos = Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'));
  return centavos > 0 && centavos <= 2_147_483_647 ? centavos : null;
}

export function TelaTransacoes({ token }: { token: string }) {
  const categorias = useConsulta<Resposta<Categoria[]>>('/categories', token);
  const [filtros, definirFiltros] = useState(filtrosIniciais);
  const [formulario, definirFormulario] = useState<Transacao | 'nova' | null>(null);
  const { ocupado, feedback, definirFeedback, executar } = useAcao();
  const consulta = new URLSearchParams({ page: String(filtros.page), limit: '8' });
  for (const campo of ['type', 'categoryId', 'startDate', 'endDate'] as const) {
    if (filtros[campo]) consulta.set(campo, filtros[campo]);
  }
  const lista = useConsulta<PaginaTransacoes>(`/transactions?${consulta}`, token);
  const edicao = formulario === 'nova' ? null : formulario;
  const itens = categorias.dados?.data ?? [];
  const nomes = new Map(itens.map(({ id, name }) => [id, name]));
  const opcoesCategorias = itens.map(({ id, name }) => <option key={id} value={id}>{name}</option>);

  function filtrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    definirFiltros({ type: ler(dados, 'type'), categoryId: ler(dados, 'categoryId'),
      startDate: ler(dados, 'startDate'), endDate: ler(dados, 'endDate'), page: 1 });
    lista.atualizar();
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const amountCents = converterCentavos(ler(dados, 'valor'));
    if (amountCents === null) { definirFeedback({ texto: 'Informe um valor válido maior que zero.', tipo: 'erro' }); return; }
    await executar(async () => {
      await api(edicao ? `/transactions/${edicao.id}` : '/transactions', {
        token, metodo: edicao ? 'PUT' : 'POST',
        corpo: { amountCents, description: ler(dados, 'description'), type: ler(dados, 'type'),
          date: ler(dados, 'date'), categoryId: ler(dados, 'categoryId') },
      });
      definirFormulario(null);
      if (filtros.page > 1) definirFiltros((atuais) => atuais === filtros ? { ...atuais, page: 1 } : atuais);
      lista.atualizar();
      return edicao ? 'Transação atualizada.' : 'Transação criada.';
    });
  }

  async function excluir(transacao: Transacao) {
    if (!window.confirm(`Excluir a transação ${transacao.description}?`)) return;
    await executar(async () => {
      await api<void>(`/transactions/${transacao.id}`, { token, metodo: 'DELETE' });
      if (edicao?.id === transacao.id) definirFormulario(null);
      if (lista.dados?.data.length === 1 && filtros.page > 1) {
        definirFiltros((atuais) => atuais === filtros ? { ...atuais, page: atuais.page - 1 } : atuais);
      }
      lista.atualizar();
      return 'Transação excluída.';
    });
  }

  return <section className="tela">
    <header className="cabecalho-tela"><div><h1>Transações</h1><p>Acompanhe suas movimentações.</p></div>
      <button className="botao" disabled={ocupado} onClick={() => { definirFormulario('nova'); definirFeedback(null); }}>Nova transação</button>
    </header>
    <Aviso feedback={feedback} />
    {(lista.erro || categorias.erro) && <Aviso feedback={{ texto: lista.erro || categorias.erro, tipo: 'erro' }} />}
    {formulario && <form key={edicao?.id ?? 'nova'} className="painel formulario formulario-transacao" onSubmit={gravar}>
      <h2>{edicao ? 'Editar transação' : 'Nova transação'}</h2>
      {categorias.dados?.data.length === 0 && <p className="texto-suave">Para registrar uma transação, <Link to="/categorias">crie uma categoria</Link>.</p>}
      <div className="campos-transacao">
        <Campo rotulo="Descrição"><input name="description" required maxLength={255} defaultValue={edicao?.description} /></Campo>
        <Campo rotulo="Valor (R$)"><input name="valor" inputMode="decimal" placeholder="0,00" required defaultValue={edicao ? (edicao.amountCents / 100).toFixed(2).replace('.', ',') : ''} /></Campo>
        <Campo rotulo="Tipo"><select name="type" defaultValue={edicao?.type ?? 'EXPENSE'}><option value="EXPENSE">Saída</option><option value="INCOME">Entrada</option></select></Campo>
        <CampoData rotulo="Data" name="date" required defaultValue={edicao?.date} />
        <Campo rotulo="Categoria"><select name="categoryId" required defaultValue={edicao?.categoryId ?? ''}><option value="">Selecione</option>{opcoesCategorias}</select></Campo>
      </div>
      <div className="acoes rodape-formulario">
        <button className="botao-secundario" type="button" disabled={ocupado} onClick={() => definirFormulario(null)}>Cancelar</button>
        <button className="botao" disabled={ocupado || itens.length === 0}>Salvar</button>
      </div>
    </form>}
    <form className="formulario-linha faixa-filtros filtros-transacoes" aria-label="Filtros de transações" onSubmit={filtrar} onReset={() => {
      definirFiltros(filtrosIniciais);
      lista.atualizar();
    }}>
      <Campo rotulo="Tipo"><select name="type"><option value="">Todos</option><option value="INCOME">Entradas</option><option value="EXPENSE">Saídas</option></select></Campo>
      <Campo rotulo="Categoria"><select name="categoryId"><option value="">Todas</option>{opcoesCategorias}</select></Campo>
      <CampoData rotulo="Data inicial" name="startDate" />
      <CampoData rotulo="Data final" name="endDate" />
      <div className="acoes"><button className="botao">Filtrar</button><button className="botao-secundario" type="reset">Limpar</button></div>
    </form>
    <div className="painel painel-tabela">
      <div className="tabela-wrap">
        <table className="tabela tabela-transacoes"><thead><tr>
          <th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col">Data</th>
          <th scope="col" className="valor-tabela">Valor</th><th scope="col">Ações</th>
        </tr></thead><tbody>
          {lista.dados?.data.map((transacao) => <tr key={transacao.id}>
            <td>{transacao.description}</td><td>{nomes.get(transacao.categoryId) ?? '—'}</td><td>{dataLocal(transacao.date)}</td>
            <td className={`valor-tabela ${transacao.type === 'INCOME' ? 'entrada' : 'saida'}`}>{transacao.type === 'INCOME' ? '+' : '−'} {formatarMoeda(transacao.amountCents)}</td>
            <td><div className="acoes">
              <button className="acao-tabela" type="button" disabled={ocupado || !categorias.dados} onClick={() => { definirFormulario(transacao); definirFeedback(null); }}>Editar</button>
              <button className="acao-tabela perigo" type="button" disabled={ocupado} onClick={() => void excluir(transacao)}>Excluir</button>
            </div></td>
          </tr>)}
        </tbody></table>
      </div>
      {(lista.carregando || lista.dados?.data.length === 0) && <p className="lista-vazia">{lista.carregando ? 'Carregando…' : 'Nenhuma transação para mostrar.'}</p>}
      {lista.dados && <div className="paginacao">
        <span>{lista.dados.meta.total} {lista.dados.meta.total === 1 ? 'transação' : 'transações'}</span>
        <button className="botao-secundario" disabled={filtros.page <= 1 || lista.carregando} onClick={() => definirFiltros({ ...filtros, page: filtros.page - 1 })}>Anterior</button>
        <span>{filtros.page} / {Math.max(1, lista.dados.meta.totalPages)}</span>
        <button className="botao-secundario" disabled={filtros.page >= lista.dados.meta.totalPages || lista.carregando} onClick={() => definirFiltros({ ...filtros, page: filtros.page + 1 })}>Próxima</button>
      </div>}
    </div>
  </section>;
}
