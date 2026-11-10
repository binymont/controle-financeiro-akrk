require('dotenv/config');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { ServicoPrisma } = require('../dist/banco');
const { gerarHashSenha } = require('../dist/autenticacao');

const banco = new ServicoPrisma(new ConfigService());
const email = 'demo@akrk.example';
const senha = 'DemoAKRK2026!';

async function criarDemonstracao() {
  const passwordHash = await gerarHashSenha(senha);
  const dia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format();
  const data = new Date(`${dia}T00:00:00.000Z`);
  const mesAnterior = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 0));

  const criada = await banco.$transaction(async (tx) => {
    const [conta] = await tx.user.createManyAndReturn({
      data: { name: 'Demonstração AKRK', email, passwordHash },
      skipDuplicates: true,
      select: { id: true },
    });
    if (!conta) return false;
    const userId = conta.id;
    const categorias = await tx.category.createManyAndReturn({
      data: ['Receitas', 'Moradia', 'Alimentação', 'Transporte'].map((name) => ({ userId, name })),
      select: { id: true, name: true },
    });
    const ids = new Map(categorias.map(({ name, id }) => [name, id]));
    await tx.transaction.createMany({ data: [
      { description: 'Recebimento anterior', amountCents: 400000, type: 'INCOME', date: mesAnterior, categoria: 'Receitas' },
      { description: 'Recebimento do mês', amountCents: 550000, type: 'INCOME', date: data, categoria: 'Receitas' },
      { description: 'Aluguel', amountCents: 150000, type: 'EXPENSE', date: data, categoria: 'Moradia' },
      { description: 'Mercado', amountCents: 80000, type: 'EXPENSE', date: data, categoria: 'Alimentação' },
      { description: 'Deslocamentos', amountCents: 35000, type: 'EXPENSE', date: data, categoria: 'Transporte' },
    ].map(({ categoria, ...movimento }) => ({ ...movimento, userId, categoryId: ids.get(categoria) })) });
    return true;
  });
  console.log(criada ? `Conta de demonstração criada: ${email}` : 'A conta de demonstração já existe. Os dados foram preservados.');
}

criarDemonstracao().catch((erro) => {
  console.error('Não foi possível criar os dados de demonstração:', erro.message);
  process.exitCode = 1;
}).finally(() => banco.$disconnect());
