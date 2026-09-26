const fs = require('fs/promises');

const tema = process.argv[2];
const quantidade = parseInt(process.argv[3], 10);
const dificuldade = process.argv[4];

const DIFICULDADES = ['fácil', 'médio', 'difícil'];
const CATEGORIAS = ['História', 'Geografia', 'Português', 'Matemática', 'Ciências', 'Atualidades', 'Entretenimento', 'Esportes', 'Geral'];

if (!tema || !quantidade || isNaN(quantidade) || quantidade <= 0) {
  console.error('Uso: node index.js "<tema>" <quantidade> <dificuldade>');
  console.error('Exemplo: node index.js "História do Brasil" 5 médio');
  process.exit(1);
}

if (!dificuldade) {
  console.error('Informe a dificuldade. Use exatamente um desses valores: fácil, médio ou difícil');
  console.error('Exemplo: node index.js "História do Brasil" 5 médio');
  process.exit(1);
}

const nivelDificuldade = dificuldade.toLowerCase();
if (!DIFICULDADES.includes(nivelDificuldade)) {
  console.error(`Dificuldade inválida: "${dificuldade}"`);
  console.error('Valores aceitos (sem diferenciar maiúsculas/minúsculas): fácil, médio, difícil');
  process.exit(1);
}

require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Variável de ambiente GEMINI_API_KEY não definida no .env');
  process.exit(1);
}

const URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

