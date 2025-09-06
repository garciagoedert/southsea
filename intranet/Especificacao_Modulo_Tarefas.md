# Especificação Técnica e Funcional: Módulo de Gerenciamento de Tarefas

**Versão:** 1.0
**Data:** 2024-08-13
**Autor:** Cline

---

## 1. Objetivo Principal e Contexto de Negócio

O objetivo deste documento é especificar o design e a funcionalidade de um novo módulo de **Gerenciamento de Tarefas** a ser integrado ao CRM existente. Este módulo visa solucionar um gargalo crítico de comunicação interna, centralizando todas as ações, pendências e discussões relacionadas a clientes e negócios. Ele deve se tornar a **fonte única de verdade** para o trabalho diário das equipes, eliminando a dispersão de informações em e-mails, planilhas e aplicativos de mensagens.

### Princípios de Design

- **Inspiração:** O design se inspira nas melhores práticas de ferramentas de mercado:
    - **Ekyte:** Para o detalhamento, contexto e a importância do registro de atividades.
    - **Asana/ClickUp:** Para a estrutura hierárquica (tarefas e subtarefas) e automações.
    - **Monday.com:** Para o apelo visual, clareza dos fluxos de trabalho e dashboards.

- **Consciência de Contexto:** Este não é um módulo de gerenciamento de projetos genérico. Seu principal diferencial é a **integração profunda com as entidades do CRM (Usuários, Clentes, Negócios, etc.)**. Cada funcionalidade deve ser projetada para alavancar os dados já existentes, tornando as ações mais rápidas e contextuais.

### Caso de Uso Crítico (Guia para o Design)

Um membro da equipe de produção precisa de uma informação de um cliente, mas não tem o contato direto. O fluxo ideal no novo módulo seria:

1.  O usuário cria uma nova tarefa.
2.  Vincula a tarefa diretamente ao card do **Cliente X** no painel Kanban do CRM.
3.  Atribui a tarefa ao vendedor responsável, **"Bruno"**.
4.  Define um prazo **urgente** ("para hoje").
5.  Descreve a necessidade no corpo da tarefa: *"Obter contato do decisor técnico para aprovação do layout"*.
6.  Bruno é notificado instantaneamente, visualiza a tarefa com todo o contexto do cliente e age rapidamente. Todo o histórico da solicitação fica registrado na tarefa.

---

## 2. Modelo de Dados (Estrutura do Banco de Dados)

A seguir, detalha-se a estrutura de um banco de dados relacional (SQL) para suportar as funcionalidades do módulo.

### Tabela: `Tasks` (Tarefas)
A entidade central do módulo.

-   **Atributos:**
    -   `id`: Chave primária, UUID.
    -   `title`: VARCHAR(255), não nulo. Título da tarefa.
    -   `description`: TEXT. Descrição detalhada, suportando Markdown.
    -   `status`: VARCHAR(50), não nulo. (Ex: `pending`, `in_progress`, `review`, `done`).
    -   `priority`: VARCHAR(50), não nulo. (Ex: `low`, `normal`, `high`, `urgent`).
    -   `due_date`: TIMESTAMP. Data e hora de vencimento.
    -   `estimated_effort`: INTEGER. Esforço estimado em minutos.
    -   `completed_at`: TIMESTAMP. Data e hora da conclusão.
    -   `created_by_user_id`: Chave estrangeira para `Users.id`. Quem criou a tarefa.
    -   `assigned_to_user_id`: Chave estrangeira para `Users.id`. O responsável pela tarefa.
    -   `parent_task_id`: Chave estrangeira para `Tasks.id` (auto-referência). Para subtarefas.
    -   `parent_entity_id`: VARCHAR(255). ID da entidade do CRM à qual a tarefa está vinculada.
    -   `parent_entity_type`: VARCHAR(50). Tipo da entidade (Ex: `client`, `deal`, `ticket`).
    -   `recurrence_rule`: VARCHAR(255). Regra de recorrência no formato iCalendar (RRULE).
    -   `created_at`: TIMESTAMP.
    -   `updated_at`: TIMESTAMP.

-   **Relacionamentos:**
    -   `Users` (Criador): Muitos-para-Um (`Tasks` -> `Users`).
    -   `Users` (Responsável): Muitos-para-Um (`Tasks` -> `Users`).
    -   `Tasks` (Subtarefas): Um-para-Muitos (`Tasks` -> `Tasks` via `parent_task_id`).

