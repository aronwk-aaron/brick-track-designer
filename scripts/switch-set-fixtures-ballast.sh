#!/bin/bash
# switch-set-fixtures-ballast.sh: as switch-set-fixtures.sh, with ballast (the routes come out longer: the ends must clear the ballast)
# every points set's machinery values (with_set's $ variables), to 6 decimal
# places, into test/fixtures/switch-sets.txt, for the switch context's parity
# test. OPENSCAD_REPO defaults to ~/Documents/openscad.
REPO=${OPENSCAD_REPO:-$HOME/Documents/openscad}
OUT=test/fixtures/switch-sets-ballast.txt; : > $OUT
TMP=$(mktemp -d)
cat > $TMP/e.scad <<'SCAD'
include <switch.scad>
// numbers to 6 decimals (echo rounds to 6 significant digits)
function digits(i) = i < 10 ? chr(48 + i) : str(digits(floor(i / 10)), chr(48 + i % 10));
function f6(x) = is_list(x) ? str("[", join([for (v = x) f6(v)], ","), "]")
  : is_num(x) ? let (a = abs(x), n = round(a * 1e6), i = floor(n / 1e6), f = n - i * 1e6)
                str(x < 0 && n > 0 ? "-" : "", digits(i), ".", chr([for (k = [5:-1:0]) 48 + floor(f / pow(10, k)) % 10]))
  : is_string(x) ? str("\"", x, "\"") : str(x);
echo(str("CFG ", cfg, " ", f6([G, layer_z0, layer_top, cavity_top, bed_top, lever_pz, lever_da, blade_need])));
echo(str("ROUTES ", f6(routes)));
echo(str("SETS ", f6(points_sets)));
for (k = [0:n_sets - 1])
  echo(str("SET ", k, " ", with_set_f(k, function () f6([$s_heel, $toe_y, $s_bpiv, $pivot_pt, $throw_ang, $tine_len, $y_s, $tine_tip,
    $throw_travel, $lever_travel, $post_x, $points_end_y, $tip_gap, $throw_dir, $throw_y, $throw_stock_x, $throw_face_x,
    $lever_ang, $lever_tip_z, $throw_edge_x, $lever_min_d, $lever_x, $fork_x, $fork_lip_z, $fork_top, $fork_mouth_hw,
    $step_ya, $step_yb, $step_xo, $arm_rect]))));
SCAD
RUN=openscad-nightly; [ -x $HOME/.claude/scripts/safe-run.sh ] && RUN="$HOME/.claude/scripts/safe-run.sh openscad-nightly"
for t in left right wye threeway; do for r in 24 40 104; do for sh in s_curve arc; do
  [ $t = wye ] && [ $sh = s_curve ] && continue
  [ $t = threeway ] && [ $sh = s_curve ] && continue
  cfg="$t-R$r-$sh"
  OPENSCADPATH=$REPO $RUN -D "cfg=\"$cfg\"" -D "switch_type=\"$t\"" -D diverge_radius=$r -D "diverge_shape=\"$sh\"" \
    -D generate_ballast=true -D 'part="none"' -o $TMP/x.echo $TMP/e.scad >/dev/null 2>&1
  grep -E '^ECHO: "(CFG|ROUTES|SETS|SET) ' $TMP/x.echo | sed 's/^ECHO: "//; s/"$//; s/\\"/"/g' >> $OUT
done; done; done
# (and without the buddy, on a float bottom, where switch.scad makes the routes shorter: the ballast's narrower)
for c in "right 24 arc" "threeway 40 arc"; do set -- $c; cfg="float-nobuddy-$1-R$2-$3"
  OPENSCADPATH=$REPO $RUN -D "cfg=\"$cfg\"" -D "switch_type=\"$1\"" -D diverge_radius=$2 -D "diverge_shape=\"$3\"" \
    -D generate_ballast=true -D 'bottom_style="float"' -D generate_ballast_buddy=false -D 'part="none"' -o $TMP/x.echo $TMP/e.scad >/dev/null 2>&1
  grep -E '^ECHO: "(CFG|ROUTES|SETS|SET) ' $TMP/x.echo | sed 's/^ECHO: "//; s/"$//; s/\\"/"/g' >> $OUT
done
rm -rf $TMP
grep -c ^CFG $OUT
