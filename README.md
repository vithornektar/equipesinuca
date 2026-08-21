# Torneio de Sinuca

Duas páginas independentes para gestão de torneios de sinuca (A3FAD).

## Arquivos

- **`pagina_inscriçoes_torneios.html`** — página de inscrição de torneios (configuração de valor, WhatsApp do responsável, lista de inscritos salva no navegador). Usa `app.js` e `style.css`.
- **`ranking_sinuca.html`** — Hall da Fama / ranking de jogadores. Arquivo standalone (CSS e JS inline).
- **`app.js`** / **`style.css`** — lógica e estilo compartilhados pela página de inscrições.
- **`assets/`** — logo e fontes.

## Notas

- Os dados de inscritos e a senha de configuração são armazenados no `sessionStorage`/`localStorage` do navegador — não há backend.
- Ambas as páginas podem ser abertas diretamente no navegador, sem servidor.
