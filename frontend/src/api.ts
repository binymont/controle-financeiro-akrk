import { useEffect, useReducer, useState } from 'react';

const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (centavos: number) => moeda.format(centavos / 100);
export const eventoSessaoExpirada = 'akrk:sessao-expirada';

class ErroApi extends Error {}

export async function api<T>(rota: string, opcoes: {
  token?: string; metodo?: string; corpo?: unknown; signal?: AbortSignal;
} = {}): Promise<T> {
  const { token, metodo = 'GET', corpo, signal } = opcoes;
  const rotaLog = rota.split('?', 1)[0].replace(/\/[0-9a-f-]{36}$/i, '/:id');
  const inicio = performance.now();
  const resposta = await fetch(`${base}${rota}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal,
  }).catch((erro: unknown) => {
    if (!signal?.aborted) console.warn('[AKRK API]', metodo, rotaLog, 'sem resposta');
    throw erro;
  });
  console.info('[AKRK API]', metodo, rotaLog, resposta.status, `${Math.round(performance.now() - inicio)} ms`);
  if (resposta.status === 204) return undefined as T;
  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (token && resposta.status === 401) {
      window.dispatchEvent(new CustomEvent(eventoSessaoExpirada, { detail: token }));
    }
    const mensagem = dados && typeof dados === 'object' && 'message' in dados ? dados.message : null;
    throw new ErroApi(typeof mensagem === 'string' ? mensagem :
      Array.isArray(mensagem) ? mensagem.filter((item) => typeof item === 'string').join(' ') :
        'Não foi possível concluir a solicitação.');
  }
  if (dados === null) throw new ErroApi('A API retornou uma resposta inválida.');
  return dados as T;
}

export const mensagemErro = (erro: unknown) => erro instanceof ErroApi
  ? erro.message : 'Não foi possível conectar à API. Tente novamente.';

export function useConsulta<T>(rota: string, token: string) {
  const [versao, atualizar] = useReducer((numero: number) => numero + 1, 0);
  const [resultado, definir] = useState<{ rota: string; token: string; versao: number; dados: T | null; erro: string }>();

  useEffect(() => {
    const controle = new AbortController();
    function concluir(dados: T | null, erro = '') {
      if (!controle.signal.aborted) definir({ rota, token, versao, dados, erro });
    }
    api<T>(rota, { token, signal: controle.signal }).then(
      (dados) => concluir(dados),
      (erro: unknown) => concluir(null, mensagemErro(erro)),
    );
    return () => controle.abort();
  }, [rota, token, versao]);

  const atual = resultado?.rota === rota && resultado.token === token ? resultado : undefined;
  const carregando = atual?.versao !== versao;
  return { dados: atual?.dados ?? null, erro: carregando ? '' : atual?.erro ?? '', carregando, atualizar };
}