### Tabela: `TaskTemplates` (Modelos de Tarefas)
Para criação rápida de tarefas padronizadas.

-   **Atributos:**
    -   `id`: Chave primária, UUID.
    -   `name`: VARCHAR(255), não nulo. Nome do modelo.
    -   `default_title`: VARCHAR(255).
    -   `default_description`: TEXT.
    -   `default_priority`: VARCHAR(50).
    -   `default_effort`: INTEGER (em minutos).
    -   `default_subtasks`: JSON. Um array de objetos, cada um contendo `title`, `description`, etc. para as subtarefas padrão.
    -   `created_by_user_id`: Chave estrangeira para `Users.id`.
    -   `created_at`: TIMESTAMP.
    -   `updated_at`: TIMESTAMP.

### Tabela: `TimeLogs` (Registros de Tempo)
Para a funcionalidade de "time tracking".

-   **Atributos:**
    -   `id`: Chave primária, UUID.
    -   `task_id`: Chave estrangeira para `Tasks.id`, não nulo.
    -   `user_id`: Chave estrangeira para `Users.id`, não nulo.
    -   `start_time`: TIMESTAMP, não nulo. Início do período de trabalho.
    -   `end_time`: TIMESTAMP. Fim do período de trabalho.
    -   `duration_minutes`: INTEGER. Duração calculada.
    -   `created_at`: TIMESTAMP.

### Tabela: `Comments` (Comentários)
Para colaboração e histórico de discussões.

-   **Atributos:**
    -   `id`: Chave primária, UUID.
    -   `task_id`: Chave estrangeira para `Tasks.id`, não nulo.
    -   `user_id`: Chave estrangeira para `Users.id`, não nulo.
    -   `content`: TEXT, não nulo. Conteúdo do comentário.
    -   `created_at`: TIMESTAMP.

### Tabela: `TaskActivityLog` (Log de Atividades da Tarefa)
Para um histórico imutável de mudanças.

-   **Atributos:**
    -   `id`: Chave primária, UUID.
    -   `task_id`: Chave estrangeira para `Tasks.id`, não nulo.
    -   `user_id`: Chave estrangeira para `Users.id`. Quem realizou a ação.
    -   `activity_type`: VARCHAR(100), não nulo. (Ex: `task.created`, `task.status.changed`, `assignee.changed`).
    -   `old_value`: TEXT. Valor antigo (serializado).
    -   `new_value`: TEXT. Novo valor (serializado).
    -   `changed_at`: TIMESTAMP, não nulo.

---

## 3. Funcionalidades Essenciais (Histórias de Usuário)

### Épico: Gerenciamento Básico de Tarefas
-   **História 1 (Resolve o Caso de Uso Crítico):**
    -   **Como** um membro da equipe,
    -   **Eu quero** criar uma nova tarefa, vinculá-la a um cliente, atribuí-la a um colega, definir um prazo e uma descrição,
    -   **Para que** eu possa solicitar uma ação de forma rastreável e contextual.

-   **História 2:**
    -   **Como** o responsável por uma tarefa,
    -   **Eu quero** editar qualquer um de seus atributos (título, prazo, status, etc.) e marcá-la como concluída,
    -   **Para que** eu possa manter o progresso atualizado.

### Épico: Hierarquia e Organização
-   **História 3:**
    -   **Como** um gerente de projeto,
    -   **Eu quero** quebrar uma tarefa complexa em uma lista de subtarefas,
    -   **Para que** eu possa organizar melhor o trabalho e delegar partes menores.

-   **História 4:**
    -   **Como** um gerente de projeto,
    -   **Eu quero** atribuir subtarefas a pessoas diferentes da tarefa principal,
    -   **Para que** eu possa distribuir a responsabilidade de forma granular.

### Épico: Colaboração Contextual
-   **História 5:**
    -   **Como** um membro da equipe,
    -   **Eu quero** adicionar comentários a uma tarefa e mencionar um colega usando "@",
    -   **Para que** eu possa fazer perguntas, dar atualizações e notificar a pessoa certa diretamente.

### Épico: Produtividade e Templates
-   **História 6:**
    -   **Como** um líder de equipe,
    -   **Eu quero** criar um modelo de tarefa para um processo recorrente (ex: "Onboarding de Novo Cliente"), com subtarefas pré-definidas,
    -   **Para que** minha equipe possa criar tarefas padronizadas com um único clique.

