#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
source_sheet="${project_root}/public/game/assets/duck-family-sprite-sheet.png"
output_sheet="${project_root}/public/game/assets/duck-gene-palette-sheet.png"
mascot_output="${project_root}/public/game/assets/duck-mascot-yellow.png"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

# A deep charcoal outline reads as black at game size without looking harsher
# than the eyes and eyebrows. Four source pixels become roughly two pixels on
# a typical phone, enough to separate the white duck from every pale card.
outline_color='#2B2632'
outline_radius='4'
outline_opacity='0.94'
outline_scale='4'
outline_blur='1.2'

command -v convert >/dev/null
command -v montage >/dev/null

# Use one clean original yellow duck as the master for every palette entry.
# Keeping one pose, alpha silhouette and brightness map makes the highlight and
# shadow placement identical across all fourteen colors.
convert "${source_sheet}" -crop 443x443+0+0 +repage "${work_dir}/base.png"
convert "${work_dir}/base.png" -alpha extract "${work_dir}/sprite-alpha.png"

# Eyes and eyebrows are restricted to the face region so dark body-edge pixels
# remain recolorable. Cheeks, mouth, belly and eye highlights use both color
# and geometry: a broad pink/cream color test alone also selected a faint hook
# beside the right cheek and reproduced it on every palette duck.
dark_expression='dark=((r+g+b)/3<0.38 && i>w*0.23 && i<w*0.77 && j>h*0.12 && j<h*0.56); dark?1:0'
orange_expression='oc=(r>0.45 && g/(r+0.001)<0.72 && b/(g+0.001)<0.95); bz=(i>w*0.42 && i<w*0.70 && j>h*0.32 && j<h*0.56); fz=(j>h*0.73); (oc && (bz||fz))?1:0'
pink_expression='pc=(r>0.70 && g>0.25 && g<0.85 && b>0.20 && b/(g+0.001)>0.45); lc=(i>w*0.20 && i<w*0.43 && j>h*0.30 && j<h*0.57); rc=(i>w*0.57 && i<w*0.82 && j>h*0.30 && j<h*0.57); mz=(i>w*0.35 && i<w*0.65 && j>h*0.38 && j<h*0.58); (pc && (lc||rc||mz))?1:0'
cream_expression='cc=(r>0.62 && g>0.52 && b>0.42 && b/(g+0.001)>0.72); ey=(i>w*0.25 && i<w*0.75 && j>h*0.18 && j<h*0.49); by=(i>w*0.24 && i<w*0.76 && j>h*0.52 && j<h*0.87); (cc && (ey||by))?1:0'

convert "${work_dir}/base.png" -alpha off -fx "${dark_expression}" \
  -threshold 50% -morphology Close Disk:1 "${work_dir}/dark-mask.png"
# Closing the orange mask fills only internal highlight gaps in the beak and
# feet. It does not dilate their boundary into the recolored body.
convert "${work_dir}/base.png" -alpha off -fx "${orange_expression}" \
  -threshold 50% -morphology Close Disk:5 "${work_dir}/orange-mask.png"
convert "${work_dir}/base.png" -alpha off -fx "${pink_expression}" \
  -threshold 50% -morphology Close Disk:2 "${work_dir}/pink-mask.png"
convert "${work_dir}/base.png" -alpha off -fx "${cream_expression}" \
  -threshold 50% -morphology Close Disk:2 "${work_dir}/cream-mask.png"
# Face features sit inside the opaque silhouette, so a 50% alpha gate removes
# stale RGB hidden in transparent body-edge pixels. Orange feet need their own
# low threshold to retain their soft antialiased outline instead of inheriting
# the duck's body hue.
for feature in dark pink cream; do
  convert "${work_dir}/${feature}-mask.png" "${work_dir}/sprite-alpha.png" \
    -compose multiply -composite -threshold 50% \
    "${work_dir}/${feature}-visible.png"
done
convert "${work_dir}/orange-mask.png" "${work_dir}/sprite-alpha.png" \
  -compose multiply -composite -threshold 0.5% "${work_dir}/orange-visible.png"
convert "${work_dir}/dark-visible.png" "${work_dir}/orange-visible.png" \
  "${work_dir}/pink-visible.png" "${work_dir}/cream-visible.png" \
  -evaluate-sequence max "${work_dir}/fixed-features-safe.png"
convert "${work_dir}/fixed-features-safe.png" -negate "${work_dir}/replaceable-features.png"

# HSV value carries the original master duck's brightness and gloss. Hue and
# saturation come from the locked game color, so the result stays vivid and
# easy to identify without flattening the original rendered shading.
convert "${work_dir}/base.png" -colorspace HSB -channel B -separate +channel \
  "${work_dir}/master-value.png"

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
  'indigo:#2D219F'
  'pink-magenta:#FF96D0'
)

