import 'reflect-metadata';
import {
  Catch, Global, HttpException, Logger, Module, ValidationPipe,
  type ArgumentsHost, type ExceptionFilter,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { ModuloAutenticacao } from './autenticacao';
import { ServicoPrisma } from './banco';
import { ModuloCategorias } from './categorias';
import { ModuloTransacoes } from './transacoes';

@Catch()
class FiltroDeErros implements ExceptionFilter {
  private readonly logger = new Logger(FiltroDeErros.name);

  catch(erro: unknown, contexto: ArgumentsHost): void {
    const resposta = contexto.switchToHttp().getResponse<Response>();
    if (erro instanceof HttpException) {
      const statusCode = erro.getStatus();
      const corpo = erro.getResponse();
      const message = typeof corpo === 'string' ? corpo : ('message' in corpo ? corpo.message : erro.message);
      resposta.status(statusCode).json({ statusCode, message });
      return;
    }
    const statusExterno = erro instanceof Error && 'statusCode' in erro ? erro.statusCode : undefined;
    if (typeof statusExterno === 'number' && Number.isInteger(statusExterno) && statusExterno >= 400 && statusExterno < 500) {
      resposta.status(statusExterno).json({ statusCode: statusExterno, message: 'Solicitação inválida.' });
      return;
    }
    this.logger.error(`Erro inesperado na API (${erro instanceof Error ? erro.name : 'desconhecido'}).`);
    resposta.status(500).json({ statusCode: 500, message: 'Erro interno do servidor.' });
  }
}

function validarAmbiente(
  ambiente: Record<string, unknown>,
): Record<string, unknown> {
  const urlBanco = ambiente.DATABASE_URL;
  if (typeof urlBanco !== 'string' || !/^postgres(ql)?:\/\//.test(urlBanco) || !URL.canParse(urlBanco)) {
    throw new Error('Configure DATABASE_URL com uma conexao PostgreSQL no .env.');
  }

  const porta = Number(ambiente.PORT ?? 3000);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error('PORT deve ser um numero inteiro entre 1 e 65535.');
  }

  const urlInterface = String(ambiente.FRONTEND_URL ?? 'http://localhost:5173');
  const origem = new URL(urlInterface);
  if (!['http:', 'https:'].includes(origem.protocol) || origem.origin !== urlInterface) {
    throw new Error('FRONTEND_URL deve ser uma origem HTTP, sem caminho ou barra final.');
  }

  const chaveJwt = ambiente.JWT_SECRET;
  if (typeof chaveJwt !== 'string' || Buffer.byteLength(chaveJwt.trim(), 'utf8') < 32) {
    throw new Error('Configure JWT_SECRET com uma chave aleatória de pelo menos 32 bytes.');
  }

  return { ...ambiente, PORT: porta, FRONTEND_URL: urlInterface };
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    ModuloAutenticacao,
    ModuloCategorias,
    ModuloTransacoes,
  ],
  providers: [ServicoPrisma],
  exports: [ServicoPrisma],
})
class ModuloAplicacao {}

async function iniciarAplicacao(): Promise<void> {
  const aplicacao = await NestFactory.create(ModuloAplicacao);
  const configuracao = aplicacao.get(ConfigService);
  const loggerHttp = new Logger('HTTP');
  const prefixoApi = 'api';

  aplicacao.setGlobalPrefix(prefixoApi);
  aplicacao.use((requisicao: Request, resposta: Response, proximo: NextFunction) => {
    const inicio = performance.now();
    resposta.once('finish', () => {
      const rota: unknown = requisicao.route?.path;
      if (typeof rota !== 'string' || !rota.startsWith(`/${prefixoApi}/`)) return;
      const duracao = Math.round(performance.now() - inicio);
      loggerHttp.log(`${requisicao.method} ${rota} ${resposta.statusCode} ${duracao}ms`);
    });
    proximo();
  });
  aplicacao.useGlobalFilters(new FiltroDeErros());
  aplicacao.enableCors({ origin: configuracao.getOrThrow<string>('FRONTEND_URL') });
  aplicacao.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  aplicacao.enableShutdownHooks();

  await aplicacao.listen(configuracao.getOrThrow<number>('PORT'), '0.0.0.0');
}

void iniciarAplicacao();
