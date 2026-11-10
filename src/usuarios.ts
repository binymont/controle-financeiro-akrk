import { ConflictException, Injectable, Module } from '@nestjs/common';
import { ServicoPrisma } from './banco';
import { Prisma } from './generated/prisma/client';

const camposPublicosUsuario = { id: true, name: true, email: true } as const;

@Injectable()
export class ServicoUsuarios {
  constructor(private readonly prisma: ServicoPrisma) {}

  async criar(dados: { name: string; email: string; passwordHash: string }) {
    try {
      return await this.prisma.user.create({ data: dados, select: camposPublicosUsuario });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Este e-mail já está cadastrado.');
      }
      throw erro;
    }
  }

  buscarCredenciaisPorEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
  }
}

@Module({
  providers: [ServicoUsuarios],
  exports: [ServicoUsuarios],
})
export class ModuloUsuarios {}
