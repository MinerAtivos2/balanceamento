from PIL import Image
import os

images = ['docs/assets/logo.png', 'docs/favicon.png']
for img_path in images:
    if os.path.exists(img_path):
        with Image.open(img_path) as img:
            print(f"{img_path}: {img.size} {img.format}")
    else:
        print(f"{img_path} does not exist")
