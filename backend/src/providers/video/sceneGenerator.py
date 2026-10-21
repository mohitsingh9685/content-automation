#!/usr/bin/env python3
"""
Scene-Based Visual & Canonical Presenter Compositor for Hindi Trend AI
Uses the canonical presenter reference crops in /assets/presenter/ (never substitutes a random face)
and renders category-specific infographic/diagram keyframes with Devanagari typography (Kohinoor.ttc).
"""

import json
import os
import sys
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

FONT_PATHS = [
    "/System/Library/Fonts/Kohinoor.ttc",
    "/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc",
    "/System/Library/Fonts/Supplemental/ITFDevanagari.ttc",
]


def load_font(size, index=0):
    for fp in FONT_PATHS:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size, index=index)
            except Exception:
                try:
                    return ImageFont.truetype(fp, size=size)
                except Exception:
                    pass
    return ImageFont.load_default()


def wrap_text(draw, text, font, max_width):
    words = str(text or "").split()
    lines = []
    current = ""
    for w in words:
        test = f"{current} {w}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if (bbox[2] - bbox[0]) <= max_width or not current:
            current = test
        else:
            lines.append(current)
            current = w
    if current:
        lines.append(current)
    return lines[:4]


def create_rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def paste_rounded_image(canvas, img, box, radius=24, border_color=(56, 189, 248), border_width=3):
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    fitted = ImageOps.fit(img.convert("RGB"), (w, h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.25))
    mask = create_rounded_mask((w, h), radius)
    canvas.paste(fitted, (x1, y1), mask)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x1, y1, x2, y2), radius=radius, outline=border_color, width=border_width)


