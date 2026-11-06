#!/usr/bin/env python3
"""Build the Yuvalim Dec 3 reel (1080x1920, 30fps).

Put photos/videos in ./media named slot1..slot6 (.jpg/.jpeg/.png/.mp4/.mov),
then run:  python3 reels/2026-12-03-yuvalim/build.py
Slots without media get a designed placeholder.
"""
import json, subprocess, sys, tempfile, shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
W, H, FPS = 1080, 1920, 30
BAND_Y, BAND_H = 555, 810
FADE = 0.35
IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
VID_EXT = {'.mp4', '.mov', '.m4v'}


def find_media(slot):
    for p in sorted((HERE / 'media').glob(f'slot{slot}.*')):
        if p.suffix.lower() in IMG_EXT | VID_EXT:
            return p
    return None


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])


def main():
    cfg = json.loads((HERE / 'slides.json').read_text(encoding='utf-8'))
    slides = cfg['slides']
    media = {s['slot']: find_media(s['slot']) for s in slides if 'slot' in s}
    tmp = Path(tempfile.mkdtemp())
    have = ','.join(str(k) for k, v in media.items() if v)
    run(['node', str(HERE / 'render.js'), str(HERE / 'slides.json'), str(tmp), have])

    segs = []
    for i, s in enumerate(slides, 1):
        d = s['dur']
        png = tmp / f'slide{i}.png'
        seg = tmp / f'seg{i}.mp4'
        fades = f'fade=t=in:st=0:d={FADE},fade=t=out:st={d - FADE}:d={FADE}'
        m = media.get(s.get('slot'))
        if not m:
            run(['ffmpeg', '-y', '-loop', '1', '-t', str(d), '-i', str(png),
                 '-vf', f'scale={W}:{H},format=yuv420p,{fades}', '-r', str(FPS),
                 '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', str(seg)])
        else:
            is_img = m.suffix.lower() in IMG_EXT
            src = ['-loop', '1', '-t', str(d), '-i', str(m)] if is_img else ['-stream_loop', '-1', '-t', str(d), '-i', str(m)]
            frames = int(d * FPS)
            # band: slow push-in for photos, plain cover-crop for video
            if is_img:
                band = (f"[a1]scale={W*2}:{BAND_H*2}:force_original_aspect_ratio=increase,crop={W*2}:{BAND_H*2},"
                        f"zoompan=z='1+0.06*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{BAND_H}:fps={FPS}[band]")
            else:
                band = f"[a1]fps={FPS},scale={W}:{BAND_H}:force_original_aspect_ratio=increase,crop={W}:{BAND_H},setsar=1[band]"
            fc = (f"[0:v]split[a0][a1];"
                  f"[a0]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,setsar=1[bg];"
                  f"{band};"
                  f"[bg][band]overlay=0:{BAND_Y}[b1];[b1][1:v]overlay=0:0,trim=duration={d},setpts=PTS-STARTPTS,format=yuv420p,{fades}[v]")
            run(['ffmpeg', '-y', *src, '-loop', '1', '-t', str(d), '-i', str(png),
                 '-filter_complex', fc,
                 '-map', '[v]', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', str(seg)])
        segs.append(seg)

    lst = tmp / 'list.txt'
    lst.write_text(''.join(f"file '{p}'\n" for p in segs))
    out = ROOT / cfg['output']
    out.parent.mkdir(parents=True, exist_ok=True)
    total = sum(s['dur'] for s in slides)
    run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst),
         '-f', 'lavfi', '-t', str(total), '-i', 'anullsrc=r=44100:cl=stereo',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', str(out)])
    shutil.rmtree(tmp)
    missing = [k for k, v in media.items() if not v]
    print(f'built {out.relative_to(ROOT)} ({total}s)')
    print('placeholders in slots:', missing or 'none')


if __name__ == '__main__':
    main()
