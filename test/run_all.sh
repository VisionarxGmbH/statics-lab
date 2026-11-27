#!/bin/bash
# Every check of the page, in one run. Writes numeric.txt, browser.txt and status.txt into the folder given.
# The numeric checks, the three runs of the value check and the check of typed entries go in one lane, the other browser checks in a second lane
# beside it; the outputs are put together in a fixed order.
#
# The result of the run is its exit status, and it comes from the exit status of every check, not from words in the
# outputs (review 10, C120: a check that ended with status 1 left the run at 0). Every check is started through "run",
# which notes its exit status in a list. A check that is a pipeline runs with pipefail, so that the status is that of
# the check and not that of "tail". Each lane notes that it reached its end.
#
# Every check that is scheduled must also have been started (review 11, C120: with a directory at the place of
# numeric.txt the 18 numeric checks did not start, 10 of 28 starts were listed, and the run ended with 0). So the run
# first goes through its own lanes without starting anything and notes the label of every check: that is the schedule.
# At the end each label of the schedule must stand in the list with exit status 0; a check that was not started, or
# that was stopped before its end, has no result and is listed so. And every output must be written:
# before the first check the three output files are opened for writing, and a lane whose output cannot be written says so.
#
# The run ends with status 0 only when the outputs could be written, the build worked, both lanes reached their end,
# every scheduled check has a result and every check ended with status 0; status.txt lists them all.
# test/run_all_selftest.py proves this on this very file, with stand-ins for the checks.
#
# usage: bash test/run_all.sh <out-dir> [command for the end of the second lane]
set -u -o pipefail
cd "$(dirname "$0")/.."
out="$1"; mkdir -p "$out"; tmp="$(mktemp -d)"; list="$tmp/status"; plan="$tmp/plan"; : > "$list"; : > "$plan"
extra="${2:-}"
# run <label> <command ...>: prints "$ label", runs the command and notes its exit status.
# While the schedule is made (DRY) it notes the label and starts nothing.
run() { local label="$1" rc; shift; if [ -n "${DRY:-}" ]; then printf '%s\n' "$label" >> "$plan"; return 0; fi
  echo "\$ $label"; "$@"; rc=$?; printf '%s\t%s\n' "$rc" "$label" >> "$list"; }
quiet() { "$@" > /dev/null; }
last() { "$@" | tail -1; }                                       # the last line of a check; its status with pipefail
cards() { node test/cards.test.js | sed -n '/^printed lines of the examples/,$p'; }
fuzz() { node test/fuzz.test.js 12000 "$1" | grep -v '^hand cards met'; }
random() { node test/independent/dump_random.js 3000 "$1" "$2" ${3:+"$3"} && python3 test/independent/compare_random.py "$2"; }
configs() { node test/independent/dump_configs.js "$1" ${2:+"$2"} && python3 test/independent/compare_configs.py "$1"; }

builds() {
  run 'node build.js' quiet node build.js
  run 'node build.js --debug' quiet node build.js --debug
}
numeric() {
  run 'python3 test/run_all_selftest.py' python3 test/run_all_selftest.py
  echo; run 'node test/solver.test.js' last node test/solver.test.js
  echo; run 'node test/cards.test.js' cards
  for sd in 11 12 13 14; do echo; run "node test/fuzz.test.js 12000 $sd" fuzz $sd; done
  for sd in 31 32; do echo; run "node test/tops.test.js 2400 $sd" node test/tops.test.js 2400 $sd; done
  for sd in 21 22 23 24; do echo; run "node test/independent/dump_random.js 3000 $sd <file>; python3 test/independent/compare_random.py <file>" random $sd "$tmp/r$sd.json"; done
  # toward the far corners of what the menus allow: in every state each step of the grid gets a length from the list with
  # probability 0.6 and each member a profile with probability 0.5 (the dump counts what the states end with)
  for sd in 25 26; do echo; run "node test/independent/dump_random.js 3000 $sd <file> 1; python3 test/independent/compare_random.py <file>" random $sd "$tmp/f$sd.json" 1; done
  echo; run 'node test/independent/dump_configs.js <file>; python3 test/independent/compare_configs.py <file>' configs "$tmp/c.json"
  echo; run 'node test/independent/dump_configs.js <file> 5; python3 test/independent/compare_configs.py <file>' configs "$tmp/cv.json" 5
  echo; run 'node test/sections.test.js' node test/sections.test.js
}
sheets() {   # the checks of the first lane that drive a browser, each into its piece of browser.txt
  { run 'python3 test/values.py' python3 test/values.py; } > "$tmp/b1.txt" 2>&1
  { echo; run 'python3 test/values.py 1280 760' python3 test/values.py 1280 760; } > "$tmp/b2.txt" 2>&1
  { echo; run 'python3 test/values.py 400 800' python3 test/values.py 400 800; } > "$tmp/b3.txt" 2>&1
  { echo; run 'python3 test/typed.py' python3 test/typed.py; } > "$tmp/b3t.txt" 2>&1
}
second() {
  { echo; run 'python3 test/menu.py' python3 test/menu.py; } > "$tmp/b4.txt" 2>&1
  { echo; run 'python3 test/play.py <dir>' last python3 test/play.py "$tmp/play"; } > "$tmp/b5.txt" 2>&1
  { echo; run 'python3 test/stress.py' last python3 test/stress.py; } > "$tmp/b6.txt" 2>&1
  { echo; run 'python3 test/marks.py 300 1' python3 test/marks.py 300 1; } > "$tmp/b7.txt" 2>&1
  # further work for the second lane, given by the caller: its exit status counts like that of a check
  if [ -n "$extra" ]; then run 'the work given by the caller' bash -o pipefail -c "$extra" > "$tmp/b8.txt" 2>&1; fi
}
# the schedule: every label, without a start
DRY=1; builds; numeric > /dev/null; sheets; second; unset DRY

