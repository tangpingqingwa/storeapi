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
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh llms.txt; do
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
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md llms.txt | grep -qiE 'utf-8|us-ascii' \
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
  grep -q '"im:name"' tests/fixtures/ios/charts-us-free-p1.json \
    || fail "missing recorded iOS US free charts fixture"
  grep -q '"Instagram"' tests/fixtures/ios/search-instagram-us-p1.json \
    || fail "missing recorded iOS search fixture"
  if grep -RInE 'adapters/' src/http >/dev/null 2>&1; then
    fail "HTTP must call core/* only"
  fi
  if grep -RInE 'https?://itunes\.apple\.com|https?://apps\.apple\.com' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call Apple; HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call fetch(); HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/adapters --glob '!**/http.ts' >/dev/null 2>&1; then
    fail "live fetch() must stay in adapters/http.ts"
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
  grep -q '"YouTube"' tests/fixtures/play/charts-us-free-p1.json \
    || fail "missing recorded Play US free charts fixture"
  grep -q '"YouTube"' tests/fixtures/play/search-youtube-us-p1.json \
    || fail "missing recorded Play search fixture"
  if grep -RInE 'adapters/' src/http >/dev/null 2>&1; then
    fail "HTTP must call core/* only"
  fi
  if grep -RInE 'https?://play\.google\.com|https?://android\.clients\.google\.com' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call Play; HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/core src/http >/dev/null 2>&1; then
    fail "core/http must not call fetch(); HTTP uses core/* only"
  fi
  if grep -RInE '\bfetch\s*\(' src/adapters --glob '!**/http.ts' >/dev/null 2>&1; then
    fail "live fetch() must stay in adapters/http.ts"
  fi
fi

echo "== live stores stay env-gated and off in CI =="
[[ -f src/adapters/http.ts ]] || fail "missing src/adapters/http.ts"
[[ -f src/adapters/index.ts ]] || fail "missing src/adapters/index.ts"
[[ -f tests/live-adapters.test.ts ]] || fail "missing tests/live-adapters.test.ts"
grep -q 'createLiveIosAdapter' src/adapters/ios.ts || fail "missing createLiveIosAdapter"
grep -q 'createLivePlayAdapter' src/adapters/play.ts || fail "missing createLivePlayAdapter"
grep -q 'createStoreAdapters' src/adapters/index.ts || fail "missing createStoreAdapters"
grep -q 'STOREAPI_LIVE_STORES' src/config.ts || fail "config missing STOREAPI_LIVE_STORES"
grep -q 'STOREAPI_FIXTURE_ONLY' src/config.ts || fail "config missing STOREAPI_FIXTURE_ONLY"
grep -q 'liveStoresEnabled' src/config.ts || fail "config missing liveStoresEnabled"
if grep -RInE 'createLive(Ios|Play)Adapter|createLiveHttpGet' src/core src/http src/mcp >/dev/null 2>&1; then
  fail "core/http/mcp must not construct live adapters; use createStoreAdapters"
fi
if grep -RInE 'STOREAPI_LIVE_STORES=1|STOREAPI_LIVE_STORES=true' .github >/dev/null 2>&1; then
  fail "CI must not enable STOREAPI_LIVE_STORES"
fi
if grep -RInE 'android\.clients\.google\.com' src >/dev/null 2>&1; then
  fail "do not call unofficial Play client hosts"
fi

echo "== MCP tools wrap core/* (PR 6) =="
[[ -f src/mcp/server.ts ]] || fail "missing src/mcp/server.ts"
[[ -f src/mcp/tools.ts ]] || fail "missing src/mcp/tools.ts"
[[ -f tests/mcp.test.ts ]] || fail "missing tests/mcp.test.ts"
[[ -f llms.txt ]] || fail "missing llms.txt"
grep -q 'get_app' src/mcp/tools.ts || fail "src/mcp/tools.ts missing get_app"
grep -q 'list_reviews' src/mcp/tools.ts || fail "src/mcp/tools.ts missing list_reviews"
grep -q 'keyword_search' src/mcp/tools.ts || fail "src/mcp/tools.ts missing keyword_search"
grep -q 'getApp' src/mcp/tools.ts || fail "get_app must call core/apps"
grep -q 'listReviews' src/mcp/tools.ts || fail "list_reviews must call core/reviews"
grep -q 'searchApps' src/mcp/tools.ts || fail "keyword_search must call core/search"
grep -q 'get_app' llms.txt || fail "llms.txt missing get_app"
grep -q 'list_reviews' llms.txt || fail "llms.txt missing list_reviews"
grep -q 'keyword_search' llms.txt || fail "llms.txt missing keyword_search"
grep -q 'When not to call' llms.txt || fail "llms.txt missing when-not-to-call"
grep -qi 'download estimate' llms.txt || fail "llms.txt missing download-estimate disclaimer"
grep -qi 'do not write metadata' llms.txt || fail "llms.txt missing write-metadata disclaimer"
if grep -RInE 'adapters/' src/mcp >/dev/null 2>&1; then
  fail "MCP must call core/* only"
fi
if grep -RInE 'https?://itunes\.apple\.com|https?://apps\.apple\.com|https?://play\.google\.com|https?://android\.clients\.google\.com' src/mcp >/dev/null 2>&1; then
  fail "src/mcp must not call Apple or Play hosts"
fi
if grep -RInE '\bfetch\s*\(' src/mcp >/dev/null 2>&1; then
  fail "live fetch() is not allowed in src/mcp; fixtures only"
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
  # Fixture adapters only — never hit live iTunes / Play.
  export STOREAPI_FIXTURE_ONLY=1
  unset STOREAPI_LIVE_STORES || true
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
