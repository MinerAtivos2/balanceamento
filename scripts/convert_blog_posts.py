import os
import re
import glob

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
                metadata['date'] = f"{parts[2]}/{parts[1]}/{parts[0]}"
        else:
            metadata['date'] = date_str

    tags_match = re.search(r'Tags:\s*(.*)', html_content, re.IGNORECASE)
    if tags_match:
        tags_str = tags_match.group(1).strip()
        metadata['tags'] = [t.strip() for t in tags_str.split(',')]

    return metadata

def extract_content(html_content, title):
    # Extract scripts from head or outside body to preserve them
    extra_scripts = re.findall(r'<script.*?>.*?</script>', html_content, re.IGNORECASE | re.DOTALL)

    # Take body if exists, otherwise take all
    body_match = re.search(r'<body.*?>(.*?)</body>', html_content, re.IGNORECASE | re.DOTALL)
    if body_match:
        content = body_match.group(1)
        # Prepend scripts that were outside body
        scripts_to_add = []
        for script in extra_scripts:
            if script not in content:
                scripts_to_add.append(script)
        if scripts_to_add:
            content = "\n".join(scripts_to_add) + "\n" + content
    else:
        # Remove metadata comments
        content = re.sub(r'<!--.*?-->', '', html_content, flags=re.DOTALL)

    # If there is a <div class="content"> or <div class="container">, try to take its inner content
    # to avoid double containers
    inner_content_match = re.search(r'<div\s+class=["\'](?:content|container)["\'].*?>(.*)</div>', content, re.IGNORECASE | re.DOTALL)
    if inner_content_match:
        # We need to be careful with greedy matching here, but usually these are the main wrappers
        # A better way would be finding the first <div> and last </div>, but let's try this
        # Actually, let's just remove the outermost div if it wraps everything
        content = content.strip()
        if content.startswith('<div') and content.endswith('</div>'):
            # Only remove if it seems to be a wrapper
            content = re.sub(r'^<div.*?>', '', content, count=1, flags=re.IGNORECASE)
            content = re.sub(r'</div>$', '', content, count=1, flags=re.IGNORECASE)

    # Remove internal header if it exists
    content = re.sub(r'<header.*?>.*?</header>', '', content, flags=re.IGNORECASE | re.DOTALL)

    # Remove internal footer if it exists
    content = re.sub(r'<footer.*?>.*?</footer>', '', content, flags=re.IGNORECASE | re.DOTALL)

    # Remove meta paragraphs (like "Por Minerativos | Maio de 2026")
    content = re.sub(r'<p class="meta">.*?</p>', '', content, flags=re.IGNORECASE | re.DOTALL)

    # Remove h1 if it's the title to avoid duplication
    # Use a more flexible regex for title matching
    escaped_title = re.escape(title).replace(r'\ ', r'\s+')
    content = re.sub(rf'<h1.*?>\s*{escaped_title}\s*</h1>', '', content, flags=re.IGNORECASE | re.DOTALL)

    # Clean up any remaining first <h1> tag as it's likely the title
    content = re.sub(r'<h1>.*?</h1>', '', content, count=1, flags=re.IGNORECASE | re.DOTALL)

    # Remove redundant Chart.js if it's already included (but keep it if needed)
    # The user said to preserve it, so I'll keep it.

    content = content.strip()

    return content

def convert_posts():
    source_dir = 'blog_posts_source'
    output_dir = 'docs/blog/temp'
    template_path = 'docs/blog/posts/template-post.html'

    if not os.path.exists(template_path):
        print(f"Template not found at {template_path}")
        return

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for filepath in glob.glob(os.path.join(source_dir, '*.html')):
        filename = os.path.basename(filepath)
        print(f"Processing {filename}...")

        with open(filepath, 'r', encoding='utf-8') as f:
            source_html = f.read()

        metadata = extract_metadata(source_html, filename)
        content = extract_content(source_html, metadata['title'])

        # Prepare tags HTML
        tags_html = "".join([f'<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs font-medium mr-2">#{tag}</span>' for tag in metadata['tags']])

        # Start with template
        new_html = template

        # Replace Title in head
        new_html = re.sub(r'<title>.*?</title>', f"<title>MinerAtivos | {metadata['title']}</title>", new_html)

        # Replace Date
        new_html = re.sub(r'<time datetime=".*?">.*?</time>', f'<time datetime="{metadata["datetime"]}">{metadata["date"]}</time>', new_html)

        # Replace Tags
        # Search for the tags container with a more flexible regex
        tags_placeholder_pattern = r'<div class="flex">\s*<span[^>]*>#Template</span>\s*</div>'
        new_html = re.sub(tags_placeholder_pattern, f'<div class="flex">{tags_html}</div>', new_html)

        # Replace Title in body
        new_html = re.sub(r'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">.*?</h1>',
                          f'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">{metadata["title"]}</h1>', new_html)

        # Replace Cover alt
        new_html = new_html.replace('alt="Template Post"', f'alt="{metadata["title"]}"')

        # Replace Content
        # We look for <div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">Template content</div>
        content_pattern = r'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">\s*Template content\s*</div>'
        new_html = re.sub(content_pattern, f'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">\n            {content}\n        </div>', new_html)

        # Save the result
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_html)

        print(f"Saved to {output_path}")

if __name__ == "__main__":
    convert_posts()