def draw_category_backdrop(draw, width, height, template, phase):
    """Draws rich category-specific illustrative diagrams (cricket pitch, tech grid, timeline, spotlight)"""
    # Deep studio gradient background
    palettes = {
        "anchor_studio": ((10, 15, 32), (18, 34, 68), (56, 189, 248)),
        "cricket_tactical": ((8, 28, 24), (14, 54, 42), (52, 211, 153)),
        "tech_comparison": ((12, 16, 38), (28, 25, 72), (129, 140, 248)),
        "timeline_explainer": ((15, 23, 42), (30, 41, 59), (251, 191, 36)),
        "public_affairs_data": ((24, 16, 36), (48, 24, 52), (248, 113, 113)),
        "entertainment_spotlight": ((28, 12, 36), (58, 18, 62), (244, 114, 182)),
    }
    top_col, bot_col, accent = palettes.get(template, palettes["anchor_studio"])

    for y in range(height):
        t = y / max(1, height - 1)
        r = int(top_col[0] * (1 - t) + bot_col[0] * t)
        g = int(top_col[1] * (1 - t) + bot_col[1] * t)
        b = int(top_col[2] * (1 - t) + bot_col[2] * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Subtle architectural studio grid
    step = 64
    grid_col = (accent[0] // 5 + 15, accent[1] // 5 + 20, accent[2] // 5 + 30)
    for x in range(0, width, step):
        draw.line([(x, 0), (x, height)], fill=grid_col, width=1)
    for y in range(0, height, step):
        draw.line([(0, y), (width, y)], fill=grid_col, width=1)

    # Category-specific decorative vector diagrams
    if template == "cricket_tactical":
        # Draw illustrative stadium oval & tactical pitch lines
        cx, cy = width // 2, int(height * 0.46)
        rx, ry = int(width * 0.38), int(height * 0.14)
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(52, 211, 153), width=2)
        draw.rectangle((cx - 28, cy - 55, cx + 28, cy + 55), fill=(180, 145, 95), outline=(255, 255, 255), width=2)
        # Fielder/player tactical nodes
        nodes = [(-90, -35), (85, -40), (-70, 45), (95, 30), (0, -70)]
        for idx, (dx, dy) in enumerate(nodes):
            shift = 6 if phase == 1 and idx % 2 == 0 else 0
            px, py = cx + dx + shift, cy + dy
            draw.ellipse((px - 8, py - 8, px + 8, py + 8), fill=(251, 191, 36), outline=(255, 255, 255), width=2)
    elif template == "tech_comparison":
        # Futuristic circuit nodes & comparison bars
        cx = int(width * 0.12)
        cy = int(height * 0.42)
        for i in range(3):
            bar_y = cy + i * 38
            bar_w = int(width * (0.45 + i * 0.12 + (0.06 if phase == 1 else 0)))
            draw.rounded_rectangle((cx, bar_y, cx + bar_w, bar_y + 18), radius=8, fill=(56, 189, 248))
    elif template == "timeline_explainer":
        # Glowing timeline track
        y_line = int(height * 0.44)
        draw.line([(int(width * 0.1), y_line), (int(width * 0.9), y_line)], fill=(251, 191, 36), width=4)
        for i in range(4):
            nx = int(width * (0.15 + i * 0.23))
            r = 14 if (phase == 1 and i >= 2) else 10
            col = (251, 191, 36) if i <= (2 if phase == 1 else 1) else (100, 116, 139)
            draw.ellipse((nx - r, y_line - r, nx + r, y_line + r), fill=col, outline=(255, 255, 255), width=3)

    return accent


def render_scene_frame(config, phase=0):
    """
    Renders a single high-resolution scene keyframe (phase 0 = speaking state, phase 1 = expression/callout state)
    """
    fmt = config.get("format") or "vertical"
    is_horiz_fmt = fmt in ("16:9", "horizontal")
    width = int(config.get("width", 1280 if is_horiz_fmt else 720))
    height = int(config.get("height", 720 if is_horiz_fmt else 1280))
    is_vertical = height >= width
    assets_root = config.get("assetsRoot") or config.get("assets_dir")
    scene = config["scene"]
    scene_idx = int(scene.get("scene_number", 1))
    total_scenes = int(config.get("totalScenes") or config.get("total_scenes") or 5)
    video_title = config.get("hindiTitle") or config.get("video_title") or ""
    primary_source = config.get("primarySource") or config.get("primary_source") or "Verified News Source"

    template = scene.get("visual_template", "anchor_studio")
    presenter_cfg = scene.get("presenter_config", {})
    layout = presenter_cfg.get("layout", "full_anchor")
    target_expr = presenter_cfg.get("expression", "explaining")
    look_name = presenter_cfg.get("look", "news_anchor")

    # In phase 0, use 'speaking' expression (or hero_anchor on scene 1) so presenter's lips/expression animate between phase 0 and phase 1
    active_expr = "speaking" if phase == 0 else target_expr

    canvas = Image.new("RGB", (width, height), (10, 15, 30))
    draw = ImageDraw.Draw(canvas)
    accent = draw_category_backdrop(draw, width, height, template, phase)

    font_badge = load_font(22 if is_vertical else 20, index=1)
    font_title = load_font(33 if is_vertical else 30, index=1)
    font_body = load_font(25 if is_vertical else 22, index=0)
    font_sub = load_font(27 if is_vertical else 24, index=1)
    font_small = load_font(18 if is_vertical else 16, index=0)

    # 1. Top Studio Header Bar (Channel Identity + Scene Progress + Synthetic Disclosure)
    draw.rounded_rectangle((28, 28, width - 28, 96), radius=16, fill=(15, 23, 42), outline=accent, width=2)
    badge_text = scene.get("visual_data", {}).get("badge") or "45s Topic Explainer"
    draw.ellipse((46, 55, 60, 69), fill=accent)
    draw.text((70, 46), badge_text, font=font_badge, fill=accent)
    step_str = f"Scene {scene_idx}/{total_scenes}"
    draw.text((width - 145, 48), step_str, font=font_badge, fill=(226, 232, 240))

    # Resolve canonical presenter images from /assets/presenter/
    if os.path.exists(os.path.join(assets_root, "presenter", "hero_anchor.jpg")):
        assets_root = os.path.join(assets_root, "presenter")
    hero_path = os.path.join(assets_root, "hero_anchor.jpg")
    look_path = os.path.join(assets_root, "looks", f"{look_name}.jpg")
    expr_path = os.path.join(assets_root, "expressions", f"{active_expr}.jpg")
    default_outfit_path = os.path.join(assets_root, "outfits", "black_blazer.jpg")

    if not os.path.exists(look_path):
        look_path = hero_path
    if not os.path.exists(expr_path):
        expr_path = os.path.join(assets_root, "expressions", "explaining.jpg")

    # 2. Presenter Placement (Always using canonical character reference assets)
    if is_vertical:
        if layout == "full_anchor":
            # Large studio presenter frame in top-center + expression cameo badge
            main_img_path = hero_path if (scene_idx == 1 and phase == 0) else look_path
            p_img = Image.open(main_img_path)
            paste_rounded_image(canvas, p_img, (44, 118, width - 44, 570), radius=28, border_color=accent, border_width=4)

            # Live speaking/expression close-up inset in top-right of anchor frame
            e_img = Image.open(expr_path)
            ring_col = (52, 211, 153) if phase == 0 else accent
            paste_rounded_image(canvas, e_img, (width - 220, 136, width - 58, 310), radius=20, border_color=ring_col, border_width=3)
            draw.rounded_rectangle((width - 220, 282, width - 58, 312), radius=8, fill=(15, 23, 42))
            draw.text((width - 208, 286), f"AASHI • {active_expr[:9].upper()}", font=font_small, fill=ring_col)
            card_top = 592
        else:
            # Animated Infographic Primary + Canonical Presenter PiP in right corner
            card_top = 124
            # Draw Visual Data / Infographic Card in upper half
            draw.rounded_rectangle((36, 120, width - 235, 490), radius=24, fill=(15, 23, 42), outline=accent, width=2)
            stat_label = scene.get("visual_data", {}).get("stat_label") or "Key Fact"
            stat_val = scene.get("visual_data", {}).get("stat_value") or primary_source
            draw.text((58, 145), stat_label, font=font_badge, fill=(148, 163, 184))
            val_lines = wrap_text(draw, stat_val, font_title, width - 315)
            vy = 182
            for vl in val_lines[:2]:
                draw.text((58, vy), vl, font=font_title, fill=(251, 191, 36))
                vy += 42

            # Animated visual telemetry bars & context inside infographic box
            bar_top = vy + 18
            pts = scene.get("visual_data", {}).get("points") or ["Verified Report", "Core Data Breakdown"]
            for idx_b, pt in enumerate(pts[:2]):
                by_pos = bar_top + idx_b * 76
                if by_pos + 52 < 475:
                    draw.text((58, by_pos), f"• {pt[:26]}", font=font_small, fill=(226, 232, 240))
                    track_w = width - 325
                    fill_ratio = min(0.95, 0.58 + idx_b * 0.18 + (0.12 if phase == 1 else 0.0))
                    draw.rounded_rectangle((58, by_pos + 28, 58 + track_w, by_pos + 44), radius=7, fill=(30, 41, 59))
                    draw.rounded_rectangle((58, by_pos + 28, 58 + int(track_w * fill_ratio), by_pos + 44), radius=7, fill=accent if idx_b == 0 else (52, 211, 153))

            # Canonical Presenter PiP (Black Blazer + Active Expression) on the right
            pip_source = expr_path if phase == 1 else default_outfit_path
            p_img = Image.open(pip_source)
            ring_col = (52, 211, 153) if phase == 0 else accent
            paste_rounded_image(canvas, p_img, (width - 218, 120, width - 36, 385), radius=22, border_color=ring_col, border_width=4)
            draw.rounded_rectangle((width - 218, 395, width - 36, 488), radius=14, fill=(15, 23, 42), outline=ring_col, width=2)
            draw.text((width - 202, 405), "Host: Aashi", font=font_small, fill=(255, 255, 255))
            draw.text((width - 202, 432), f"Mood: {target_expr}", font=font_small, fill=ring_col)
            draw.ellipse((width - 202, 461, width - 190, 473), fill=(52, 211, 153))
            draw.text((width - 182, 456), "LIVE VOICE", font=font_small, fill=(52, 211, 153))
            card_top = 515

        # 3. On-Screen Headline & Storyboard Explanation Card
        draw.rounded_rectangle((36, card_top, width - 36, card_top + 250), radius=24, fill=(15, 23, 42), outline=(71, 85, 105), width=2)
        on_screen = scene.get("on_screen_text") or video_title
        h_lines = wrap_text(draw, on_screen, font_title, width - 115)
        hy = card_top + 22
        for hl in h_lines[:2]:
            draw.text((58, hy), hl, font=font_title, fill=(255, 255, 255))
            hy += 44

        pts = scene.get("visual_data", {}).get("points") or []
        by = hy + 10
        for pt in pts[:3]:
            p_lines = wrap_text(draw, f"• {pt}", font_body, width - 115)
            for pl in p_lines[:2]:
                if by < card_top + 220:
                    draw.text((58, by), pl, font=font_body, fill=(199, 210, 254))
                    by += 33

        # 4. Synchronized Devanagari Subtitle Box (Bottom Explainer Caption Area)
        sub_top = height - 355
        draw.rounded_rectangle((32, sub_top, width - 32, height - 115), radius=22, fill=(9, 13, 26), outline=(251, 191, 36), width=3)
        narration = scene.get("narration_segment") or ""
        n_lines = wrap_text(draw, narration, font_sub, width - 110)
        sy = sub_top + 24
        for nl in n_lines[:4]:
            draw.text((56, sy), nl, font=font_sub, fill=(254, 240, 138))
            sy += 42

        # 5. Footer: Source Attribution & Synthetic Media Disclosure
        disclosure = scene.get("ai_generated_disclosure") or "ExplainIndia 45s | Verified Sources"
        draw.rounded_rectangle((32, height - 96, width - 32, height - 28), radius=14, fill=(15, 23, 42))
        draw.text((50, height - 84), f"Source: {primary_source[:45]}", font=font_small, fill=(148, 163, 184))
        draw.text((50, height - 58), disclosure[:62], font=font_small, fill=(100, 116, 139))

    else:
        # Horizontal 16:9 Explainer Layout (1280x720)
        # Left column: Canonical Presenter Aashi (Black Blazer + Active Expression)
        p_img = Image.open(hero_path if phase == 0 else look_path)
        paste_rounded_image(canvas, p_img, (36, 116, 460, height - 110), radius=26, border_color=accent, border_width=4)
        e_img = Image.open(expr_path)
        paste_rounded_image(canvas, e_img, (320, 132, 444, 285), radius=18, border_color=(52, 211, 153), border_width=3)

        # Right column: Storyboard Infographic + Synchronized Roman Hinglish Subtitles
        draw.rounded_rectangle((488, 116, width - 36, 430), radius=24, fill=(15, 23, 42), outline=accent, width=2)
        on_screen = scene.get("on_screen_text") or video_title
        h_lines = wrap_text(draw, on_screen, font_title, width - 570)
        hy = 140
        for hl in h_lines[:2]:
            draw.text((516, hy), hl, font=font_title, fill=(251, 191, 36))
            hy += 42

        pts = scene.get("visual_data", {}).get("points") or []
        py = hy + 16
        for pt in pts[:3]:
            p_lines = wrap_text(draw, f"• {pt}", font_body, width - 570)
            for pl in p_lines[:2]:
                if py < 405:
                    draw.text((516, py), pl, font=font_body, fill=(241, 245, 249))
                    py += 32

        # Subtitle box bottom-right
        draw.rounded_rectangle((488, 448, width - 36, height - 110), radius=20, fill=(9, 13, 26), outline=(251, 191, 36), width=3)
        narration = scene.get("narration_segment") or ""
        n_lines = wrap_text(draw, narration, font_sub, width - 570)
        sy = 468
        for nl in n_lines[:3]:
            draw.text((516, sy), nl, font=font_sub, fill=(254, 240, 138))
            sy += 38

        # Footer bar
        draw.rounded_rectangle((36, height - 90, width - 36, height - 26), radius=14, fill=(15, 23, 42))
        draw.text((58, height - 70), f"ExplainIndia 45s  |  Source: {primary_source}  |  3D Educational Visual", font=font_small, fill=(148, 163, 184))

    return canvas


def main():
    if len(sys.argv) == 2 and sys.argv[1].lstrip().startswith("{"):
        config = json.loads(sys.argv[1])
        out_paths = config.get("output_paths") or []
        out_a, out_b = out_paths[0], out_paths[1]
    elif len(sys.argv) >= 4:
        config_path = sys.argv[1]
        out_a = sys.argv[2]
        out_b = sys.argv[3]
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    else:
        print("Usage: sceneGenerator.py <json_payload | config.json> [out_phase0.png] [out_phase1.png]", file=sys.stderr)
        sys.exit(1)

    img_a = render_scene_frame(config, phase=0)
    img_b = render_scene_frame(config, phase=1)

    os.makedirs(os.path.dirname(out_a), exist_ok=True)
    img_a.save(out_a, format="PNG")
    img_b.save(out_b, format="PNG")
    print(json.dumps({"ok": True, "frameA": out_a, "frameB": out_b}))


if __name__ == "__main__":
    main()
