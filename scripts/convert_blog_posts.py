import os
import re
import glob
import json
import argparse

def extract_metadata(html_content, filename):
    metadata = {
        'title': 'Insight de Mercado',
        'date': '2025-01-01',
        'tags': ['Conteúdo'],
        'datetime': '2025-01-01'
    }

    # Try to extract from comments
    title_match = re.search(r'Title:\s*(.*)', html_content, re.IGNORECASE)
    if title_match:
        metadata['title'] = title_match.group(1).strip()
    else:
        # Try to find <h1>
        h1_match = re.search(r'<h1>(.*?)</h1>', html_content, re.IGNORECASE | re.DOTALL)
        if h1_match:
            metadata['title'] = re.sub('<[^<]+?>', '', h1_match.group(1)).strip()
        else:
            # Fallback to filename
            metadata['title'] = filename.replace('.html', '').replace('-', ' ').replace('_', ' ').title()

    date_match = re.search(r'Date:\s*(.*)', html_content, re.IGNORECASE)
    if date_match:
        date_str = date_match.group(1).strip()
        metadata['datetime'] = date_str
        # Try to format date for display (assuming YYYY-MM-DD or DD/MM/YYYY)
        if '-' in date_str:
            parts = date_str.split('-')
            if len(parts) == 3:
                # Handle YYYY-MM-DD to DD/MM/YYYY
                if len(parts[0]) == 4:
                    metadata['date'] = f"{parts[2]}/{parts[1]}/{parts[0]}"
                else:
                    metadata['date'] = date_str
        else:
            metadata['date'] = date_str

    tags_match = re.search(r'Tags:\s*(.*)', html_content, re.IGNORECASE)
    if tags_match:
        tags_str = tags_match.group(1).strip()
        metadata['tags'] = [t.strip() for t in tags_str.split(',')]

    return metadata

def extract_content(html_content, title):
    # Extract scripts and styles from head or outside body to preserve them
    extra_assets = re.findall(r'<(?:script|style).*?>.*?</(?:script|style)>', html_content, re.IGNORECASE | re.DOTALL)

    # Take body if exists, otherwise take all
    body_match = re.search(r'<body.*?>(.*?)</body>', html_content, re.IGNORECASE | re.DOTALL)
    if body_match:
        content = body_match.group(1)
        # Prepend scripts/styles that were outside body
        assets_to_add = []
        for asset in extra_assets:
            if asset not in content:
                assets_to_add.append(asset)
        if assets_to_add:
            content = "\n".join(assets_to_add) + "\n" + content
    else:
        # Remove metadata comments
        content = re.sub(r'<!--.*?-->', '', html_content, flags=re.DOTALL)

    # Cleanup redundant elements
    # Remove internal header if it exists
    content = re.sub(r'<header.*?>.*?</header>', '', content, flags=re.IGNORECASE | re.DOTALL)
    # Remove internal footer if it exists
    content = re.sub(r'<footer.*?>.*?</footer>', '', content, flags=re.IGNORECASE | re.DOTALL)
    # Remove meta paragraphs
    content = re.sub(r'<p class="meta">.*?</p>', '', content, flags=re.IGNORECASE | re.DOTALL)

    # Remove h1 if it's the title to avoid duplication
    escaped_title = re.escape(title).replace(r'\ ', r'\s+')
    content = re.sub(rf'<h1.*?>\s*{escaped_title}\s*</h1>', '', content, flags=re.IGNORECASE | re.DOTALL)
    # Clean up any remaining first <h1> tag as it's likely the title
    content = re.sub(r'<h1>.*?</h1>', '', content, count=1, flags=re.IGNORECASE | re.DOTALL)

    return content.strip()

def update_posts_json(posts_json_path, new_post):
    if not os.path.exists(posts_json_path):
        posts = []
    else:
        with open(posts_json_path, 'r', encoding='utf-8') as f:
            posts = json.load(f)

    # Check if already exists (by path or id) to avoid duplicates
    found = False
    for i, post in enumerate(posts):
        if post.get('path') == new_post['path'] or post.get('id') == new_post['id']:
            posts[i] = new_post
            found = True
            break

    if not found:
        # Add to top
        posts.insert(0, new_post)

    with open(posts_json_path, 'w', encoding='utf-8') as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

def convert_posts(source_dir, output_dir, update_json=False):
    template_path = 'docs/blog/posts/template-post.html'
    posts_json_path = 'docs/blog/posts.json'

    if not os.path.exists(template_path):
        print(f"Template not found at {template_path}")
        return

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for filepath in glob.glob(os.path.join(source_dir, '*.html')):
        filename = os.path.basename(filepath)
        if filename == 'template-post.html':
            continue

        print(f"Processing {filename}...")

        with open(filepath, 'r', encoding='utf-8') as f:
            source_html = f.read()

        metadata = extract_metadata(source_html, filename)
        content = extract_content(source_html, metadata['title'])

        # Prepare tags HTML
        tags_html = "".join([f'<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs font-medium mr-2">#{tag}</span>' for tag in metadata['tags']])

        # Apply template
        new_html = template
        new_html = re.sub(r'<title>.*?</title>', f"<title>MinerAtivos | {metadata['title']}</title>", new_html)
        new_html = re.sub(r'<time datetime=".*?">.*?</time>', f'<time datetime="{metadata["datetime"]}">{metadata["date"]}</time>', new_html)

        tags_placeholder_pattern = r'<div class="flex">\s*<span[^>]*>#Template</span>\s*</div>'
        new_html = re.sub(tags_placeholder_pattern, f'<div class="flex">{tags_html}</div>', new_html)

        new_html = re.sub(r'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">.*?</h1>',
                          f'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">{metadata["title"]}</h1>', new_html)

        new_html = new_html.replace('alt="Template Post"', f'alt="{metadata["title"]}"')

        content_placeholder = r'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">\s*Template content\s*</div>'
        new_html = re.sub(content_placeholder, f'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">\n            {content}\n        </div>', new_html)

        # Save result
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_html)

        print(f"Saved to {output_path}")

        if update_json:
            # Clean description: remove HTML tags, scripts, and styles
            desc_content = re.sub(r'<(?:script|style).*?>.*?</(?:script|style)>', '', content, flags=re.IGNORECASE | re.DOTALL)
            clean_text = re.sub('<[^<]+?>', '', desc_content)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            description = (clean_text[:150] + '...') if len(clean_text) > 150 else clean_text

            post_id = os.path.splitext(filename)[0]
            new_post_entry = {
                "id": post_id,
                "title": metadata['title'],
                "description": description,
                "imageUrl": "../assets/logo4.png",
                "path": f"posts/{filename}",
                "date": metadata['datetime'],
                "tags": metadata['tags']
            }
            update_posts_json(posts_json_path, new_post_entry)
            print(f"Updated posts.json for {filename}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Converte posts HTML para o padrão MinerAtivos.')
    parser.add_argument('--src', default='blog_posts_source', help='Diretório de origem')
    parser.add_argument('--dest', default='docs/blog/posts', help='Diretório de destino')
    parser.add_argument('--update-json', action='store_true', help='Atualizar posts.json')

    args = parser.parse_args()
    convert_posts(args.src, args.dest, args.update_json)
