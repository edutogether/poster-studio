"""촬영 화면 예시 영상(개인·단체) 뒤처리 — «찰칵» 셔터 소리와 하얀 플래시, 마지막 멈춘 장면(2026-10-13 Bumm님, 팀장 전달).

왜: 셔터 소리·플래시는 AI 영상 모델에 맡기면 시점이 흔들리고 화면이 깨지기 쉽다. 그래서 생성 뒤에 정해진 시각에 넣는다.
앱에는 셔터·플래시가 없어(2026-10-13 확인) 영상 쪽에 넣어도 겹치지 않는다. 3·2·1 숫자는 앱이 띄우므로 여기서 그리지 않는다.

- 셔터 소리: 내려받은 효과음 없이 직접 합성한다(짧은 기계음 두 번 — 셔터가 열리고 닫히는 «찰»·«칵»). 원본 생활 소리 위에 섞는다.
- 플래시: SHOT초에 흰색으로 확 밝아졌다가 FLASH초에 걸쳐 원래 화면으로 돌아온다.
- 멈춘 장면: FREEZE초부터 끝까지 그 시각의 프레임을 그대로 보여 준다(사진이 찍힌 순간).

사용: python scripts/media/camera-shot-post.py <원본.mp4> <출력.mp4> [--shot 7.45] [--flash 0.15] [--freeze 7.6]
종료: 0 · 2 입력 오류
"""
import os, subprocess, sys, tempfile
import numpy as np
import wave


def shutter(sr=48000):
    """«찰칵» — 4ms 클릭 + 짧게 감쇠하는 잡음 두 번(앞 것이 조금 크고 높게)."""
    rng = np.random.default_rng(7)
    def hit(dur, decay, gain, tone):
        n = int(sr * dur); t = np.arange(n) / sr
        noise = rng.standard_normal(n)
        noise = np.convolve(noise, np.ones(3) / 3, mode='same')          # 아주 높은 잡음만 살짝 깎는다
        body = np.sin(2 * np.pi * tone * t) * 0.35
        return (noise + body) * np.exp(-t / decay) * gain
    a = hit(0.045, 0.008, 0.55, 2400)
    gap = np.zeros(int(sr * 0.055))
    b = hit(0.06, 0.012, 0.45, 1600)
    return np.concatenate([a, gap, b]).astype(np.float32)


def main(argv):
    args = [a for a in argv]
    opt = {'--shot': 7.45, '--flash': 0.15, '--freeze': 7.6}
    for k in list(opt):
        if k in args:
            i = args.index(k); opt[k] = float(args[i + 1]); del args[i:i + 2]
    if len(args) != 2: print(__doc__); return 2
    src, out = args
    if not os.path.exists(src): print('없는 영상'); return 2
    shot, flash, freeze = opt['--shot'], opt['--flash'], opt['--freeze']
    with tempfile.TemporaryDirectory() as tmp:
        # 원본 소리(없으면 무음)를 48k 모노로 꺼내 셔터를 섞는다
        raw = os.path.join(tmp, 'a.wav')
        r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', raw])
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
                                   capture_output=True, text=True).stdout.strip())
        if r.returncode == 0 and os.path.exists(raw):
            with wave.open(raw) as w: base = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        else:
            base = np.zeros(int(48000 * dur), np.float32)
        s = shutter(); i0 = int(48000 * shot)
        mix = base.copy()
        if len(mix) < i0 + len(s): mix = np.pad(mix, (0, i0 + len(s) - len(mix)))
        mix[i0:i0 + len(s)] += s
        mix = np.clip(mix, -1, 1)
        mixed = os.path.join(tmp, 'm.wav')
        with wave.open(mixed, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes((mix * 32767).astype(np.int16).tobytes())
        # 화면: SHOT부터 FLASH 동안 흰색이 1 → 0으로 빠지고, FREEZE부터는 그 프레임에 멈춘다
        w = f"if(between(T,{shot},{shot + flash}),max(0,1-(T-{shot})/{flash - 1 / 24:.4f}),0)"   # 흰색 섞는 비율 1 → 0, 멈출 프레임 전에 0이 되게(멈춘 장면에 흰 기운이 남지 않게)
        vf = (f"format=yuv420p,"
              f"geq=lum='lum(X,Y)+(255-lum(X,Y))*{w}':cb='cb(X,Y)+(128-cb(X,Y))*{w}':cr='cr(X,Y)+(128-cr(X,Y))*{w}',"
              f"trim=end={freeze},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={max(dur - freeze, 0):.3f}")
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-i', mixed, '-map', '0:v', '-map', '1:a', '-vf', vf,
                        '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest',
                        '-movflags', '+faststart', out], check=True)
    print('저장', out, f'셔터 {shot}초 · 플래시 {flash}초 · 멈춤 {freeze}초부터')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