tiles=()
for index in "${!palette[@]}"; do
  name="${palette[$index]%%:*}"
  hex="${palette[$index]#*:}"
  printf -v tile_path '%s/tile-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  printf -v clean_tile_path '%s/clean-tile-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  printf -v outline_alpha_path '%s/outline-alpha-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  printf -v outline_layer_path '%s/outline-layer-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  printf -v raw_tile_path '%s/raw-tile-%02d-%s.png' "${work_dir}" "${index}" "${name}"
  convert -size 443x443 "xc:${hex}" -colorspace HSB -channel R -separate +channel \
    "${work_dir}/target-hue.png"
  convert -size 443x443 "xc:${hex}" -colorspace HSB -channel G -separate +channel \
    "${work_dir}/target-saturation.png"
  target_value="$(convert "xc:${hex}" -colorspace HSB -format '%[fx:b]' info:)"
  convert "${work_dir}/master-value.png" -evaluate multiply "${target_value}" \
    "${work_dir}/target-value.png"
  convert "${work_dir}/target-hue.png" "${work_dir}/target-saturation.png" \
    "${work_dir}/target-value.png" -set colorspace HSB -combine -colorspace sRGB \
    "${work_dir}/colored-body.png"
  # Recolor the complete antialiased edge, then restore the master's original
  # alpha. Multiplying the color mask by alpha first would blend yellow RGB back
  # into edge pixels and create the thin gold fringe reported as broken art.
  convert "${work_dir}/base.png" "${work_dir}/colored-body.png" \
    "${work_dir}/replaceable-features.png" -compose over -composite \
    "${work_dir}/colored-without-alpha.png"
  convert "${work_dir}/colored-without-alpha.png" "${work_dir}/sprite-alpha.png" \
    -alpha off -compose CopyOpacity -composite -resize 384x384 \
    "${work_dir}/colored-duck.png"
  # Clear only the known unused corner. The former 120 x 112 rectangle reached
  # into several shaded source poses and appeared as a square bite in the duck.
  convert "${work_dir}/colored-duck.png" -alpha set \
    -region 96x72+0+0 -channel RGBA -evaluate set 0 +channel "${raw_tile_path}"

  # The old source sheet contains a few isolated 1–16 px color fragments in
  # otherwise transparent space. Keep only the main connected sprite while
  # multiplying by the original alpha so antialiased edges remain smooth.
  convert "${raw_tile_path}" -alpha extract "${work_dir}/raw-alpha.png"
  convert "${work_dir}/raw-alpha.png" -threshold 1% \
    -define connected-components:area-threshold=1000 \
    -define connected-components:mean-color=true \
    -connected-components 8 -threshold 50% "${work_dir}/main-sprite-mask.png"
  convert "${work_dir}/raw-alpha.png" "${work_dir}/main-sprite-mask.png" \
    -compose multiply -composite "${work_dir}/clean-alpha.png"
  convert "${raw_tile_path}" "${work_dir}/clean-alpha.png" -alpha off \
    -compose CopyOpacity -composite "${clean_tile_path}"

  # Supersample the cleaned alpha silhouette before expanding it. Drawing the
  # curve at 4x resolution and shrinking with Lanczos removes the staircase
  # edge that appears when a rounded outline is built directly at 384 px.
  # The dark layer still sits behind the untouched duck, so body colors and
  # facial features remain exact and transparent corners stay transparent.
  outline_percent="$((outline_scale * 100))%"
  outline_disk="$((outline_radius * outline_scale))"
  convert "${clean_tile_path}" -alpha extract -filter Lanczos \
    -resize "${outline_percent}" -threshold 8% \
    -morphology Dilate "Disk:${outline_disk}" -blur "0x${outline_blur}" \
    -filter Lanczos -resize 384x384 \
    -evaluate multiply "${outline_opacity}" "${outline_alpha_path}"
  convert -size 384x384 "xc:${outline_color}" "${outline_alpha_path}" \
    -alpha off -compose CopyOpacity -composite "${outline_layer_path}"
  convert "${outline_layer_path}" "${clean_tile_path}" -compose over \
    -composite "${tile_path}"
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

# Protect three stable pixels inside the orange beak and red mouth. These
# samples deliberately avoid the surrounding body color, so a future mask
# expansion fails here before color bleed reaches the shipped sprite sheet.
feature_points=("192,170" "208,168" "208,178")
for index in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  for point in "${feature_points[@]}"; do
    reference_pixel="$(convert "${tiles[0]}" -format "%[pixel:p{${point}}]" info:)"
    candidate_pixel="$(convert "${tiles[$index]}" -format "%[pixel:p{${point}}]" info:)"
    [[ "${candidate_pixel}" == "${reference_pixel}" ]] || {
      echo "Beak protection failed for palette ${index} at ${point}: ${candidate_pixel}" >&2
      exit 1
    }
  done
done
