const fs = require('fs/promises');

const tema = process.argv[2];
const quantidade = parseInt(process.argv[3], 10);

if (!tema || !quantidade || isNaN(quantidade) || quantidade <= 0) {
  console.error('Uso: node index.js <tema> <quantidade>');
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
  const prompt = `Gere exatamente ${quantidade} perguntas de múltipla escolha sobre "${tema}", cada uma com 4 opções (apenas 1 correta e 3 incorretas). 
  Formato de saída OBRIGATÓRIO: APENAS um array JSON de objetos no formato [{"pergunta": "...", "opcoes": ["...", "...", "...", "..."], "resposta": "..."}]. 
  Não inclua nenhum texto antes ou depois do JSON, nem blocos de código markdown.`;

  const body = {
    model: 'gemini-3.8-flash',
    input: prompt
  };

  let tentativas = 0;
  let sucesso = false;

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