# Guia de Conversão e Publicação de Posts do Blog

Este guia explica como converter arquivos HTML externos (como exportações de ferramentas de IA ou outros editores) para o padrão visual do blog MinerAtivos e como publicá-los.

## 1. Preparação do arquivo fonte

Para que o script de conversão funcione corretamente, você deve adicionar um comentário no início do seu arquivo HTML com os metadados do post.

Exemplo (`meu-post.html`):
```html
<!--
Title: Como Investir em Dividendos
Date: 2025-06-15
Tags: Dividendos, Estratégia, B3
-->

<body>
    <h1>Como Investir em Dividendos</h1>
    <p>Conteúdo do seu post aqui...</p>
</body>
```

*   **Title**: O título que aparecerá no blog.
*   **Date**: Data de publicação (formato AAAA-MM-DD).
*   **Tags**: Categorias separadas por vírgula.

## 2. Conversão

Coloque seus arquivos HTML na pasta `blog_posts_source/` e execute o script de conversão:

### Pré-requisitos
Certifique-se de ter as dependências instaladas:
```bash
pip install -r requirements.txt
```
*(O script utiliza a biblioteca `beautifulsoup4` para processar o HTML)*

### Opção A: Conversão para visualização (Pasta Temp)
Isso criará os arquivos em `docs/blog/temp/` para você revisar.
```bash
python3 scripts/convert_blog_posts.py
```

### Opção B: Publicação Direta (Recomendado)
Isso converterá os arquivos diretamente para a pasta oficial de posts e atualizará o índice do blog automaticamente.
```bash
python3 scripts/convert_blog_posts.py --dest docs/blog/posts --update-json
```

## 3. Parâmetros do Script

*   `--src`: Diretório de origem (padrão: `blog_posts_source`)
*   `--dest`: Diretório de destino (padrão: `docs/blog/temp`)
*   `--update-json`: Se presente, adiciona o post ao arquivo `docs/blog/posts.json` para que ele apareça na página inicial do blog.

## 4. Revisão e Publicação Manual

Se você usou a **Opção A**, siga estes passos:
1. Revise o arquivo gerado em `docs/blog/temp/`.
2. Mova o arquivo para `docs/blog/posts/`.
3. Adicione uma entrada para o post em `docs/blog/posts.json` seguindo o padrão existente.

## Dicas
*   O script preserva tags `<script>` e `<style>`, então gráficos do Chart.js continuarão funcionando.
*   O script remove automaticamente cabeçalhos e rodapés redundantes que já existem no template do blog.
*   Se o post tiver uma imagem de destaque, o script usará por padrão o logo da MinerAtivos, mas você pode editar o HTML gerado para apontar para outra imagem em `imageUrl`.
