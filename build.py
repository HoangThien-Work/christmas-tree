import os
import shutil
import json
import getpass
from jinja2 import Environment, FileSystemLoader


ROOT = os.path.abspath(os.path.dirname(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')


def find_images(img_dir_name='img'):
    # Check project-local img folder first
    img_dir = os.path.join(ROOT, img_dir_name)
    if not os.path.isdir(img_dir):
        # Fallback to parent folder (workspace root) e.g. ../img
        parent_dir = os.path.abspath(os.path.join(ROOT, '..'))
        img_dir_parent = os.path.join(parent_dir, img_dir_name)
        if os.path.isdir(img_dir_parent):
            img_dir = img_dir_parent
        else:
            return []
    files = [f for f in os.listdir(img_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif'))]
    files.sort()
    # When returning, use relative path from DIST root: if images are in parent folder, we will copy them into dist/img
    return [os.path.join('img', f) for f in files]


def copy_tree(src, dst):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def build():
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST, exist_ok=True)

    # Prepare assets
    photos = find_images('img')
    # audio may be in several places: project root, mp3/ folder, or parent workspace
    music_src = None
    candidates = [os.path.join(ROOT, 'audio.mp3'), os.path.join(ROOT, 'mp3', 'audio.mp3')]
    # also check any mp3 files in mp3/ folder
    mp3_dir = os.path.join(ROOT, 'mp3')
    if os.path.isdir(mp3_dir):
        for f in os.listdir(mp3_dir):
            if f.lower().endswith('.mp3'):
                candidates.append(os.path.join(mp3_dir, f))
    # check parent root too
    candidates.append(os.path.abspath(os.path.join(ROOT, '..', 'audio.mp3')))
    for c in candidates:
        if os.path.isfile(c):
            music_src = c
            break
    music_dest = os.path.join(DIST, 'audio.mp3')
    has_music = False
    if os.path.isfile(music_src):
        shutil.copy2(music_src, music_dest)
        has_music = True

    # Copy img folder
    # Copy img folder: prefer local project img/, fallback to parent img/
    img_src = os.path.join(ROOT, 'img')
    if not os.path.isdir(img_src):
        img_src = os.path.abspath(os.path.join(ROOT, '..', 'img'))
    if os.path.isdir(img_src):
        shutil.copytree(img_src, os.path.join(DIST, 'img'))

    # Copy any mp3 found into dist as audio.mp3
    has_music = False
    if music_src:
        shutil.copy2(music_src, os.path.join(DIST, 'audio.mp3'))
        has_music = True

    # Copy JS/CSS from src to dist
    src_js = os.path.join(SRC, 'js')
    if os.path.isdir(src_js):
        shutil.copytree(src_js, os.path.join(DIST, 'js'))

    # Render template
    # Read .env if present for AUTHOR
    envfile = os.path.join(ROOT, '.env')
    if os.path.isfile(envfile):
        try:
            with open(envfile, 'r', encoding='utf-8') as ef:
                for ln in ef:
                    ln = ln.strip()
                    if not ln or ln.startswith('#') or '=' not in ln:
                        continue
                    k, v = ln.split('=', 1)
                    k = k.strip(); v = v.strip()
                    if k == 'AUTHOR':
                        os.environ['AUTHOR'] = v
        except Exception:
            pass

    env = Environment(loader=FileSystemLoader(SRC))
    template = env.get_template('index.html.jinja')
    # Determine author name: prefer AUTHOR env var, fallback to system username
    author = os.environ.get('AUTHOR') or getpass.getuser()
    context = {
        'music': 'audio.mp3' if has_music else '',
        'photos_json': json.dumps(photos),
        'author': author
    }
    out = template.render(**context)
    with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)

    print('\nBuild complete.')
    print(f' - index.html -> {os.path.join(DIST, "index.html")}')
    print(f' - copied images: {len(photos)}')
    print(' - audio included' if has_music else ' - audio NOT found (put audio.mp3 in project root to include)')


if __name__ == '__main__':
    build()
