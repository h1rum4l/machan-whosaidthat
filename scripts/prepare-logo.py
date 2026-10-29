"""Prepare delivery assets from the official PNG; requires Pillow only for regeneration."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
original = root / "public/assets/aistudio/Untitled_Design__15__76563b80.png"
logo = Image.open(original).convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS)
webp = root / "public/assets/brand/machan-logo.webp"
webp.parent.mkdir(parents=True, exist_ok=True)
logo.convert("RGB").save(webp, "WEBP", quality=88, method=6)

# The supplied PNG is opaque. Extract its white lettering, not its blue square.
mask = Image.new("RGBA", logo.size)
mask.putdata([
    (255, 255, 255, 255) if a >= 128 and min(r, g, b) >= 210 and max(r, g, b) - min(r, g, b) <= 35
    else (0, 0, 0, 0)
    for r, g, b, a in logo.get_flattened_data()
])
bounds = mask.getbbox()
if bounds is None:
    raise ValueError("The official logo has no readable white lettering")
assert mask.getextrema()[3] == (0, 255), "The water mask must contain both ink and transparency"
ink = mask.crop(bounds)
scale = 400 / max(ink.size)
ink = ink.resize(tuple(round(size * scale) for size in ink.size), Image.Resampling.LANCZOS)
centered = Image.new("RGBA", (512, 512))
centered.paste(ink, ((512 - ink.width) // 2, (512 - ink.height) // 2))
target = root / "src/shaders/elements/assets/machan-logo-mask.png"
target.parent.mkdir(parents=True, exist_ok=True)
centered.save(target, optimize=True)
print(f"Official logo: {original.stat().st_size:,} -> {webp.stat().st_size:,} bytes")
print(f"Prepared water mask: {target.stat().st_size:,} bytes")
