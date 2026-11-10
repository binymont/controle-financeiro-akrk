import {
  applyDecorators, BadRequestException, Body, ConflictException, Controller,
  Delete, Get, HttpCode, HttpStatus, Injectable, Module, NotFoundException,
  Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { GuardaAutenticacao, ModuloAutenticacao, type RequisicaoAutenticada } from './autenticacao';
import { ServicoPrisma } from './banco';
import { Prisma } from './generated/prisma/client';
import { TransactionType } from './generated/prisma/enums';

function DataSemHorario() {
  return applyDecorators(
    Transform(({ value: valor }: { value: unknown }) => {
      if (typeof valor !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
      const data = new Date(`${valor}T00:00:00.000Z`);
      return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor
        ? data
        : valor;
    }),
    IsDate({ message: '$property deve ser uma data válida no formato AAAA-MM-DD.' }),
  );
}

class DtoGravarTransacao {
  @Transform(({ value: valor }: { value: unknown }) =>
    typeof valor === 'string' ? valor.trim() : valor,
  )
  @Matches(/^[^\u0000]{1,255}$/u, { message: 'A descrição deve ter entre 1 e 255 caracteres válidos.' })
  description!: string;

  @IsInt({ message: 'O valor em centavos deve ser um número inteiro.' })
  @Min(1, { message: 'O valor deve ser maior que zero.' })
  @Max(2_147_483_647, { message: 'O valor ultrapassa o limite por transação.' })
  amountCents!: number;

  @IsEnum(TransactionType, { message: 'O tipo deve ser INCOME ou EXPENSE.' })
  type!: TransactionType;

  @DataSemHorario()
  date!: Date;

  @IsUUID(undefined, { message: 'Informe um identificador de categoria válido.' })
  categoryId!: string;
}

const numeroDaConsulta = ({ value: valor }: { value: unknown }) =>
  typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : valor;

class DtoPeriodo {
  @IsOptional()
  @DataSemHorario()
  startDate?: Date;

  @IsOptional()
  @DataSemHorario()
  endDate?: Date;
}

class DtoListarTransacoes extends DtoPeriodo {
  @Transform(numeroDaConsulta)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @Transform(numeroDaConsulta)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

function filtrarPeriodo({ startDate: inicio, endDate: fim }: DtoPeriodo) {
  if (inicio && fim && inicio > fim) {
    throw new BadRequestException('A data inicial deve ser anterior ou igual à data final.');
  }
  return inicio || fim ? { gte: inicio, lte: fim } : undefined;
}

const camposTransacao = {
  id: true,
  description: true,
  amountCents: true,
  type: true,
  date: true,
  categoryId: true,
} as const;

type RegistroTransacao = Prisma.TransactionGetPayload<{ select: typeof camposTransacao }>;

function formatarTransacao(registro: RegistroTransacao) {
  return { ...registro, date: registro.date.toISOString().slice(0, 10) };
}

function dadosTransacao(dto: DtoGravarTransacao, usuarioId: string) {
  return {
    description: dto.description,
    amountCents: dto.amountCents,
    type: dto.type,
    date: dto.date,
    category: { connect: { id: dto.categoryId, userId: usuarioId } },
  };
}

function tratarErroTransacao(erro: unknown, mensagem: string): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2025') throw new NotFoundException(mensagem);
    if (erro.code === 'P2003') {
      throw new ConflictException('Não foi possível vincular a categoria. Confira se ela ainda existe.');
    }
  }
  throw erro;
}

@Injectable()
export class ServicoTransacoes {
  constructor(private readonly prisma: ServicoPrisma) {}

  async criar(usuarioId: string, dto: DtoGravarTransacao) {
    const transacao = await this.prisma.transaction.create({
      data: { ...dadosTransacao(dto, usuarioId), user: { connect: { id: usuarioId } } },
      select: camposTransacao,
    }).catch((erro: unknown) => tratarErroTransacao(erro, 'Categoria ou usuário não encontrado.'));
    return formatarTransacao(transacao);
  }

  async listar(usuarioId: string, filtros: DtoListarTransacoes) {
    const { page: pagina, limit: limite } = filtros;
    const condicoes: Prisma.TransactionWhereInput = {
      userId: usuarioId,
      type: filtros.type,
      categoryId: filtros.categoryId,
      date: filtrarPeriodo(filtros),
    };

    const [transacoes, total] = await this.prisma.$transaction(
      [
        this.prisma.transaction.findMany({
          where: condicoes,
          select: camposTransacao,
          orderBy: [{ date: 'desc' }, { id: 'asc' }],
          skip: (pagina - 1) * limite,
          take: limite,
        }),
        this.prisma.transaction.count({ where: condicoes }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      data: transacoes.map(formatarTransacao),
      meta: { page: pagina, limit: limite, total, totalPages: Math.ceil(total / limite) },
    };
  }

  resumir(usuarioId: string, periodo: DtoPeriodo) {
    const data = filtrarPeriodo(periodo);
    const dono = { userId: usuarioId };
    const filtro = { ...dono, date: data };

    return this.prisma.$transaction(async (banco) => {
      const somarPorTipo = (where: Prisma.TransactionWhereInput) =>
        banco.transaction.groupBy({ by: ['type'], where, _sum: { amountCents: true } });
      const geral = await somarPorTipo(dono);
      const selecionado = data ? await somarPorTipo(filtro) : geral;
      const somar = (grupos: typeof geral, tipo: TransactionType) =>
        grupos.find(({ type }) => type === tipo)?._sum.amountCents ?? 0;

      const maiores = await banco.transaction.groupBy({
        by: ['categoryId'],
        where: { ...filtro, type: TransactionType.EXPENSE, category: dono },
        _sum: { amountCents: true },
        orderBy: [{ _sum: { amountCents: 'desc' } }, { categoryId: 'asc' }],
        take: 3,
      });
      const categorias = maiores.length ? await banco.category.findMany({
        where: { ...dono, id: { in: maiores.map(({ categoryId }) => categoryId) } },
        select: { id: true, name: true },
      }) : [];
      const nomes = new Map(categorias.map(({ id, name }) => [id, name]));

      return {
        balanceCents: somar(geral, TransactionType.INCOME) - somar(geral, TransactionType.EXPENSE),
        incomeCents: somar(selecionado, TransactionType.INCOME),
        expenseCents: somar(selecionado, TransactionType.EXPENSE),
        topExpenseCategories: maiores.flatMap(({ categoryId, _sum }) => {
          const name = nomes.get(categoryId);
          return name ? [{ categoryId, name, amountCents: _sum.amountCents ?? 0 }] : [];
        }),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async atualizar(usuarioId: string, id: string, dto: DtoGravarTransacao) {
    const transacao = await this.prisma.transaction.update({
      where: { id, userId: usuarioId },
      data: dadosTransacao(dto, usuarioId),
      select: camposTransacao,
    }).catch((erro: unknown) => tratarErroTransacao(erro, 'Transação ou categoria não encontrada.'));
    return formatarTransacao(transacao);
  }

  async excluir(usuarioId: string, id: string): Promise<void> {
    const { count } = await this.prisma.transaction.deleteMany({ where: { id, userId: usuarioId } });
    if (count === 0) throw new NotFoundException('Transação não encontrada.');
  }
}

@Controller('transactions')
@UseGuards(GuardaAutenticacao)
class ControladorTransacoes {
  constructor(private readonly transacoes: ServicoTransacoes) {}

  @Post()
  async criar(@Req() requisicao: RequisicaoAutenticada, @Body() dto: DtoGravarTransacao) {
    return { data: await this.transacoes.criar(requisicao.usuarioId, dto) };
  }

  @Get()
  listar(@Req() requisicao: RequisicaoAutenticada, @Query() filtros: DtoListarTransacoes) {
    return this.transacoes.listar(requisicao.usuarioId, filtros);
  }

  @Get('summary')
  async resumir(@Req() requisicao: RequisicaoAutenticada, @Query() periodo: DtoPeriodo) {
    return { data: await this.transacoes.resumir(requisicao.usuarioId, periodo) };
  }

  @Put(':id')
  async atualizar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DtoGravarTransacao,
  ) {
    return { data: await this.transacoes.atualizar(requisicao.usuarioId, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  excluir(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.transacoes.excluir(requisicao.usuarioId, id);
  }
}

@Module({
  imports: [ModuloAutenticacao],
  controllers: [ControladorTransacoes],
  providers: [ServicoTransacoes],
})
export class ModuloTransacoes {}
