import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  HttpCode, HttpStatus, Injectable, Module, NotFoundException, Param,
  ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, Matches, ValidateIf } from 'class-validator';
import { GuardaAutenticacao, ModuloAutenticacao, type RequisicaoAutenticada } from './autenticacao';
import { ServicoPrisma } from './banco';
import { Prisma } from './generated/prisma/client';

class DtoCriarCategoria {
  @Transform(({ value: valor }: { value: unknown }) =>
    typeof valor === 'string' ? valor.trim() : valor,
  )
  @Matches(/^[^\u0000]{1,100}$/u, { message: 'O nome deve ter entre 1 e 100 caracteres válidos.' })
  name!: string;

  @IsOptional()
  @Matches(/^[^\u0000]{0,255}$/u, { message: 'A descrição deve ser um texto de até 255 caracteres válidos.' })
  description?: string | null;
}

class DtoAtualizarCategoria {
  @Transform(({ value: valor }: { value: unknown }) =>
    typeof valor === 'string' ? valor.trim() : valor,
  )
  @ValidateIf((_categoria, valor: unknown) => valor !== undefined)
  @Matches(/^[^\u0000]{1,100}$/u, { message: 'O nome deve ter entre 1 e 100 caracteres válidos.' })
  name?: string;

  @IsOptional()
  @Matches(/^[^\u0000]{0,255}$/u, { message: 'A descrição deve ser um texto de até 255 caracteres válidos.' })
  description?: string | null;
}

const camposCategoria = { id: true, name: true, description: true } as const;

function tratarErroCategoria(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2025') throw new NotFoundException('Categoria não encontrada.');
    if (erro.code === 'P2003') {
      throw new ConflictException('Esta categoria está vinculada a uma transação.');
    }
  }
  throw erro;
}

@Injectable()
export class ServicoCategorias {
  constructor(private readonly prisma: ServicoPrisma) {}

  criar(usuarioId: string, dto: DtoCriarCategoria) {
    return this.prisma.category.create({
      data: { name: dto.name, description: dto.description, userId: usuarioId },
      select: camposCategoria,
    });
  }

  listar(usuarioId: string) {
    return this.prisma.category.findMany({
      where: { userId: usuarioId },
      select: camposCategoria,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  buscarPorId(usuarioId: string, id: string) {
    return this.prisma.category.findUniqueOrThrow({
      where: { id, userId: usuarioId },
      select: camposCategoria,
    }).catch(tratarErroCategoria);
  }

  atualizar(usuarioId: string, id: string, dto: DtoAtualizarCategoria) {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    return this.prisma.category.update({
      where: { id, userId: usuarioId },
      data: { name: dto.name, description: dto.description },
      select: camposCategoria,
    }).catch(tratarErroCategoria);
  }

  async excluir(usuarioId: string, id: string): Promise<void> {
    await this.prisma.category.delete({
      where: { id, userId: usuarioId },
      select: { id: true },
    }).catch(tratarErroCategoria);
  }
}

@Controller('categories')
@UseGuards(GuardaAutenticacao)
class ControladorCategorias {
  constructor(private readonly categorias: ServicoCategorias) {}

  @Post()
  async criar(@Req() requisicao: RequisicaoAutenticada, @Body() dto: DtoCriarCategoria) {
    return { data: await this.categorias.criar(requisicao.usuarioId, dto) };
  }

  @Get()
  async listar(@Req() requisicao: RequisicaoAutenticada) {
    return { data: await this.categorias.listar(requisicao.usuarioId) };
  }

  @Get(':id')
  async buscarPorId(@Req() requisicao: RequisicaoAutenticada, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.categorias.buscarPorId(requisicao.usuarioId, id) };
  }

  @Patch(':id')
  async atualizar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DtoAtualizarCategoria,
  ) {
    return { data: await this.categorias.atualizar(requisicao.usuarioId, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  excluir(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.categorias.excluir(requisicao.usuarioId, id);
  }
}

@Module({
  imports: [ModuloAutenticacao],
  controllers: [ControladorCategorias],
  providers: [ServicoCategorias],
})
export class ModuloCategorias {}
