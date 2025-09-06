# South Sea Kanban

Um sistema de quadro Kanban para gerenciamento de prospects de vendas, projetado para otimizar o fluxo de trabalho e a visualização do funil de vendas.

## Visão Geral

O South Sea Kanban é uma ferramenta visual que ajuda a equipe de marketing e vendas a acompanhar o progresso de cada prospect, desde o primeiro contato até o fechamento do negócio. A interface intuitiva de arrastar e soltar facilita a atualização do status dos clientes, e o sistema oferece uma visão clara do pipeline de vendas.

## Funcionalidades Principais

- **Quadro Kanban:** Visualize e gerencie prospects em colunas de status (Pendente, Contactado, Reunião, Proposta, Fechado).
- **Gerenciamento de Prospects (CRUD):** Adicione, edite e exclua informações detalhadas de cada prospect.
- **Arrastar e Soltar (Drag & Drop):** Mova cards entre as colunas para atualizar o status de forma rápida e intuitiva.
- **Filtros e Busca:** Encontre prospects específicos utilizando a busca por nome ou setor e filtre por nível de prioridade.
- **Dashboard com Estatísticas:** Acompanhe métricas importantes como o número total de prospects, prospects de alta prioridade, potencial de receita e ticket médio.
- **Importação e Exportação de Dados:** Importe listas de leads em formato CSV e exporte os dados do quadro a qualquer momento.
- **Integração com Firebase:** Os dados são armazenados e sincronizados em tempo real com o Firestore, garantindo consistência e acesso rápido.

## Tecnologias Utilizadas

- **Frontend:**
  - HTML5
  - [Tailwind CSS](https://tailwindcss.com/)
  - JavaScript (ES6 Modules)
- **Backend & Banco de Dados:**
  - [Firebase](https://firebase.google.com/) (Firestore para banco de dados e Authentication para login anônimo)

## Como Executar o Projeto

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/garciagoedert/southsea-kanban.git
    ```
2.  **Navegue até o diretório do projeto:**
    ```bash
    cd southsea-kanban
    ```
3.  **Abra o arquivo `login.html` em seu navegador.**
    - Você pode simplesmente arrastar o arquivo para a janela do navegador ou usar uma extensão como o "Live Server" no VSCode.

4.  **Credenciais de Acesso:**
    - **Email:** `marketing@southsea.com.br`
    - **Senha:** `Southsea@!`

## Estrutura dos Arquivos

- `index.html`: A página principal da aplicação, onde o quadro Kanban é renderizado.
- `login.html`: A página de login.
- `login.js`: Contém a lógica de autenticação para a página de login.
- `production.js`: Lida com a lógica de duplicar um card para a seção de "Produção" quando ele é movido para "Fechado".
- `closed-clients.html` / `closed-clients.js`: Páginas e scripts para visualizar clientes que já foram fechados.
- `sidebar.html` / `header.html`: Componentes de UI reutilizáveis que são carregados dinamicamente nas páginas.
# southsea-sys
