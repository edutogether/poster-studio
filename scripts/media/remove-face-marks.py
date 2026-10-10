"""Poster Studio 대기 영상 보정: 생성 영상이 그려 넣은 «원화에 없는 얼굴 요소»를 검은 얼굴판 색으로 지운다.

왜(2026-10-07): 얼굴 규칙(2026-10-06 Bumm님 확정 — 원화에 없는 눈썹·입을 만들지 않는다)을 지시문에 넣어도 Veo가 로봇이
정면을 볼 때 하얀 웃는 입을 그렸다(01번 두 번 모두). 원화의 얼굴판은 주황 눈 두 개 말고는 검다 — 그래서 새로 생긴 표시만
얼굴판 색으로 메우면 원화와 같은 얼굴이 된다. 눈·원화에 있던 요소(08번의 입)는 건드리지 않는다.

지우는 것은 원화에 입이 없는 장면에 생긴 입(하얀·빨간)뿐이다. 그래도 남은 입(흰 입 아래 혀, 혀 없는 검은 벌린 입, 덜 밝은 회색 입)은
--mouth-frames로 사람이 고른 프레임에서만, 아래 --all-mouths와 같은 방식(얼굴판 화소로 매끄럽게 메움)으로 한 번 더 지운다. 눈썹으로 분류된 빛(모양이 바뀐 눈일 수 있다)과 원화에 입이 있는 장면은
손대지 않고 보정 뒤 검사에 그대로 남겨 사람이 판단한다.
판정은 얼굴 검사(check-face-elements.py)와 같은 함수를 쓴다. 다만 검사는 «원화 눈 넓이의 15% 이상»만 탈락으로 세지만,
보정은 크기와 상관없이 새 요소를 전부 지운다(입이 나타나고 사라지는 사이의 작은 조각까지). 지운 자리는 둘레 4화소까지 넓혀
빛 번짐까지 덮고, 얼굴판 안에서만, 가장 가까운 얼굴판 화소의 색으로 채운 뒤 그 안에서만 살짝 부드럽게 한다.
눈빛이 안 보이는 프레임(눈 감음·고개 돌림)은 판정을 못 하므로, 앞뒤에서 지운 자리 안의 밝은 표시만 지운다.

--all-mouths면 원화에 입이 있는 장면에서도 입을 모두 지운다 — 08번(원화에 벌린 입)을 «입만 지워» 다른 장면과 같은 얼굴로
맞추라는 2026-10-07 Bumm님 결정 때문이다. 벌린 입은 밝은 표시(혀)만이 아니라 얼굴판보다 더 검은 입 모양이라, 위의 표시 지우기로는
혀만 빠지고 검은 입이 남았다. 게다가 08번은 헤드폰·팝 필터가 얼굴판 볼록 다각형에 섞여 흰 테두리·헤드폰까지 검게 번졌다(2026-10-07 실측).
그래서 이 모드는 따로 간다: 빨간 혀와 그에 붙은 «거의 검은» 입 모양·입술 선만 찾아(얼굴판 덩어리 안), 둘레의 얼굴판 화소만
경계로 매끄럽게 메운다(라플라스 보간 — 얼굴판의 은은한 명암이 그대로 이어진다). 눈빛·흰 테두리·팝 필터 테두리는 메우지도, 경계로 쓰지도 않는다.
이때는 보정 뒤 검사도 --all-mouths로 돌린다. 검사는 밝은 표시만 세므로 검은 입이 남았는지는 사람이 전후 그림으로 본다.

보정 뒤에는 반드시 얼굴 검사를 다시 돌려 0프레임인지 보고, 지운 프레임은 사람이 확대해 본다(--compare 전후 그림).
사용: python scripts/media/remove-face-marks.py <장면 01~12> <원본 프레임 폴더> <출력 폴더> [--compare 전후 그림 폴더] [--all-mouths | --mouth-frames 121-140,167 --line-frames 47-104]
"""
import argparse, glob, importlib.util, json, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi, sparse
from scipy.sparse.linalg import splu

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('gate', os.path.join(HERE, 'check-face-elements.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
gate.EXTRA_RATIO = 0.0     # 보정은 크기와 상관없이 지운다(검사는 원래 기준 그대로)
GROW = 4                   # 표시 둘레의 빛 번짐까지 덮는 폭(화소)
NEIGHBOR = 3               # 눈빛이 안 보이는 프레임은 앞뒤 이만큼의 프레임에서 지운 자리를 빌린다


def fill(rgb, region, hull):
    """region 화소를 얼굴판(hull) 안 가장 가까운 «안 지우는» 화소 색으로 채우고, region 안에서만 살짝 부드럽게 한다."""
    keep = hull & ~region
    if not keep.any(): return rgb
    _, (iy, ix) = ndi.distance_transform_edt(~keep, return_indices=True)
    out = rgb.astype(np.float64)
    near = out[iy, ix]
    soft = np.stack([ndi.gaussian_filter(near[..., k], 1.5) for k in range(3)], -1)
    out[region] = soft[region]
    return np.clip(out.round(), 0, 255).astype(np.uint8)


def dark_hull(crop, core):
    """눈빛 조건 없이 얼굴판의 볼록 다각형만 구한다 — 눈 감은 프레임용. 얼굴판 고르는 기준은 검사(face_marks)와 같다."""
    v = crop.max(2).astype(np.int32)
    cx0, cy0, cx1, cy1 = core; ch, cw = cy1 - cy0, cx1 - cx0
    lab, n = ndi.label(ndi.binary_closing(v < gate.DARK, iterations=3))
    if not n: return None
    idx = range(1, n + 1)
    sizes = ndi.sum(np.ones(lab.shape), lab, idx); in_core = ndi.sum(np.ones((ch, cw)), lab[cy0:cy1, cx0:cx1], idx)
    keep = np.isin(lab, 1 + np.flatnonzero((sizes >= 0.05 * ch * cw) & (in_core >= gate.CORE_SHARE * sizes)))
    return gate.hull_mask(keep) if keep.sum() >= 50 else None


TONGUE_HUE = 0.12          # (초록-파랑)/(빨강-파랑). 혀(분홍빛 빨강) 0.07 안팎, 눈빛 가장자리(주황) 0.2 넘음 — 08번 실측
MOUTH_GROW = 5             # 찾은 입 둘레를 이만큼 넓혀 메운다(흐린 입 윤곽·입술 선까지)
TONGUE_REACH = 0.45        # 입 자리 모드: 혀 조각 무게중심이 원화 입 자리에서 얼굴 상자 높이의 이 배수 안(04번 혀는 0.36~0.37배)
MOUTH_REACH = 0.35         # --mouth-frames: 원화 입 자리에서 얼굴 상자 높이의 이 배수 안만 입으로 본다
MOUTH_BLACK = 6            # --mouth-frames: 검은 벌린 입 안쪽 밝기(06번 0~6, 얼굴판 10~30)
DARK_THICK = 6             # --mouth-frames: 검은 입 두께(반지름) 하한(원화 미소선 4.5 이하, 06번 벌린 입 8~10)
DARK_RIM = 0.06            # --mouth-frames: 검은 입이 얼굴판 가장자리 4화소 띠에 걸쳐도 되는 비율(06번 112번 벌린 입 0.043 — 0.03이면 놓쳤다)
DARK_EDGE = 15             # --mouth-frames: 검은 입 둘레 띠의 평균 밝기 하한(06번 벌린 입 20~30, 04번 얼굴판 아래 그늘 10 아래)
LINE_THICK = 4             # --mouth-frames: 하얗거나 회색인 입선 두께(반지름) 상한(입선 2~3, 반사광·김은 6 넘음)
LINE_MIN = 120             # --mouth-frames·--line-frames: 입선의 가장 밝은 곳 하한 — 원화 미소선의 은은한 윤기는 85 이하(10편 원화 실측)
LINE_BRIGHT = 170          # 이보다 밝은 입선은 김·반사광 위여도 입선이다(10번 김 속 입선 180 안팎)
LINE_RING_MAX = 45         # 입선 둘레 얼굴판 평균 밝기 상한(검은 얼굴판 20~35, 김·반사광 위는 50 넘음)
LINE_GROW = 3              # --mouth-frames: 입선만 지울 때 선 둘레를 넓히는 폭
LINE_CONTRAST = 40         # --mouth-frames: 입선은 둘레 얼굴판보다 이만큼 넘게 밝은 곳이 있다
MOUTH_ABOVE = 0.2          # --mouth-frames: 하얗거나 회색인 입선은 원화 입 자리보다 얼굴 상자 높이의 이 배수 위까지만 본다
NEUTRAL = 40               # --mouth-frames: 덩어리의 (빨강-파랑) 평균이 이보다 작으면 색이 없는 입선(흰 입선 10 안팎, 눈 100 넘음)


def faint_rim(lines, v, local, zone, eyes):
    """입선 둘레의 흐린 빛과, 입선에서 이어지는 흐린 끝(둘레보다 8 넘게 밝은 화소 덩어리 중 입선에 닿고 입선에서 12화소 안).
    둘레 3화소만 넣으면 초승달 입선의 흐린 양 끝이 회색 점으로 남았다(04번 151번 실측). 6화소 넘게 따라가면 김·반사광까지 잡았다(10번)."""
    near = ndi.binary_dilation(lines, iterations=6)
    faint = zone & near & (v - local > 8) & ~ndi.binary_dilation(eyes, iterations=2)
    flab, fn = ndi.label(faint)
    if not fn: return faint
    touch = np.unique(flab[ndi.binary_dilation(lines, iterations=1) & faint]); touch = touch[touch > 0]
    return np.isin(flab, touch) | (ndi.binary_dilation(lines, iterations=3) & (v - local > 10) & ~ndi.binary_dilation(eyes, iterations=2))


def open_mouth(crop, core, mouth_at=None, lines_only=False):
    """메울 자리(입)와 경계로 쓸 얼굴판 화소. 입을 못 찾으면 (None, None).
    얼굴판 덩어리 = 얼굴 상자와 가장 많이 겹치는 어두운 덩어리(닫기 없이 — 닫으면 헤드폰과 이어진다), 눈·혀 구멍은 메운다.
    혀 = 그 안의 빨강 덩어리(색상 비율로 눈빛 가장자리의 주황과 가른다 — 감은 눈 ∪의 빛 가장자리도 붉다).
    · mouth_at 없음(--all-mouths, 08번): 입 = 혀 + 혀에 닿은 «둘레 얼굴판보다 훨씬 검은» 입 모양·입술 선. 혀가 없으면 입도 없다.
    · mouth_at = 이 프레임의 원화 입 자리(crop 좌표, --mouth-frames): 그 둘레의 혀·검은 입·하얗거나 회색인 입선을 모두 입으로 잡는다.
      혀가 없는 검은 벌린 입(06번 4.6~5.5초)과 덜 밝아 표시 지우기에서 빠진 회색 입(05번 5.9~7.0초)이 이 경우다.
    · lines_only(--line-frames): 하얗거나 회색인 입선과 빨간 혀 조각만 지우고 검은 입 모양은 남긴다 — 원화와 같은 어두운 초승달 미소선 위에
      밝은 선만 생긴 프레임용. 원화 입 두께가 장면마다 달라(03번 반지름 11, 06번 4) «벌린 입»을 두께로 자동으로 가를 수 없었다.
    입 둘레 MOUTH_GROW화소를 눈빛·회색 테두리만 빼고 메운다."""
    v = crop.max(2).astype(np.int32)
    r, g, b = (crop[..., k].astype(np.int32) for k in range(3))
    cx0, cy0, cx1, cy1 = core
    lab, n = ndi.label(v < gate.DARK)
    if not n: return None, None
    overlap = ndi.sum(np.ones((cy1 - cy0, cx1 - cx0)), lab[cy0:cy1, cx0:cx1], range(1, n + 1))
    body = lab == 1 + int(np.argmax(overlap))
    visor = ndi.binary_fill_holes(body)
    hull = gate.hull_mask(body)
    if mouth_at is not None:
        # 얼굴판 반사광(밝기 70 넘는 회색)이 얼굴판 가장자리까지 닿으면 «구멍»으로 채워지지 않아 얼굴판에서 빠진다. 그러면 입 위로
        # 내려온 반사광을 메우지도 경계로 쓰지도 못해, 입이 가리던 반사광 아래 끝이 혹처럼 남았다(06번 115~122번 실측).
        # 어두운 덩어리의 볼록 다각형을 6화소 안으로 줄인 안쪽에서 색 없는 회색(반사광)만 얼굴판으로 더한다. 다각형 안쪽을 통째로
        # 더하면 고개를 숙인 프레임에서 크림색 테두리 안쪽 그늘까지 들어가 테두리가 계단 모양으로 파였다(04번 136·172번 실측)
        visor = visor | (ndi.binary_erosion(hull, iterations=6) & ((r - b) < 20) & (v < 150))
    hue = (g - b) / np.maximum(r - b, 1)
    reddish = (r - np.maximum(g, b) > 40) & (r > 70)
    local = ndi.median_filter(np.where(visor, v, 0), size=31)
    # 혀 = 넓이의 절반 이상이 얼굴판 볼록 다각형 안에 있는 빨강 덩어리(12화소 이상) 중 가장 큰 것. 얼굴판에 «둘러싸인» 것만 보면
    # 얼굴판 아래 테두리에 붙은 혀 조각을 놓쳤다(04번 122~133번은 63~74%만 다각형 안)
    tongue = np.zeros(v.shape, bool)
    red_like = reddish & (hue < TONGUE_HUE)
    if mouth_at is not None:
        # 입 자리 모드는 아주 어두운 혀(빨강 30~70, 초록·파랑 0~15)까지 — 밝은 혀 기준만 쓰면 혀가 사라지는 순간의 어두운 빨강이
        # 얼굴판 아래에 남았다(04번 120번 실측). 얼굴판 자체의 붉은 기운은 빨강-초록·파랑 차이가 10 안팎이다
        # 눈빛 둘레(밝기 120 이상에서 10화소 안)는 뺀다 — 눈빛 번짐의 바깥쪽도 어두운 빨강이라 눈이 파먹혔다(04번 120번·06번 118번)
        red_like |= (r - np.maximum(g, b) > 18) & (r >= 25) & (g - b < 0.3 * np.maximum(r - b, 1)) & ~ndi.binary_dilation((v >= 120) & (r - b > 90), iterations=10)   # 주황 눈빛만(크림색 테두리는 빨강-파랑 30~50)
    tlab, tn = ndi.label(red_like)
    if tn:
        idx = range(1, tn + 1)
        sizes, inside = ndi.sum(np.ones(tlab.shape), tlab, idx), ndi.sum(hull, tlab, idx)
        ok = (sizes >= 12) & (inside >= 0.5 * sizes)
        if mouth_at is not None:
            # 입 자리 모드: 원화 입 자리 둘레(MOUTH_REACH)의 6화소 이상 빨강 조각도 혀다 — 혀가 사라지는 순간 얼굴판 테두리에 남은 8화소
            # 조각이 12화소 기준에 걸려 그대로 남았다(04번 148번 실측). 둘레 밖의 작은 빨강(소품)은 그대로 12화소 기준
            cy, cx = (np.array(ndi.center_of_mass(np.ones(tlab.shape), tlab, idx)).reshape(-1, 2)).T
            near = np.hypot(cy - mouth_at[1], cx - mouth_at[0]) <= TONGUE_REACH * (core[3] - core[1])
            # 입 자리 모드의 혀는 모두 원화 입 자리 둘레만. 다만 얼굴 앞을 지나는 빨간 연필 끝(02번 1.4~1.6초)은 거리로 갈리지 않아
            # (입 자리에서 0.19배) 그 프레임은 --line-frames에서 빼고 넘긴다
            ok = near & (sizes >= 6) & (inside >= 0.5 * sizes)
        ok = np.flatnonzero(ok)
        if len(ok): tongue = np.isin(tlab, 1 + ok) if mouth_at is not None else tlab == 1 + int(ok[np.argmax(sizes[ok])])
    if mouth_at is None and not tongue.any(): return None, None
    lit = visor & (reddish | (v >= 120))
    llab, _ = ndi.label(lit)
    if mouth_at is None:
        anchor = tongue
        near_t = ndi.binary_dilation(tongue, iterations=4)
        # 혀에 닿은 밝은 덩어리 중 혀 빛깔이거나(색상 비율 평균 < 0.2) 혀보다 작은 것(입술 선)만 입이다. 번짐이 넓은 눈빛이
        # 혀 곁까지 닿으면 눈까지 입으로 잡혀, 메운 자리가 눈 옆까지 네모나게 번졌다(08번 129번 실측)
        touch = np.unique(llab[near_t & lit]); touch = touch[touch > 0]
        touch = np.array([j for j in touch if hue[llab == j].mean() < 0.2 or (llab == j).sum() < 0.5 * tongue.sum()], dtype=int)
    else:
        # 원화 입 자리에서 얼굴 상자 높이의 MOUTH_REACH배 안의 밝은 덩어리를 색으로 가른다. 눈은 심까지 노랗게 물든 빛이고(빨강-파랑
        # 평균이 크다) 영상이 만든 입선은 색이 없다. 주황 «둘레»로 가르면 고개를 숙여 점으로만 보이는 눈을 입으로 잡아 지웠다(06번 109·110번)
        yy, xx = np.mgrid[:v.shape[0], :v.shape[1]]
        zone = visor & (np.hypot(yy - mouth_at[1], xx - mouth_at[0]) <= MOUTH_REACH * (cy1 - cy0))
        ids = np.unique(llab[zone & lit]); ids = ids[ids > 0]
        top = mouth_at[1] - MOUTH_ABOVE * (cy1 - cy0)
        def mouth_part(j):     # 혀 빛깔(빨강)이거나, 색이 없고(하얗거나 회색) 원화 입 높이 근처나 그 아래인 덩어리는 입
            m = llab == j
            if hue[m].mean() < 0.2: return True
            # 입 높이 근처만 — 눈 사이 얼굴판 반사광(색 없는 밝은 덩어리)까지 입으로 잡아 회색 네모로 메웠다(06번 115번 실측).
            # 눈 높이로 가르면 눈을 감은 프레임에서 기준이 없어 얼굴판 전체를 메웠다(04번 136번 실측)
            # 그리고 «가는 선»만 — 두께(반지름) LINE_THICK 이하이고 둘레보다 LINE_CONTRAST 넘게 밝은 곳이 있어야 한다. 얼굴판 반사광과
            # 얼굴 앞을 지나는 김은 넓고 흐려서 이 기준에서 빠진다(10번 김·얼굴판 가운데 반사광 실측)
            # 두꺼워도 하얗게 빛나면(200 이상) 입이다 — 12번 119번처럼 하얀 초승달이 통째로 그려진 입
            if not ((r - b)[m].mean() < NEUTRAL and np.nonzero(m)[0].mean() > top): return False
            if (v - local)[m].max() < LINE_CONTRAST or v[m].max() < LINE_MIN: return False
            # 둘레(2~6화소, 얼굴판 안)가 검은 얼굴판이어야 한다 — 얼굴 앞을 지나는 김·반사광 덩어리 위의 밝은 결은 입선이 아니다
            # (10번 45~51번: 김의 결을 입선으로 잡아 김 자리를 검게 메웠다)
            ring = ndi.binary_dilation(m, iterations=6) & ~ndi.binary_dilation(m, iterations=2) & visor
            if ring.any() and v[ring].mean() >= LINE_RING_MAX and v[m].max() < LINE_BRIGHT: return False   # 아주 밝은 입선은 김 위여도 지운다
            return ndi.distance_transform_edt(m).max() <= LINE_THICK or v[m].max() >= 200
        touch = np.array([j for j in ids if mouth_part(j)], dtype=int)
        # 눈 = 입이 아닌 밝은 화소 중 색이 있는 화소(덩어리가 아니라 화소로). 눈빛 번짐과 얼굴판 반사광이 이어져 한 덩어리가 되면
        # 반사광까지 눈으로 빠져, 메울 때 반사광을 경계로 못 쓰고 반사광 아래 끝이 잘려 보였다(06번 118번 실측)
        eyes = lit & ~np.isin(llab, touch) & ((r - b) >= NEUTRAL)
        # 검은 벌린 입 = 밝기 MOUTH_BLACK 이하이고 «테두리가 또렷한» 덩어리 — 둘레 1~4화소 띠(얼굴판 안)의 평균이 DARK_EDGE 이상.
        # 얼굴판 아래쪽은 원래 6 아래로 어둡게 그려진 곳이 많아(04번 얼굴판 하위 10%가 2~5), 밝기만 보면 그 그늘 전체를 입으로
        # 잡았다(04번 1~116번 실측). 벌린 입은 둘레가 얼굴판 밝기(20~30)라 경계가 또렷하고, 그늘은 둘레도 어둡다
        dark = zone & (v <= MOUTH_BLACK) & ~ndi.binary_dilation(eyes, iterations=7)
        # 그리고 두께(안쪽에 들어가는 가장 큰 원의 반지름)가 DARK_THICK 이상이어야 한다 — 원화의 어두운 미소선은 반지름 4.5 이하라
        # 이 기준으로 남고(06번 원화 장면 실측), 벌린 입은 8~10이다. 얼굴판 가장자리에 붙은 그늘(가장자리 4화소 띠에 3% 넘게 걸침)도 뺀다
        rim_band = visor & ~ndi.binary_erosion(visor, iterations=4)
        dlab, dn = ndi.label(dark); keep = []
        for j in range(1, dn + 1):
            m = dlab == j
            if m.sum() < 20 or ndi.distance_transform_edt(m).max() < DARK_THICK or (m & rim_band).sum() > DARK_RIM * m.sum(): continue
            ring = ndi.binary_dilation(m, iterations=4) & ~ndi.binary_dilation(m, iterations=1) & visor & ~lit
            if ring.any() and v[ring].mean() >= DARK_EDGE: keep.append(j)
        dark = np.isin(dlab, keep)
        lines = np.isin(llab, touch)
        # 하얀 입선 둘레의 흐린 빛(둘레 얼굴판보다 10 넘게 밝은 3화소 띠)도 입이다 — 빼면 회색 선으로 남아 경계까지 막았다(06번 116~120번)
        rim = faint_rim(lines, v, local, zone, eyes)
        anchor = tongue | lines | rim | dark
        if not anchor.any(): return None, None
        near_t = ndi.binary_dilation(anchor, iterations=4)
        # 혀도 두꺼운 검은 입도 없으면(입선만 밝아진 것) 입선만 지우고 원화와 같은 어두운 초승달은 남긴다 — 초승달까지 메우면 그
        # 구간만 미소선이 사라졌다 나타나 깜박인다(06번 2.0~4.3초, 10번 회색 입선 실측)
        if lines_only:     # 입선은 색 없는 것만(빨간 덩어리는 아래에서 혀로 따로 지운다)
            touch = np.array([j for j in touch if (r - b)[llab == j].mean() < NEUTRAL], dtype=int)
            lines = np.isin(llab, touch)
            rim = faint_rim(lines, v, local, zone, eyes)
            # 혀 조각은 지운다(입선과 함께 그려진 빨간 혀) — 다만 어두운 입 모양은 그대로 두므로 opened는 거짓(아래)
            dark = np.zeros_like(dark); anchor = lines | rim | tongue
            if not anchor.any(): return None, None
            near_t = ndi.binary_dilation(anchor, iterations=4)
        opened = bool(dark.any() or (tongue.any() and not lines_only))
    eye_lit = lit & ~np.isin(llab, touch) if mouth_at is None else eyes
    glow = ndi.binary_dilation(eye_lit, iterations=2)                # 눈빛 — 메우지도, 경계로 쓰지도 않는다
    halo = ndi.binary_dilation(eye_lit, iterations=7)                # 눈빛 번짐 — 입 자체가 아니면 메우지 않는다(경계로는 쓴다).
    # 번짐을 피하지 않으면 번짐이 칼로 자른 듯 끊기고, 번짐 화소를 경계에서 빼지 않으면 보간이 갈색으로 번진다.
    # 대신 번짐 안에 들어온 입 자체(혀·검은 입 둘레 3화소)는 메운다 — 안 그러면 입 끝이 점으로 남았다(08번 127·129번 실측)
    reach = max(12, int(3 * np.sqrt(tongue.sum()))) if tongue.any() else 12   # 초승달 입 끝은 혀에서 혀 크기의 3배까지 간다(1.5배면 끝이 점으로 남았다)
    dark = visor & (v <= np.maximum(8, 0.7 * local)) & ndi.binary_dilation(anchor, iterations=reach)   # 입 윤곽(둘레의 0.55~0.7배)까지 — 0.55면 윤곽이 점으로 남았다(08번 127번)
    dlab, dn = ndi.label(dark)
    mouth = anchor | np.isin(llab, touch)
    if mouth_at is None or opened:
        for j in range(1, dn + 1):
            m = dlab == j
            if (m & near_t).any(): mouth |= m
    # 메울 자리 = 찾은 입(혀·검은 입·입술 선)에서 MOUTH_GROW화소. 입 상자를 키운 타원·네모로 잡으면 입과 상관없는
    # 눈빛 번짐 곁까지 들어가 그 자리가 네모난 갈색 조각으로 남았다(08번 129번 실측)
    # --mouth-frames는 입의 볼록 다각형에서 넓힌다 — 입 모양 그대로 넓히면 윗선이 오목하게 파여, 위에서 내려온 얼굴판 반사광이
    # 그 홈을 따라 혹처럼 남았다(06번 118번 실측). 혀에서 출발하는 08번은 입 모양 그대로(팝 필터가 입 바로 옆이다)
    if mouth_at is not None and not opened:
        near_mouth = ndi.binary_dilation(mouth, iterations=LINE_GROW)      # 입선만: 선 둘레만 넓혀 초승달 안쪽 어둠으로 메운다
    else:
        near_mouth = ndi.binary_dilation(gate.hull_mask(mouth) & visor | mouth if mouth_at is not None and mouth.sum() >= 3 else mouth, iterations=MOUTH_GROW)
    # 경계는 «긴» 회색 선(팝 필터·얼굴판 테두리, 60화소 이상)만이다 — 입술 끝의 짧은 회색 선까지 막으면 그 선이 남았다(08번 58번 실측)
    gray = (v >= 60) & (crop.max(2).astype(np.int32) - crop.min(2) <= 25) & ~mouth
    glab, gn = ndi.label(gray)
    long_gray = np.isin(glab, 1 + np.flatnonzero(ndi.sum(gray, glab, range(1, gn + 1)) >= 60)) if gn else gray
    if mouth_at is not None:
        # 얼굴판 안의 회색(반사광과 그 가장자리)은 막는 선이 아니다 — 막으면 메울 자리가 반사광 아래 끝에서 멈춰, 입이 가리던
        # 반사광 끝이 혹처럼 남았다(06번 115~122번 실측). 08번의 팝 필터 테두리는 이 모드를 쓰지 않는다
        long_gray &= ~visor
        if lines_only: long_gray &= ~ndi.binary_erosion(hull, iterations=3)   # 얼굴 앞을 지나는 김(회색)도 막는 선이 아니다(10번)
    gray_edge = ndi.binary_dilation(long_gray, iterations=1) & ~tongue
    cand = near_mouth & (visor | mouth) & ~glow & (~halo | ndi.binary_dilation(mouth, iterations=3)) & ~gray_edge
    clab, _ = ndi.label(cand)
    keep = np.unique(clab[ndi.binary_dilation(mouth, iterations=1) & cand])
    region = np.isin(clab, keep[keep > 0])
    known = visor & ~glow & ~gray_edge
    if mouth_at is not None and lines_only:
        # 입선만 지울 때는 얼굴판 안쪽의 김·반사광(밝기 160 아래)도 경계로 쓴다 — 검은 얼굴판만 경계로 쓰면 김 속 입선 자리가
        # 검은 얼룩·점으로 메워졌다(10번 45~49번 실측)
        known = (visor | (ndi.binary_erosion(hull, iterations=3) & (v < 160))) & ~glow & ~gray_edge
    return region, known


def fill_mouth(crop, core, region, known):
    """메울 자리 가운데 얼굴판(어두운 덩어리의 볼록 다각형) 안쪽은 얼굴판 화소로, 바깥쪽은 크림색 테두리 화소로 보간하고, 둘 사이는
    다각형 경계를 0.8화소 흐린 비율로 섞는다. 혀가 얼굴판 아래 테두리에 걸친 프레임에서 혀 자리를 통째로 얼굴판 색으로 메우니
    테두리 안쪽 선이 계단 모양으로 깎였다(04번 136·172번 실측) — 얼굴판은 타원이라 볼록 다각형이 원래 테두리를 되살린다."""
    v = crop.max(2).astype(np.int32)
    cx0, cy0, cx1, cy1 = core
    lab, n = ndi.label(v < gate.DARK)
    overlap = ndi.sum(np.ones((cy1 - cy0, cx1 - cx0)), lab[cy0:cy1, cx0:cx1], range(1, n + 1))
    hull = gate.hull_mask(lab == 1 + int(np.argmax(overlap)))
    outside = region & ~ndi.binary_erosion(hull, iterations=1)
    if not outside.any(): return harmonic_fill(crop, region, known)
    inner = harmonic_fill(crop, region & ndi.binary_dilation(hull, iterations=1), known & hull)
    cream = ~hull & ~region & (v >= 100)
    outer = harmonic_fill(crop, region & ~ndi.binary_erosion(hull, iterations=2), cream)
    a = ndi.gaussian_filter(hull.astype(np.float64), 0.8)[..., None]
    out = crop.astype(np.float64)
    mix = a * inner.astype(np.float64) + (1 - a) * outer.astype(np.float64)
    out[region] = mix[region]
    return np.clip(out.round(), 0, 255).astype(np.uint8)


def harmonic_fill(rgb, region, visor):
    """region을 둘레의 얼굴판 화소(visor 안, region 밖 — 눈빛 심·회색 테두리 제외)만 경계로 라플라스 보간해 메운다.
    라플라스 방정식을 희소 행렬로 바로 푼다. 400번 되풀이(야코비)로는 폭 40화소 넘는 입이 다 수렴하지 않아, 가운데가 둘레 평균
    색에 머문 채 위쪽 반사광과 경계가 생겼다(06번 118번 실측 — 되풀이 횟수는 폭의 제곱만큼 필요하다).
    경계에도 메울 자리에도 들지 않는 이웃(눈빛·회색 테두리)은 건너뛴다(그쪽으로는 기울기 0)."""
    ys, xs = np.nonzero(region)                                  # 입 둘레만 잘라 계산한다(빠르게)
    y0, y1, x0, x1 = max(0, ys.min() - 4), min(rgb.shape[0], ys.max() + 5), max(0, xs.min() - 4), min(rgb.shape[1], xs.max() + 5)
    reg, vis = region[y0:y1, x0:x1].copy(), visor[y0:y1, x0:x1]
    reg[0, :] = reg[-1, :] = reg[:, 0] = reg[:, -1] = False
    out = rgb[y0:y1, x0:x1].astype(np.float64)
    known = vis & ~reg
    ring = ndi.binary_dilation(reg, iterations=2) & known
    if not ring.any(): return rgb
    n = int(reg.sum()); idx = -np.ones(reg.shape, np.int64); idx[reg] = np.arange(n)
    rows, cols, vals = [], [], []
    deg = np.zeros(n); rhs = np.zeros((n, 3))
    py, px = np.nonzero(reg); pi = idx[py, px]
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        qy, qx = py + dy, px + dx
        inn = (qy >= 0) & (qy < reg.shape[0]) & (qx >= 0) & (qx < reg.shape[1])
        qy, qx, p_in = qy[inn], qx[inn], pi[inn]
        r_n, k_n = reg[qy, qx], known[qy, qx]
        deg[p_in[r_n | k_n]] += 1
        rows += list(p_in[r_n]); cols += list(idx[qy[r_n], qx[r_n]]); vals += [-1.0] * int(r_n.sum())
        np.add.at(rhs, p_in[k_n], out[qy[k_n], qx[k_n]])
    # 둘레 평균 쪽으로 아주 약하게 당긴다 — 경계 화소에 하나도 닿지 않는 메울 덩어리가 있어도 행렬이 풀린다(결과에는 영향이 없을 만큼 작다)
    deg += 1e-6; rhs += 1e-6 * out[ring].mean(0)
    A = sparse.csc_matrix((np.r_[deg, vals], (np.r_[np.arange(n), rows], np.r_[np.arange(n), cols])), shape=(n, n))
    sol = splu(A).solve(rhs)
    out[reg] = sol
    res = rgb.copy(); res[y0:y1, x0:x1] = np.clip(out.round(), 0, 255).astype(np.uint8)
    return res


def remove_open_mouths(a, scene, regions, files):
    first = np.asarray(Image.open(files[0]).convert('RGB'))
    art_w = Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).width
    s = first.shape[1] / art_w
    boxes = [[int(round(c * s)) for c in f['face']] for f in regions]
    report = {'frames': len(files), 'fixed': [], 'no_mouth': []}
    prev = None
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')).copy(); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, bx) for bx in boxes]
        prev = g; changed = False
        for bx in boxes:
            big, core = gate.expand(bx, rgb.shape)
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            region, visor = open_mouth(crop, core)
            if region is None: report['no_mouth'].append(i + 1); continue
            rgb[big[1]:big[3], big[0]:big[2]] = harmonic_fill(crop, region, visor); changed = True
        name = os.path.basename(f)
        Image.fromarray(rgb).save(os.path.join(a.out, name)) if changed else shutil.copyfile(f, os.path.join(a.out, name))
        if changed:
            report['fixed'].append(i + 1)
            if a.compare:
                os.makedirs(a.compare, exist_ok=True)
                b = boxes[0]; pad = 20
                box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
                Image.open(f).convert('RGB').crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-before.png'))
                Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-after.png'))
    json.dump(report, open(os.path.join(a.out, '..', os.path.basename(a.out.rstrip('/\\')) + '.face-fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(files)}장 · 벌린 입 지운 프레임 {len(report["fixed"])} · 입을 못 찾은 프레임 {len(report["no_mouth"])}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--compare'); ap.add_argument('--all-mouths', action='store_true')
    ap.add_argument('--line-frames', default='')    # 예: 47-104 — 하얗거나 회색인 입선만 지울 프레임(원화 같은 어두운 초승달은 남김)
    ap.add_argument('--mouth-frames', default='')   # 예: 121-140,167 — 남은 입(혀·검은 입·회색 입)까지 지울 프레임(사람이 확인한 구간)
    a = ap.parse_args()
    def frames(spec): return {n for part in spec.split(',') if part for n in range(int(part.split('-')[0]), int(part.split('-')[-1]) + 1)}
    mouth_frames, line_frames = frames(a.mouth_frames), frames(a.line_frames)
    scene = a.scene.zfill(2)
    regions = json.load(open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8'))[scene]
    art = np.asarray(Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).convert('RGB'))
    refs = [gate.reference(art, f['face']) for f in regions]
    if any(r is None for r in refs): raise SystemExit(f'기준 오류: 원화 {scene}에서 눈 두 개를 못 찾았다')
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: raise SystemExit(f'프레임 0장: {a.src}')
    os.makedirs(a.out, exist_ok=True)
    if a.all_mouths: return remove_open_mouths(a, scene, regions, files)
    first = np.asarray(Image.open(files[0]).convert('RGB'))
    s = first.shape[1] / art.shape[1]
    boxes = [[int(round(c * s)) for c in f['face']] for f in regions]
    # 1) 프레임마다 얼굴 상자를 따라가며 지울 자리(상자 기준 좌표)를 구한다
    plan, prev = [], None
    for f in files:
        rgb = np.asarray(Image.open(f).convert('RGB')); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, b) for b in boxes]
        prev = g
        per = []
        for b, ref in zip(boxes, refs):
            big, core = gate.expand(b, rgb.shape)     # 검사와 같은 넓힌 영역 — 상자 밖으로 나간 얼굴판까지
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            face = gate.face_marks(crop, core)
            if face is None: per.append({'box': big, 'core': core, 'seen': False, 'mask': None}); continue
            m = np.zeros(crop.shape[:2], bool)
            for e in gate.new_elements(face, ref, s):
                # 지우는 것은 «원화에 입이 없는 장면의 입»뿐이다. 눈썹으로 분류된 따뜻한 빛은 모양이 바뀐 눈일 수 있고(08번: ∪ 눈이 ^ 눈으로),
                # 원화에 입이 있는 장면(08번)의 입을 지우면 원화의 입까지 없어진다 — 둘 다 사람이 판단한다(보정 뒤 검사에 그대로 남는다)
                if e['kind'] == '입' and '입' not in ref['allowed']: m |= face['labels'] == e['idx']
            m = ndi.binary_dilation(m, iterations=GROW) & face['hull'] if m.any() else m
            per.append({'box': big, 'core': core, 'seen': True, 'mask': m, 'hull': face['hull']})
        plan.append(per)
    # 2) 지우기. 눈빛이 안 보이는 프레임은 앞뒤 프레임의 지운 자리 안 밝은 표시만 지운다
    report = {'frames': len(files), 'fixed': [], 'borrowed': [], 'mouth': []}
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')).copy(); changed = False
        for fi, item in enumerate(plan[i]):
            b = item['box']; crop = rgb[b[1]:b[3], b[0]:b[2]]
            if item['seen']:
                region, hull = item['mask'], item['hull']
            else:
                hull = dark_hull(crop, item['core'])
                if hull is None: continue
                whole = np.zeros(rgb.shape[:2], bool)          # 앞뒤 프레임에서 지운 자리를 화면 좌표로 모은다(상자가 조금씩 움직인다)
                for k in range(max(0, i - NEIGHBOR), min(len(files), i + NEIGHBOR + 1)):
                    o = plan[k][fi]
                    if o['seen'] and o['mask'] is not None and o['mask'].any():
                        ob = o['box']; whole[ob[1]:ob[3], ob[0]:ob[2]] |= o['mask']
                region = whole[b[1]:b[3], b[0]:b[2]]
                if not region.any(): continue
                ch = item['core'][3] - item['core'][1]
                v = crop.max(2).astype(np.int32); local = ndi.median_filter(v, size=max(9, int(0.25 * ch) | 1))
                bright = (v - local >= gate.CONTRAST) & (v >= gate.BRIGHT) & ~gate.warm_mask(crop)
                region = ndi.binary_dilation(region & bright, iterations=GROW) & hull
                if region.any(): report['borrowed'].append(i + 1)
            if region is None or not region.any(): continue
            rgb[b[1]:b[3], b[0]:b[2]] = fill(crop, region, hull); changed = True
        # --mouth-frames로 고른 프레임: 표시 지우기가 남긴 입을 모두 지운다 — 흰 입 아래 빨간 혀(04번 5.0~5.8초·6.9~7.2초), 혀 없는 검은
        # 벌린 입(06번 4.6~5.5초), 덜 밝아 «입»으로 분류되지 않은 회색 입(05번 5.9~7.0초 — 지운 프레임과 남은 프레임이 섞여 입이 깜박였다).
        # 모든 프레임에 자동으로 걸지 않는다: 얼굴판 아래 테두리에 걸친 빨간 연필 끝(02번 1.5초)과 원화의 어두운 미소선이 입과 갈리지 않았다
        # — 사람이 프레임을 고른다(2026-10-07 Bumm님 원칙 «입과 혀는 까맣게 지우라, 다른 애들처럼»)
        for fi, (item, ref) in enumerate(zip(plan[i], refs)):
            if (i + 1 not in mouth_frames and i + 1 not in line_frames) or '입' in ref['allowed']: continue
            b = item['box']; crop = rgb[b[1]:b[3], b[0]:b[2]]
            face = [item['box'][0] + item['core'][0], item['box'][1] + item['core'][1]]          # 이 프레임의 얼굴 상자 왼쪽 위
            at = [regions[fi]['mouth'][k] * s - regions[fi]['face'][k] * s + face[k] - b[k] for k in (0, 1)]   # 원화 입 자리를 따라 옮김
            region, known = open_mouth(crop, item['core'], at, lines_only=i + 1 not in mouth_frames)
            if region is None or not region.any(): continue
            rgb[b[1]:b[3], b[0]:b[2]] = fill_mouth(crop, item['core'], region, known); changed = True; report['mouth'].append(i + 1)
        name = os.path.basename(f)
        if changed:
            Image.fromarray(rgb).save(os.path.join(a.out, name)); report['fixed'].append(i + 1)
            if a.compare:
                os.makedirs(a.compare, exist_ok=True)
                b = plan[i][0]['box']; pad = 20
                box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
                Image.open(f).convert('RGB').crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-before.png'))
                Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-after.png'))
        else:
            shutil.copyfile(f, os.path.join(a.out, name))
    report['borrowed'] = sorted(set(report['borrowed']))
    json.dump(report, open(os.path.join(a.out, '..', os.path.basename(a.out.rstrip('/\\')) + '.face-fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(files)}장 · 지운 프레임 {len(report["fixed"])} · 그중 앞뒤에서 빌린 프레임 {len(report["borrowed"])} · 남은 입까지 지운 프레임 {len(report["mouth"])}')


if __name__ == '__main__':
    main()