async function gerarPergunta() {
  let prompt;
  if (tema.toLowerCase() === 'geral') {
    prompt = `Gere exatamente ${quantidade} perguntas de múltipla escolha de cultura geral, com nível de dificuldade "${nivelDificuldade}" (fácil, médio ou difícil).

Distribua as perguntas de forma equilibrada entre estas categorias: "História", "Geografia", "Português", "Matemática", "Ciências", "Atualidades", "Entretenimento", "Esportes". Não concentre todas as perguntas em uma única categoria. Escolha os assuntos dentro de cada categoria livremente.

Cada pergunta deve ter:
- "pergunta": o enunciado da pergunta
- "categoria": a categoria da pergunta, usando exatamente um dos valores da lista acima. Se não se encaixar em nenhuma delas, use "Geral"
- "dificuldade": "${nivelDificuldade}"
- "opcoes": um array com exatamente 4 opções (apenas 1 correta e 3 incorretas), em ordem aleatória
- "resposta": o texto exato da opção correta (deve ser idêntico a um dos itens em "opcoes")
- "explicacao": uma frase curta explicando por que a resposta está correta

Regras:
- Não repita perguntas nem respostas óbvias demais.
- As opções incorretas devem ser plausíveis, não absurdas.
- Não deixe nenhuma categoria com mais que o dobro de perguntas de outra, dentro do possível.

Formato de saída OBRIGATÓRIO: APENAS um array JSON de objetos, no formato:
[{"pergunta": "...", "categoria": "...", "dificuldade": "...", "opcoes": ["...", "...", "...", "..."], "resposta": "...", "explicacao": "..."}]

Não inclua nenhum texto antes ou depois do JSON, nem blocos de código markdown (\`\`\`json).`;
  } else {
    prompt = `Gere exatamente ${quantidade} perguntas de múltipla escolha sobre "${tema}", com nível de dificuldade "${nivelDificuldade}" (fácil, médio ou difícil).

Cada pergunta deve ter:
- "pergunta": o enunciado da pergunta
- "categoria": a matéria/área geral à qual o tema pertence, escolhida SOMENTE entre estes valores: "História", "Geografia", "Português", "Matemática", "Ciências", "Atualidades", "Entretenimento", "Esportes", "Geral". Se o tema não se encaixar claramente em nenhuma dessas áreas, ou se houver qualquer dúvida sobre qual escolher, use "Geral". Nunca invente uma categoria fora dessa lista.
- "dificuldade": "${nivelDificuldade}"
- "opcoes": um array com exatamente 4 opções (apenas 1 correta e 3 incorretas), em ordem aleatória
- "resposta": o texto exato da opção correta (deve ser idêntico a um dos itens em "opcoes")
- "explicacao": uma frase curta explicando por que a resposta está correta

Regras:
- Não repita perguntas nem respostas óbvias demais.
- As opções incorretas devem ser plausíveis, não absurdas.
- Varie os subtemas dentro de "${tema}" entre as perguntas, mesmo que a "categoria" continue a mesma.

Formato de saída OBRIGATÓRIO: APENAS um array JSON de objetos, no formato:
[{"pergunta": "...", "categoria": "...", "dificuldade": "...", "opcoes": ["...", "...", "...", "..."], "resposta": "...", "explicacao": "..."}]

Não inclua nenhum texto antes ou depois do JSON, nem blocos de código markdown (\`\`\`json).`;
  }

  const body = {
    model: 'gemini-3.8-flash',
    input: prompt
  };

  let tentativas = 0;
  let sucesso = false;
  let falhaRateLimit = false;

  while (tentativas < 3 && !sucesso) {
    tentativas++;
    try {
      const resp = await fetch(URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify(body)
      });

      if (resp.status === 429 || resp.status === 503) {
        falhaRateLimit = true;
        const waitTime = Math.pow(2, tentativas) * 1000;
        console.log(`Limite de taxa (${resp.status}), aguardando ${waitTime}ms antes da tentativa ${tentativas}...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Erro ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      const texto = data.steps
        ?.filter(p => p.type === 'model_output')
        .flatMap(p => p.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('') || '';

      // Remover blocos de código markdown ```json ... ```
      let jsonTexto = texto.replace(/```json\s*|\```/g, '').trim();

      // Remover possíveis restante de markdown
      jsonTexto = jsonTexto.replace(/^```|```$/g, '').trim();

      let perguntaData;
      try {
        perguntaData = JSON.parse(jsonTexto);
      } catch (e) {
        if (tentativas >= 3) {
          throw new Error('Não foi possível fazer parse do JSON retornado pela IA. Resposta bruta: ' + jsonTexto.substring(0, 200));
        }
        console.log('Falha ao fazer parse do JSON, nova tentativa...');
        continue;
      }

      if (!Array.isArray(perguntaData)) {
        perguntaData = perguntaData?.pergunta ? [perguntaData] : [];
      }

      const validas = perguntaData.filter(p =>
        p && typeof p.pergunta === 'string' && Array.isArray(p.opcoes) && typeof p.resposta === 'string'
      );

      validas.forEach(p => {
        if (!CATEGORIAS.includes(p.categoria)) {
          p.categoria = 'Geral';
        }
      });

      if (validas.length === 0) {
        if (tentativas >= 3) {
          throw new Error('Estrutura JSON inválida da IA. Campos esperados: pergunta, opcoes, resposta');
        }
        continue;
      }

      sucesso = true;
      return validas;

    } catch (erro) {
      if (tentativas >= 3) {
        throw erro;
      }
      console.log(`Erro: ${erro.message}, retry ${tentativas}/3...`);
    }
  }

  throw new Error(falhaRateLimit
    ? 'Limite de requisições excedido após 3 tentativas'
    : 'Falha ao gerar perguntas após 3 tentativas sem retorno');
}

async function main() {
  let novasPerguntas = [];
  try {
    novasPerguntas = await gerarPergunta();
  } catch (erro) {
    console.error('Falha ao gerar pergunta:', erro.message);
    process.exit(1);
  }

  // Carregar perguntas existentes se o arquivo existir
  let perguntasExistentes = [];
  try {
    const dados = await fs.readFile('perguntas.json', 'utf-8');
    perguntasExistentes = JSON.parse(dados);
  } catch (erro) {
    // Arquivo não existe ou está vazio, começa do zero
  }

  // Filtrar duplicatas exatas (mesma pergunta e mesma resposta)
  const existingKeys = new Set();
  perguntasExistentes.forEach(p => {
    existingKeys.add(`${p.pergunta}|${p.resposta}`);
  });

  const novasUnicas = [];
  novasPerguntas.forEach(p => {
    const key = `${p.pergunta}|${p.resposta}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      novasUnicas.push(p);
    }
  });

  // Juntar antigo com novo
  const todasPerguntas = [...perguntasExistentes, ...novasUnicas];

  // Salvar arquivo
  await fs.writeFile('perguntas.json', JSON.stringify(todasPerguntas, null, 2));
  console.log(`Sucesso! ${novasUnicas.length} pergunta(s) adicionada(s). Total: ${todasPerguntas.length} perguntas.`);
}

main().catch(erro => {
  console.error('Erro inesperado:', erro.message);
  process.exit(1);
});