### Épico: Controle de Tempo (Time Tracking)
-   **História 7:**
    -   **Como** um membro da equipe,
    -   **Eu quero** iniciar, pausar e parar um cronômetro de tempo diretamente na tela da tarefa,
    -   **Para que** eu possa registrar o esforço real gasto em cada atividade de forma precisa.

### Épico: Visualização e Filtros
-   **História 8:**
    -   **Como** um usuário,
    -   **Eu quero** ver todas as minhas tarefas em uma visualização de lista,
    -   **Para que** eu possa ter uma visão geral do meu trabalho.

-   **História 9:**
    -   **Como** um usuário,
    -   **Eu quero** filtrar a lista de tarefas por responsável, status, prioridade, prazo e cliente associado, além de poder ordenar por qualquer um desses campos,
    -   **Para que** eu possa encontrar rapidamente as tarefas que me interessam.

### Épico: Notificações em Tempo Real
-   **História 10:**
    -   **Como** um usuário,
    -   **Eu quero** receber uma notificação em tempo real no CRM quando uma tarefa for atribuída a mim, quando eu for mencionado em um comentário ou quando o prazo de uma tarefa minha for alterado,
    -   **Para que** eu fique ciente de eventos importantes sem precisar verificar manualmente.

---

## 4. Design da Interface e Experiência do Usuário (UI/UX)

### Modal de Criação/Edição de Tarefa
-   **Layout:** Um modal limpo e focado.
-   **Campos:**
    -   `Título`: Campo de texto, obrigatório.
    -   `Descrição`: Editor de texto rico (Markdown), com abas para "Escrever" e "Visualizar".
    -   `Responsável`: Campo de busca de usuários do CRM.
    -   `Prazo`: Seletor de data e hora.
    -   `Prioridade`: Dropdown (Baixa, Normal, Alta, Urgente).
    -   `Vincular a`: **Campo de busca inteligente**. Permite pesquisar por nome em diferentes entidades (Clientes, Negócios, etc.) e exibe os resultados com um ícone identificando o tipo de entidade.
    -   `Status`: Dropdown (Pendente, Em Progresso, etc.).
    -   `Esforço Estimado`: Campo numérico para minutos/horas.

### Painel de Detalhes da Tarefa
-   **Layout:** Duas colunas para organizar a informação de forma clara quando uma tarefa é aberta.
-   **Coluna Principal (70% da largura):**
    -   **Cabeçalho:** Título da tarefa (editável inline).
    -   **Descrição:** Renderização da descrição em Markdown.
    -   **Subtarefas:** Uma lista de subtarefas, cada uma com um checkbox, título e responsável. Permite adicionar novas subtarefas inline.
    -   **Comentários:** Feed de comentários, do mais recente para o mais antigo. Um campo de texto na parte inferior para adicionar novos comentários, com suporte a @menções.

-   **Coluna Lateral (30% da largura):**
    -   **Metadados:**
        -   `Status`: Dropdown para mudança rápida.
        -   `Responsável`: Clicável, abre o perfil do usuário.
        -   `Prazo`: Clicável, abre o seletor de data.
        -   `Prioridade`: Clicável, abre o dropdown.
        -   `Vínculo`: Link para a entidade do CRM (ex: "Cliente: Empresa ABC").
    -   **Controle de Tempo:**
        -   Exibe o tempo total já registrado.
        -   Botão "Iniciar Cronômetro" / "Parar Cronômetro".
    -   **Feed de Atividades:**
        -   Uma lista cronológica de todas as mudanças registradas na tabela `TaskActivityLog` (ex: "Bruno alterou o status para 'Em Progresso' - há 2 horas").

### Visualização de Lista de Tarefas
-   **Layout:** Uma tabela densa em informações, mas de fácil leitura.
-   **Controles Superiores:**
    -   Barra de busca por título/descrição.
    -   Botões de filtro para `Responsável`, `Status`, `Prioridade`, `Cliente`.
    -   Botão "Ordenar por" com opções.
-   **Colunas da Tabela:**
    -   Checkbox para seleção em massa.
    -   `Título da Tarefa` (com um indicador de subtarefas, se houver).
    -   `Cliente/Negócio Vinculado`.
    -   `Responsável` (com avatar).
    -   `Prazo` (com destaque visual para tarefas atrasadas).
    -   `Prioridade` (com um ícone de cor).
    -   `Status`.

