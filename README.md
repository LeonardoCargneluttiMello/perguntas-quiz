# Gerador de perguntas de quiz usando Google Gemini AI

## Configuração

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

2. Preencha a variável `GEMINI_API_KEY` no arquivo `.env` com sua chave da Google AI Studio:
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```

3. Instale as dependências:
   ```bash
   npm install
   ```

4. Rode o script passando o tema e a quantidade desejada:
   ```bash
   node index.js "História do Brasil" 5
   # ou usando o script do package.json:
   npm start "História do Brasil" 5
   ```

O script gerará perguntas de múltipla escolha e as adicionará ao arquivo `perguntas.json` sem apagar as existentes.