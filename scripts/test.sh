#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# Contract checks stay; once package.json exists we also typecheck and run
# node:test. Do not require live App Store / Play / third-party networks.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

echo "== iOS fixtures are recorded JSON, not live App Store =="
if [[ -d tests/fixtures/ios ]]; then
  ls tests/fixtures/ios/*.json >/dev/null 2>&1 \
    || fail "tests/fixtures/ios has no recorded JSON"
  grep -q '"Instagram"' tests/fixtures/ios/lookup-instagram-us.json \
    || fail "missing recorded iOS US listing fixture"
  grep -q '"im:rating"' tests/fixtures/ios/reviews-instagram-us-p1.json \
    || fail "missing recorded iOS US reviews fixture"
  grep -q '"Instagram"' tests/fixtures/ios/lookup-instagram-gb.json \
    || fail "missing recorded iOS GB listing fixture"
  grep -q '"im:rating"' tests/fixtures/ios/reviews-instagram-gb-p1.json \
    || fail "missing recorded iOS GB reviews fixture"
  if grep -RInE 'adapters/' src/http >/dev/null 2>&1; then
    fail "HTTP must call core/* only"
  fi
  if grep -RInE 'https?://itunes\.apple\.com|https?://apps\.apple\.com' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call Apple; HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/adapters src/core src/http >/dev/null 2>&1; then
    fail "live fetch() is not allowed; iOS stays on recorded fixtures"
  fi
fi

echo "== Play fixtures are recorded JSON, not live Google Play =="
if [[ -d tests/fixtures/play ]]; then
  ls tests/fixtures/play/*.json >/dev/null 2>&1 \
    || fail "tests/fixtures/play has no recorded JSON"
  grep -q '"YouTube"' tests/fixtures/play/details-youtube-us.json \
    || fail "missing recorded Play US listing fixture"
  grep -q '"score"' tests/fixtures/play/reviews-youtube-us-p1.json \
    || fail "missing recorded Play US reviews fixture"
  grep -q '"YouTube"' tests/fixtures/play/details-youtube-gb.json \
    || fail "missing recorded Play GB listing fixture"
  grep -q '"score"' tests/fixtures/play/reviews-youtube-gb-p1.json \
    || fail "missing recorded Play GB reviews fixture"
  if grep -RInE 'adapters/' src/http >/dev/null 2>&1; then
    fail "HTTP must call core/* only"
  fi
  if grep -RInE 'https?://play\.google\.com|https?://android\.clients\.google\.com' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call Play; HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/adapters src/core src/http >/dev/null 2>&1; then
    fail "live fetch() is not allowed; Play stays on recorded fixtures"
  fi
fi

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  ls tests/*.test.ts >/dev/null 2>&1 || fail "no tests/*.test.ts files"

  echo "== unit tests =="
  # Quoted so bash 3.2 does not eat **; Node 22's test runner expands the glob.
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  npx tsx --test --test-reporter spec 'tests/**/*.test.ts' | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*' "$test_log" \
    || fail "test runner reported 0 tests"
fi

echo "OK: buildable and testable"