---

## 5. Arquitetura da API e Comunicação em Tempo Real

### API RESTful

-   **Estrutura:** A API seguirá os princípios RESTful, sendo stateless e utilizando os verbos HTTP padrão. Os recursos principais serão: `tasks`, `comments`, `timelogs`, `task-templates`.

-   **Endpoints (Exemplos para `Tasks`):**
    -   `POST /api/tasks`: Cria uma nova tarefa.
    -   `GET /api/tasks`: Lista tarefas, com suporte a filtros via query parameters (ex: `?assignee_id=...&status=...&sort_by=due_date`).
    -   `GET /api/tasks/{taskId}`: Obtém os detalhes completos de uma tarefa.
    -   `PUT /api/tasks/{taskId}`: Atualiza uma tarefa existente.
    -   `DELETE /api/tasks/{taskId}`: Deleta uma tarefa.
    -   `POST /api/tasks/{taskId}/subtasks`: Cria uma subtarefa para uma tarefa existente.

-   **Estrutura de Dados (Payloads):**
    -   **Requisição `POST /api/tasks`:** Um objeto JSON contendo `title`, `description`, `assigned_to_user_id`, `due_date`, `parent_entity_id`, `parent_entity_type`, etc.
    -   **Resposta `GET /api/tasks/{taskId}`:** Um objeto JSON rico, contendo todos os campos da tarefa e objetos aninhados para dados relacionados, para evitar requisições adicionais (N+1).
        ```
        // Exemplo conceitual da estrutura de resposta
        Task {
          id,
          title,
          description,
          status,
          ...
          assignee: { id, name, avatar_url },
          creator: { id, name, avatar_url },
          parent_entity: { id, name, type },
          subtasks: [ { id, title, status, assignee: { ... } } ],
          comments: [ { id, content, author: { ... }, created_at } ],
          time_logs: [ { id, user: { ... }, duration_minutes } ],
          activity_log: [ { ... } ]
        }
        ```

### Notificações em Tempo Real (WebSockets)

-   **Arquitetura:** Será utilizado um servidor de WebSockets com um padrão **Publish/Subscribe (Pub/Sub)**. O backend publicará eventos em canais (tópicos) específicos, e os clientes (frontend) se inscreverão nos canais que lhes interessam.

-   **Princípio de Funcionamento:**
    1.  Ao carregar a aplicação, o frontend estabelece uma conexão WebSocket com o servidor.
    2.  O cliente se inscreve em canais relevantes (ex: um canal para suas notificações pessoais e um canal para a tarefa que está visualizando).
    3.  Quando uma ação no backend dispara um evento (ex: um novo comentário), o backend publica uma mensagem no canal apropriado.
    4.  O servidor de WebSockets envia essa mensagem a todos os clientes inscritos naquele canal.
    5.  O frontend recebe a mensagem e atualiza a UI em tempo real.

-   **Canais Propostos:**
    -   `user-notifications:{userId}`: Canal privado para notificações direcionadas a um usuário específico (ex: @menções, novas atribuições).
    -   `task-updates:{taskId}`: Canal público para atualizações em uma tarefa específica. Qualquer um que esteja visualizando a tarefa se inscreve neste canal para ver mudanças de status, novos comentários, etc., ao vivo.

-   **Exemplo de Fluxo (@menção):**
    1.  **Usuário A** escreve um comentário em uma tarefa e menciona o **Usuário B**.
    2.  O frontend envia uma requisição `POST /api/tasks/{taskId}/comments` com o conteúdo do comentário.
    3.  O backend salva o comentário no banco de dados.
    4.  O backend processa o conteúdo, detecta a menção ao Usuário B e cria uma notificação.
    5.  O backend publica duas mensagens:
        -   No canal `task-updates:{taskId}`: uma mensagem com o novo comentário, para que todos que veem a tarefa recebam a atualização.
        -   No canal `user-notifications:{userId_B}`: uma mensagem de notificação específica para o Usuário B ("Você foi mencionado por Usuário A na tarefa X").
    6.  O cliente do **Usuário A** (e de outros na mesma tarefa) recebe a mensagem do canal da tarefa e exibe o novo comentário.
    7.  O cliente do **Usuário B** recebe a mensagem de seu canal de notificação e exibe um alerta de notificação.
