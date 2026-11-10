import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  Body, CanActivate, Controller, ExecutionContext, HttpCode, HttpStatus,
  Injectable, Module, Post, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Transform } from 'class-transformer';
import { IsEmail, isUUID, Length, Matches } from 'class-validator';
import type { Request } from 'express';
import { ModuloUsuarios, ServicoUsuarios } from './usuarios';

class DtoLogin {
  @Transform(({ value: valor }: { value: unknown }) =>
    typeof valor === 'string' ? valor.trim().toLowerCase() : valor,
  )
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @Length(8, 128, { message: 'A senha deve ter entre 8 e 128 caracteres.' })
  password!: string;
}

class DtoCadastro extends DtoLogin {
  @Transform(({ value: valor }: { value: unknown }) =>
    typeof valor === 'string' ? valor.trim() : valor,
  )
  @Matches(/^[^\u0000]{2,100}$/u, { message: 'O nome deve ter entre 2 e 100 caracteres válidos.' })
  name!: string;
}

const tamanhoChave = 64;
const opcoes = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 ** 2 };

const derivarChave = promisify<string, Buffer, number, typeof opcoes, Buffer>(scrypt);

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivarChave(senha, sal, tamanhoChave, opcoes);
  return `${sal.toString('hex')}:${chave.toString('hex')}`;
}

async function verificarSenha(senha: string, hashSalvo: string): Promise<boolean> {
  const partes = /^([0-9a-f]{32}):([0-9a-f]{128})$/i.exec(hashSalvo);
  if (!partes) return false;
  const [, salHex, chaveHex] = partes;
  const chave = await derivarChave(senha, Buffer.from(salHex, 'hex'), tamanhoChave, opcoes);
  return timingSafeEqual(chave, Buffer.from(chaveHex, 'hex'));
}

export type RequisicaoAutenticada = Request & { usuarioId: string };

@Injectable()
export class GuardaAutenticacao implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = /^Bearer\s+(\S+)$/i.exec(requisicao.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Informe um token de acesso.');

    try {
      const dadosToken = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
      if (typeof dadosToken.sub !== 'string' || !isUUID(dadosToken.sub)) {
        throw new UnauthorizedException();
      }
      requisicao.usuarioId = dadosToken.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }
}

@Injectable()
export class ServicoAutenticacao {
  constructor(
    private readonly usuarios: ServicoUsuarios,
    private readonly jwt: JwtService,
  ) {}

  async cadastrar({ name, email, password: senha }: DtoCadastro) {
    const hashSenha = await gerarHashSenha(senha);
    return this.usuarios.criar({ name, email, passwordHash: hashSenha });
  }

  async entrar({ email, password: senha }: DtoLogin): Promise<{ accessToken: string }> {
    const usuario = await this.usuarios.buscarCredenciaisPorEmail(email);
    if (!usuario || !(await verificarSenha(senha, usuario.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const token = await this.jwt.signAsync({ sub: usuario.id });
    return { accessToken: token };
  }
}

@Controller('auth')
class ControladorAutenticacao {
  constructor(private readonly autenticacao: ServicoAutenticacao) {}

  @Post('register')
  async cadastrar(@Body() dto: DtoCadastro) {
    return { data: await this.autenticacao.cadastrar(dto) };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async entrar(@Body() dto: DtoLogin) {
    return { data: await this.autenticacao.entrar(dto) };
  }
}

@Module({
  imports: [
    ModuloUsuarios,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configuracao: ConfigService) => ({
        secret: configuracao.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: 3600 },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [ControladorAutenticacao],
  providers: [ServicoAutenticacao, GuardaAutenticacao],
  exports: [GuardaAutenticacao, JwtModule],
})
export class ModuloAutenticacao {}
