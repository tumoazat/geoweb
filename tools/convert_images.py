"""Convert Stitch product photography PNGs into optimised WebP assets.

Maps each `studio_product_*` folder in the Stitch export to a product slug +
category, then writes images/<category>/<slug>.webp at 900px max edge.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "stitch_gearzone_gaming_gear_e_commerce" / "stitch_gearzone_gaming_gear_e_commerce"
OUT = ROOT / "images"

MAX_EDGE = 900
QUALITY = 82

# folder prefix fragment -> (category, slug, css background tint)
PRODUCTS = [
    ("attack_shark_x3", "mouse", "attack-shark-x3"),
    ("logitech_g102", "mouse", "logitech-g102-lightsync"),
    ("logitech_g305", "mouse", "logitech-g305-lightspeed"),
    ("logitech_g_pro_x_2", "mouse", "logitech-g-pro-x-superlight-2"),
    ("razer_deathadder", "mouse", "razer-deathadder-essential"),
    ("razer_viper_v3_pro", "mouse", "razer-viper-v3-pro"),
    ("scyrox_v8", "mouse", "scyrox-v8"),
    ("vxe_dragonfly_r1_se", "mouse", "vxe-dragonfly-r1-se"),
    ("zowie_u2", "mouse", "zowie-u2"),
    ("akko_5075b", "keyboard", "akko-5075b-plus"),
    ("asus_rog_azoth", "keyboard", "asus-rog-azoth"),
    ("aula_f75", "keyboard", "aula-f75-pro-max"),
    ("logitech_g_pro_x_tkl", "keyboard", "logitech-g-pro-x-tkl"),
    ("razer_huntsman_v3_pro", "keyboard", "razer-huntsman-v3-pro-tkl"),
    ("vgn_n75_pro", "keyboard", "vgn-n75-pro"),
    ("wooting_60he", "keyboard", "wooting-60he"),
    ("keychron", "keyboard", "keychron-v3-max"),
    ("asus_rog_delta_s", "headset", "asus-rog-delta-s"),
    ("hyperx_cloud_iii", "headset", "hyperx-cloud-iii"),
    ("logitech_g733", "headset", "logitech-g733-lightspeed"),
    ("moondrop_para", "headset", "moondrop-para"),
    ("razer_blackshark_v2_pro", "headset", "razer-blackshark-v2-pro"),
    ("sennheiser_game_one", "headset", "sennheiser-game-one"),
    ("steelseries_arctis_nova_5", "headset", "steelseries-arctis-nova-5"),
    ("artisan_ninja_fx_zero", "accessory", "artisan-ninja-fx-zero"),
]


def find_source(fragment: str) -> Path | None:
    """Return the screen.png of the first studio folder containing `fragment`."""
    for folder in SRC.iterdir():
        if folder.is_dir() and fragment in folder.name:
            candidate = folder / "screen.png"
            if candidate.exists():
                return candidate
    return None


def convert(src: Path, dest: Path) -> tuple[int, int]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        img = img.convert("RGB")
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        img.save(dest, "WEBP", quality=QUALITY, method=6)
        return img.size


def main() -> None:
    missing: list[str] = []
    total = 0

    for fragment, category, slug in PRODUCTS:
        src = find_source(fragment)
        if src is None:
            missing.append(fragment)
            continue

        dest = OUT / category / f"{slug}.webp"
        size = convert(src, dest)
        total += dest.stat().st_size
        print(f"{category}/{slug}.webp  {size[0]}x{size[1]}  {dest.stat().st_size // 1024}KB")

    print(f"\n{len(PRODUCTS) - len(missing)}/{len(PRODUCTS)} converted, {total // 1024}KB total")
    if missing:
        print("MISSING: " + ", ".join(missing))


if __name__ == "__main__":
    main()
