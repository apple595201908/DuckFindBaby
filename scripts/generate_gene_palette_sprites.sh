#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
source_sheet="${project_root}/public/game/assets/duck-family-sprite-sheet.png"
output_sheet="${project_root}/public/game/assets/duck-gene-palette-sheet.png"
mascot_output="${project_root}/public/game/assets/duck-mascot-yellow.png"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

command -v convert >/dev/null
command -v montage >/dev/null

# The original project sprite is a 4 x 2 sheet with 443 px cells. We reuse the
# project's own yellow mascot pose and replace only its body-color region. The
# face, cream belly, orange beak and orange feet remain fixed for fast color
# recognition. Flat color layers keep the sampled hexadecimal values exact.
convert "${source_sheet}" -crop 443x443+0+0 +repage "${work_dir}/base.png"

convert "${work_dir}/base.png" -alpha off \
  -fx '(r>0.45 && g>0.35 && b<0.55 && g/(r+0.001)>0.68 && b/(g+0.001)<0.75)?1:0' \
  -threshold 50% "${work_dir}/body-seed.png"

convert "${work_dir}/base.png" -alpha off \
  -fx 'dark=((r+g+b)/3<0.38); orange=(r>0.45 && g/(r+0.001)<0.72 && b/(g+0.001)<0.95); pink=(r>0.58 && b>0.32 && g<0.78 && b/(g+0.001)>0.72); cream=(r>0.62 && g>0.52 && b>0.42 && b/(g+0.001)>0.72); (dark||orange||pink||cream)?1:0' \
  -threshold 50% "${work_dir}/fixed-features.png"

convert "${work_dir}/fixed-features.png" -negate "${work_dir}/replaceable-features.png"
convert "${work_dir}/base.png" -alpha extract "${work_dir}/sprite-alpha.png"
convert "${work_dir}/body-seed.png" -morphology Dilate Disk:6 -blur 0x0.8 \
  "${work_dir}/body-expanded.png"
convert "${work_dir}/body-expanded.png" "${work_dir}/replaceable-features.png" \
  -compose multiply -composite "${work_dir}/body-with-features.png"
convert "${work_dir}/body-with-features.png" "${work_dir}/sprite-alpha.png" \
  -compose multiply -composite "${work_dir}/body-mask.png"
convert "${work_dir}/body-mask.png" -threshold 42% "${work_dir}/body-mask-solid.png"

palette=(
  'yellow:#FDEC3D'
  'red:#FC3E3E'
  'blue:#0043F8'
  'green:#3BD36F'
  'purple:#9B45F5'
  'orange:#FFA13F'
  'white:#FFFFFF'
  'light-blue:#3BEEFF'
  'magenta:#FD3D93'
  'light-yellow:#FFF890'
  'pale-green:#B7FE94'
  'medium-light-blue:#3EA0FB'
  'indigo:#7B3EFE'
  'pink-magenta:#FA70BE'
)

tiles=()
for index in "${!palette[@]}"; do
  name="${palette[$index]%%:*}"
  hex="${palette[$index]#*:}"
  printf -v tile_path '%s/tile-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  convert -size 443x443 "xc:${hex}" "${work_dir}/color-layer.png"
  convert "${work_dir}/base.png" "${work_dir}/color-layer.png" "${work_dir}/body-mask-solid.png" \
    -compose over -composite -resize 384x384 \
    -alpha set -region 120x112+0+0 -channel RGBA -evaluate set 0 +channel "${tile_path}"
  tiles+=("${tile_path}")
done

# The start screen uses a real standalone image instead of CSS sprite
# coordinates. This avoids clipping and stale-position issues across mobile
# browsers while keeping the same original mascot artwork.
convert "${tiles[0]}" -strip "${mascot_output}"

montage "${tiles[@]}" -tile 4x4 -geometry 384x384+0+0 -background none \
  "PNG32:${work_dir}/sheet.png"
convert "${work_dir}/sheet.png" -strip "${output_sheet}"

identify "${output_sheet}"
identify "${mascot_output}"

# Fail generation if any palette tile can reintroduce the black corner block.
for tile_path in "${tiles[@]}"; do
  corner_pixels="$(convert "${tile_path}" -format '%[pixel:p{20,20}]|%[pixel:p{95,65}]' info:)"
  [[ "${corner_pixels}" == "srgba(0,0,0,0)|srgba(0,0,0,0)" ]] || {
    echo "Palette corner is not fully transparent in ${tile_path}: ${corner_pixels}" >&2
    exit 1
  }
done
