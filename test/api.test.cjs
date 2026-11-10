require('reflect-metadata');
const assert = require('node:assert/strict');
const teste = require('node:test');
const { ValidationPipe } = require('@nestjs/common');
const { ServicoAutenticacao, gerarHashSenha } = require('../dist/autenticacao');
const { ServicoCategorias } = require('../dist/categorias');
const { ModuloTransacoes, ServicoTransacoes } = require('../dist/transacoes');
const { Prisma } = require('../dist/generated/prisma/client');

const status = (codigo) => (erro) => erro.getStatus() === codigo;
const erroPrisma = (code) => new Prisma.PrismaClientKnownRequestError('Teste', { code, clientVersion: '7' });

teste('login rejeita a senha incorreta e mantém o hash fora da resposta', async () => {
  const senha = 'SenhaParaTeste!';
  const passwordHash = await gerarHashSenha(senha);
  const autenticacao = new ServicoAutenticacao({ buscarCredenciaisPorEmail: async () => ({ id: 'dono', passwordHash }) },
    { signAsync: async ({ sub }) => `jwt:${sub}` });
  await assert.rejects(autenticacao.entrar({ email: 'teste@akrk.example', password: 'SenhaIncorreta!' }), status(401));
  assert.deepEqual(await autenticacao.entrar({ email: 'teste@akrk.example', password: senha }), { accessToken: 'jwt:dono' });
});

teste('consulta de categoria inclui o dono e oculta categorias alheias', async () => {
  const categorias = new ServicoCategorias({ category: { findUniqueOrThrow: async ({ where }) => {
    assert.deepEqual(where, { id: 'categoria-de-outra-conta', userId: 'dono' });
    throw erroPrisma('P2025');
  } } });
  await assert.rejects(categorias.buscarPorId('dono', 'categoria-de-outra-conta'), status(404));
});

teste('edição usa o dono tanto na transação quanto no vínculo da categoria', async () => {
  const transacoes = new ServicoTransacoes({ transaction: { update: async ({ where, data }) => {
    assert.deepEqual(where, { id: 'movimento', userId: 'dono' });
    assert.deepEqual(data.category.connect, { id: 'categoria-alheia', userId: 'dono' });
    throw erroPrisma('P2025');
  } } });
  await assert.rejects(transacoes.atualizar('dono', 'movimento', {
    description: 'Compra', amountCents: 2590, type: 'EXPENSE', date: new Date('2026-11-09'), categoryId: 'categoria-alheia',
  }), status(404));
});

teste('paginação valida parâmetros e rejeita data de calendário impossível', async () => {
  const [controlador] = Reflect.getMetadata('controllers', ModuloTransacoes);
  const [, metatype] = Reflect.getMetadata('design:paramtypes', controlador.prototype, 'listar');
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validar = (entrada) => pipe.transform(entrada, { type: 'query', metatype });
  assert.equal((await validar({ page: '2', limit: '5' })).page, 2);
  await assert.rejects(validar({ page: '1e3' }), status(400));
  await assert.rejects(validar({ startDate: '2026-02-30' }), status(400));
  await assert.rejects(validar({ userId: 'outra-conta' }), status(400));
});

teste('dashboard separa saldo geral e totais do período, limitando o ranking a três categorias do dono', async () => {
  const inicio = new Date('2026-11-01');
  const fim = new Date('2026-11-09');
  const grupos = (income, expense) => [
    { type: 'INCOME', _sum: { amountCents: income } },
    { type: 'EXPENSE', _sum: { amountCents: expense } },
  ];
  const banco = {
    transaction: { groupBy: async ({ by, where, take, orderBy }) => {
      assert.equal(where.userId, 'dono');
      if (by[0] === 'type') return where.date ? grupos(550000, 265000) : grupos(950000, 265000);
      assert.deepEqual(where, { userId: 'dono', date: { gte: inicio, lte: fim }, type: 'EXPENSE', category: { userId: 'dono' } });
      assert.equal(take, 3);
      assert.deepEqual(orderBy, [{ _sum: { amountCents: 'desc' } }, { categoryId: 'asc' }]);
      return [150000, 80000, 35000].map((amountCents, i) => ({ categoryId: String(i), _sum: { amountCents } }));
    } },
    category: { findMany: async ({ where }) => {
      assert.deepEqual(where, { userId: 'dono', id: { in: ['0', '1', '2'] } });
      return ['Moradia', 'Alimentação', 'Transporte'].map((name, i) => ({ id: String(i), name }));
    } },
  };
  const transacoes = new ServicoTransacoes({ $transaction: async (executar, opcoes) => {
    assert.equal(opcoes.isolationLevel, 'RepeatableRead');
    return executar(banco);
  } });
  const resumo = await transacoes.resumir('dono', { startDate: inicio, endDate: fim });
  assert.equal(resumo.balanceCents, 685000);
  assert.equal(resumo.incomeCents, 550000);
  assert.equal(resumo.expenseCents, 265000);
  assert.deepEqual(resumo.topExpenseCategories.map(({ name, amountCents }) => [name, amountCents]),
    [['Moradia', 150000], ['Alimentação', 80000], ['Transporte', 35000]]);
});

teste('dashboard vazio retorna zero e rejeita um intervalo invertido', async () => {
  const transacoes = new ServicoTransacoes({ $transaction: (executar) => executar({ transaction: { groupBy: async () => [] } }) });
  assert.deepEqual(await transacoes.resumir('dono', {}), { balanceCents: 0, incomeCents: 0, expenseCents: 0, topExpenseCategories: [] });
  assert.throws(() => transacoes.resumir('dono', { startDate: new Date('2026-11-09'), endDate: new Date('2026-11-01') }), status(400));
});
