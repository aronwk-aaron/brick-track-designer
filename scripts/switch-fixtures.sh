#!/bin/bash
# switch-fixtures.sh: echo switch.scad's routes and frogs for a set of
# configs into test/fixtures/switch-frogs.txt (one ECHO line per config), for
# the solver's parity test. OPENSCAD_REPO defaults to ~/Documents/openscad.
REPO=${OPENSCAD_REPO:-$HOME/Documents/openscad}
OUT=test/fixtures/switch-frogs.txt; : > $OUT
TMP=$(mktemp -d)
cat > $TMP/e.scad <<SCAD
include <switch.scad>
echo(cfg = cfg, G = rail_sweep_offset, routes = routes, frogs = [for (f = frogs) [f[0], f[1], f[3]]], checks = [for (c = check_list) [c[0], c[2], c[3], c[5], c[6]]]);
SCAD
RUN=openscad-nightly; [ -x $HOME/.claude/scripts/safe-run.sh ] && RUN="$HOME/.claude/scripts/safe-run.sh openscad-nightly"
for t in left right wye threeway; do for r in 24 40 56 72 104 120; do for sh in s_curve arc; do
  [ $t = wye ] && [ $sh = s_curve ] && continue
  [ $t = threeway ] && [ $sh = s_curve ] && continue
  cfg="$t-R$r-$sh"
  OPENSCADPATH=$REPO $RUN -D "cfg=\"$cfg\"" -D "switch_type=\"$t\"" -D diverge_radius=$r -D "diverge_shape=\"$sh\"" -D 'part="none"' -o $TMP/x.echo $TMP/e.scad >/dev/null 2>&1
  grep "^ECHO: cfg" $TMP/x.echo >> $OUT
done; done; done
rm -rf $TMP
wc -l $OUT