# status.txt: one line for the whole run, then every check with its exit status, then what was scheduled and has no result
summary() {
  local ends n bad miss nmiss nerr planned
  ends=$(sort -u "$tmp/ends" 2> /dev/null | wc -l); n=$(wc -l < "$list"); bad=$(grep -vc '^0	' "$list"); planned=$(wc -l < "$plan")
  miss=$(comm -23 <(sort "$plan") <(cut -f2- "$list" | sort)); nmiss=$(printf '%s' "$miss" | grep -c .)
  nerr=$(sort -u "$tmp/outerr" 2> /dev/null | wc -l)
  { echo "checks scheduled: $planned; with a result: $n; ended with another exit status than 0: $bad; scheduled and without a result: $nmiss; lanes that reached their end: $ends of 2; outputs that could not be written: $nerr"
    sed 's/^\([0-9]*\)\t/exit status \1: /' "$list"
    [ "$nmiss" -eq 0 ] || printf '%s\n' "$miss" | sed 's/^/no result: /'
    [ "$nerr" -eq 0 ] || sort -u "$tmp/outerr" | sed 's/^/output not written: /'; } > "$tmp/status.txt"
  cp "$tmp/status.txt" "$out/status.txt" 2> /dev/null || { echo "status.txt could not be written into $out"; nerr=$((nerr + 1)); }
  head -1 "$tmp/status.txt"; grep -v '^exit status 0: ' "$tmp/status.txt" | tail -n +2
  rm -rf "$tmp"
  [ "$bad" -eq 0 ] && [ "$ends" -eq 2 ] && [ "$nmiss" -eq 0 ] && [ "$nerr" -eq 0 ]
}
# the outputs must be files that can be written: a folder or a locked file at their place stops the run before it starts
for f in numeric.txt browser.txt status.txt; do
  if { [ -e "$out/$f" ] && [ ! -f "$out/$f" ]; } || ! { : > "$out/$f"; } 2> /dev/null; then
    echo "the output $out/$f cannot be written: no check was run"; rm -rf "$tmp"; exit 1
  fi
done

builds > /dev/null
if grep -qv '^0	' "$list"; then echo 'the build failed: no check was run'; summary; exit 1; fi

(
  numeric > "$out/numeric.txt" 2>&1 || echo "numeric.txt" >> "$tmp/outerr"
  sheets
  echo 'lane 1' >> "$tmp/ends"
) &
(
  second
  echo 'lane 2' >> "$tmp/ends"
) &
wait
cat "$tmp"/b1.txt "$tmp"/b2.txt "$tmp"/b3.txt "$tmp"/b3t.txt "$tmp"/b4.txt "$tmp"/b5.txt "$tmp"/b6.txt "$tmp"/b7.txt > "$out/browser.txt" 2> /dev/null || echo "browser.txt" >> "$tmp/outerr"
for f in numeric.txt browser.txt; do [ -f "$out/$f" ] && [ -s "$out/$f" ] || echo "$f" >> "$tmp/outerr"; done
summary
