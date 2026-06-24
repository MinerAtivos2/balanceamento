import os
import re
import glob
import json
import argparse
import unicodedata
from bs4 import BeautifulSoup

def slugify(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value).strip().lower()
    return re.sub(r'[-\s]+', '-', value)

def extract_first_image(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    img = soup.find('img')
    if img and img.get('src'):
        return img.get('src')
    return None

def extract_metadata(soup, filename):
    metadata = {
        'title': 'Insight de Mercado',
        'date': '2025-01-01',
        'tags': ['Conteúdo'],
        'datetime': '2025-01-01',
        'image': None
    }

    # Search for metadata in comments
    comments = soup.find_all(string=lambda text: isinstance(text, str) and ('Title:' in text or 'Date:' in text or 'Tags:' in text or 'Image:' in text))
    for comment in comments:
        title_match = re.search(r'Title:\s*(.*)', comment, re.IGNORECASE)
        if title_match:
            metadata['title'] = title_match.group(1).strip()

        image_match = re.search(r'Image:\s*(.*)', comment, re.IGNORECASE)
        if image_match:
            metadata['image'] = image_match.group(1).strip()

        date_match = re.search(r'Date:\s*(.*)', comment, re.IGNORECASE)
        if date_match:
            date_str = date_match.group(1).strip()
            metadata['datetime'] = date_str
            if '-' in date_str:
                parts = date_str.split('-')
                if len(parts) == 3:
                    if len(parts[0]) == 4:
                        metadata['date'] = f"{parts[2]}/{parts[1]}/{parts[0]}"
                    else:
                        metadata['date'] = date_str
            else:
                metadata['date'] = date_str

        tags_match = re.search(r'Tags:\s*(.*)', comment, re.IGNORECASE)
        if tags_match:
            tags_str = tags_match.group(1).strip()
            metadata['tags'] = [t.strip() for t in tags_str.split(',')]

    # Fallback for title
    if metadata['title'] == 'Insight de Mercado':
        h1 = soup.find('h1')
        if h1:
            metadata['title'] = h1.get_text().strip()
        else:
            metadata['title'] = filename.replace('.html', '').replace('-', ' ').replace('_', ' ').title()

    return metadata

def clean_styles(style_content):
    # Remove body and html selectors to prevent layout breakage
    cleaned = re.sub(r'(body|html)\s*\{[^}]*\}', '', style_content, flags=re.IGNORECASE | re.DOTALL)
    # Remove references to .container if it might conflict
    cleaned = re.sub(r'\.container\s*\{[^}]*\}', '', cleaned, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()

def extract_content(soup, title):
    # Extract scripts and styles
    scripts = [str(s) for s in soup.find_all('script') if 'tailwindcss' not in s.get('src', '') and 'font-awesome' not in s.get('src', '')]
    styles = []
    for s in soup.find_all('style'):
        if s.string:
            s.string = clean_styles(s.string)
        styles.append(str(s))

    links = [str(l) for l in soup.find_all('link') if 'stylesheet' in l.get('rel', [])]

    # Remove script, style and link tags from their original positions
    for tag in soup(['script', 'style', 'link']):
        tag.decompose()

    # Identify the main content
    body = soup.find('body')

    # Remove unwanted elements from the content
    content_root = body if body else soup
    for tag_name in ['header', 'footer', 'nav']:
        for item in content_root.find_all(tag_name):
            item.decompose()

    # Remove existing title H1 to avoid duplication
    for h1 in content_root.find_all('h1'):
        if h1.get_text().strip().lower() == title.lower() or "radar" in h1.get_text().strip().lower():
            h1.decompose()

    for p in content_root.find_all('p', class_='meta'):
        p.decompose()

    # Combine styles, scripts and main body content
    result_html = ""
    unique_assets = set()

    for s_str in styles:
        if s_str not in unique_assets:
            result_html += s_str + "\n"
            unique_assets.add(s_str)

    for s_str in scripts:
        if s_str not in unique_assets:
            result_html += s_str + "\n"
            unique_assets.add(s_str)

    for l_str in links:
        if l_str not in unique_assets:
            result_html += l_str + "\n"
            unique_assets.add(l_str)

    # Get inner content
    if body:
        for child in body.contents:
            child_str = str(child)
            # Remove any nested <html> or <body> tags
            child_str = re.sub(r'</?(html|body|head).*?>', '', child_str, flags=re.IGNORECASE)
            result_html += child_str
    else:
        # If no body, clean up other technical tags and get what's left
        for tag_name in ['head', 'meta', 'title']:
            for item in soup.find_all(tag_name):
                item.decompose()
        result_html += str(soup)

    return result_html

def update_posts_json(posts_json_path, new_post):
    if not os.path.exists(posts_json_path):
        posts = []
    else:
        with open(posts_json_path, 'r', encoding='utf-8') as f:
            posts = json.load(f)

    # Clean duplicates
    posts = [p for p in posts if p.get('id') != new_post['id'] and p.get('path') != new_post['path']]

    # Add to top
    posts.insert(0, new_post)

    # Sort by date descending
    posts.sort(key=lambda x: x.get('date', '0000-00-00'), reverse=True)

    with open(posts_json_path, 'w', encoding='utf-8') as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

def convert_posts(source_dir, output_dir, update_json=False):
    template_path = 'docs/blog/posts/template-post.html'
    posts_json_path = 'docs/blog/posts.json'

    if not os.path.exists(template_path):
        print(f"Template not found at {template_path}")
        return

    with open(template_path, 'r', encoding='utf-8') as f:
        template_content = f.read()

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for filepath in glob.glob(os.path.join(source_dir, '*.html')):
        filename = os.path.basename(filepath)
        if filename == 'template-post.html':
            continue

        print(f"Processing {filename}...")

        with open(filepath, 'r', encoding='utf-8') as f:
            source_html = f.read()

        soup = BeautifulSoup(source_html, 'html.parser')
        metadata = extract_metadata(soup, filename)
        content = extract_content(soup, metadata['title'])

        # Prepare tags HTML
        tags_html = "".join([f'<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-full text-xs font-medium mr-2">#{tag}</span>' for tag in metadata['tags']])

        # Apply template
        new_html = template_content
        # Use lambda for re.sub to avoid backslash escaping issues in metadata
        new_html = re.sub(r'<title>.*?</title>',
                          lambda m: f"<title>MinerAtivos | {metadata['title']}</title>", new_html)

        # Replace date
        new_html = re.sub(r'<time datetime="[^"]*">[^<]*</time>',
                          lambda m: f'<time datetime="{metadata["datetime"]}">{metadata["date"]}</time>', new_html)

        # Replace tags
        tags_placeholder_pattern = r'<div class="flex">\s*<span[^>]*>#Template</span>\s*</div>'
        new_html = re.sub(tags_placeholder_pattern,
                          lambda m: f'<div class="flex">{tags_html}</div>', new_html)

        # Replace Title
        new_html = re.sub(r'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">.*?</h1>',
                          lambda m: f'<h1 class="text-4xl md:text-5xl font-bold text-dark mb-6">{metadata["title"]}</h1>', new_html)

        new_html = new_html.replace('alt="Template Post"', f'alt="{metadata["title"]}"')

        # Inject Content
        content_placeholder = r'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">.*?</div>'
        def replace_content(match):
            return f'<div class="prose prose-lg max-w-none text-gray-700 leading-relaxed">\n            {content}\n        </div>'

        new_html = re.sub(content_placeholder, replace_content, new_html, flags=re.DOTALL)

        # Save result
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(new_html)

        print(f"Saved to {output_path}")

        if update_json:
            temp_soup = BeautifulSoup(content, 'html.parser')
            for s in temp_soup(['script', 'style']):
                s.decompose()
            clean_text = temp_soup.get_text()
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()
            description = (clean_text[:150] + '...') if len(clean_text) > 150 else clean_text

            # Image logic
            DEFAULT_IMAGE = "assets/logo4.png"
            cover_image = metadata.get('image')

            if not cover_image:
                cover_image = extract_first_image(content)
                if cover_image:
                    # Remove relative path prefixes for JSON index consistency
                    cover_image = cover_image.replace('../../', '')
                    # If it was just a local path like 'image.png', prepend assets path if appropriate
                    # but usually it's better to keep it relative to the blog root

            if not cover_image:
                slug = slugify(metadata['title'])
                potential_img = f"assets/blog/{slug}.png"
                if os.path.exists(os.path.join('docs', potential_img)):
                    cover_image = potential_img
                else:
                    cover_image = DEFAULT_IMAGE

            # Ensure cover_image has proper relative path for the blog index (which is in docs/blog/)
            # The logic below matches the requirement: if it's from assets/, prepend ../ for the index.
            if cover_image and not cover_image.startswith('http') and not cover_image.startswith('..'):
                cover_image = f"../{cover_image}"

            post_id = os.path.splitext(filename)[0]
            new_post_entry = {
                "id": post_id,
                "title": metadata['title'],
                "description": description,
                "imageUrl": cover_image,
                "path": f"posts/{filename}",
                "date": metadata['datetime'],
                "tags": metadata['tags']
            }
            update_posts_json(posts_json_path, new_post_entry)
            print(f"Updated posts.json for {filename} with image: {cover_image}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Converte posts HTML para o padrão MinerAtivos.')
    parser.add_argument('--src', default='blog_posts_source', help='Diretório de origem')
    parser.add_argument('--dest', default='docs/blog/temp', help='Diretório de destino')
    parser.add_argument('--update-json', action='store_true', help='Atualizar posts.json')

    args = parser.parse_args()
    convert_posts(args.src, args.dest, args.update_json)
