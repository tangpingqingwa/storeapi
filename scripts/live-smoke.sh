#!/usr/bin/env bash
# Manual live walk of iTunes Lookup / RSS and public Play pages.
# Not called from scripts/test.sh or CI. Needs network.
# Starts a local process with STOREAPI_LIVE_STORES=1 and STOREAPI_FIXTURE_ONLY unset.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Instagram App Store id (documented iTunes Lookup / customerreviews RSS).
IOS_ID="${STOREAPI_LIVE_IOS_ID:-389801252}"
# YouTube package on the public Play listing page (no public reviews JSON).
PLAY_ID="${STOREAPI_LIVE_PLAY_ID:-com.google.android.youtube}"
PORT="${STOREAPI_LIVE_PORT:-}"
BASE_URL="${STOREAPI_LIVE_BASE_URL:-}"
BOOTSTRAP_KEY="${STOREAPI_BOOTSTRAP_KEY:-st_live_smoke_local}"
KEEP_SERVER=0
started_server=0
server_pid=""
db_path=""
server_log=""

usage() {
  cat <<'EOF'
Usage: bash scripts/live-smoke.sh

Starts a local StoreAPI with STOREAPI_LIVE_STORES=1 (STOREAPI_FIXTURE_ONLY unset)
and walks:
  GET /v1/apps/ios/{id}                 real iTunes Lookup JSON (US)
  GET /v1/apps/ios/{id}/reviews         real iTunes customerreviews RSS JSON
  GET /v1/apps/play/{id}                public Play listing HTML
  GET /v1/apps/play/{id}/reviews        listing or upstream_blocked (no public JSON)
  GET /v1/apps/ios/{id}?country=JP      422 country_unsupported
  GET /v1/apps/play/{id}?country=JP     422 country_unsupported

Env:
  STOREAPI_LIVE_BASE_URL   use an already-running server (do not start one)
  STOREAPI_LIVE_PORT       bind port when this script starts the server
  STOREAPI_LIVE_IOS_ID     numeric App Store id (default 389801252)
  STOREAPI_LIVE_PLAY_ID    Play package name (default com.google.android.youtube)
  STOREAPI_BOOTSTRAP_KEY   Bearer key inserted into the smoke sqlite file
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

pass_error() {
  echo "PASS-ERROR: $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

json_get() {
  # json_get path expr
  python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get(sys.argv[2], ""))' "$1" "$2"
}

json_path() {
  python3 -c 'import json,sys
obj=json.loads(sys.argv[1])
for key in sys.argv[2].split("."):
    if isinstance(obj, dict):
        obj=obj.get(key)
    else:
        obj=None
        break
if obj is None:
    print("")
elif isinstance(obj, (dict, list)):
    print(json.dumps(obj))
else:
    print(obj)
' "$1" "$2"
}

json_len() {
  python3 -c 'import json,sys
obj=json.loads(sys.argv[1])
for key in sys.argv[2].split("."):
    if isinstance(obj, dict):
        obj=obj.get(key)
    else:
        obj=None
        break
print(len(obj) if isinstance(obj, list) else 0)
' "$1" "$2"
}

has_forbidden_estimate() {
  python3 -c 'import json,sys
forbidden={"downloads","downloadCount","downloadEstimate","downloadsEstimate","revenue","revenueEstimate","estimatedDownloads","estimatedRevenue"}
def walk(value):
    if isinstance(value, dict):
        for k,v in value.items():
            if k in forbidden:
                return True
            if walk(v):
                return True
    elif isinstance(value, list):
        return any(walk(item) for item in value)
    return False
sys.exit(0 if walk(json.loads(sys.argv[1])) else 1)
' "$1"
}

assert_no_estimates() {
  local label="$1"
  local body="$2"
  if has_forbidden_estimate "$body"; then
    fail "$label includes a download/revenue estimate field"
  fi
}

request() {
  local method="$1"
  local path="$2"
  local out="$3"
  local url="${BASE_URL}${path}"
  local http
  http="$(
    curl -sS -X "$method" \
      -H "Authorization: Bearer ${BOOTSTRAP_KEY}" \
      -H "Accept: application/json" \
      -o "$out" \
      -w "%{http_code}" \
      "$url"
  )" || fail "curl failed for ${method} ${path}"
  echo "$http"
}

cleanup() {
  if [[ "$started_server" -eq 1 && -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$db_path" && -f "$db_path" ]]; then
    rm -f "$db_path" "${db_path}-wal" "${db_path}-shm"
  fi
  if [[ -n "$server_log" && -f "$server_log" ]]; then
    rm -f "$server_log"
  fi
}
trap cleanup EXIT

need_cmd curl
need_cmd python3
need_cmd npx

if [[ -z "${BASE_URL}" ]]; then
  if [[ -z "${PORT}" ]]; then
    PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
  fi
  BASE_URL="http://127.0.0.1:${PORT}"
  db_path="$(mktemp "${TMPDIR:-/tmp}/storeapi-live-smoke.XXXXXX.sqlite")"
  server_log="$(mktemp "${TMPDIR:-/tmp}/storeapi-live-smoke.XXXXXX.log")"
  echo "== starting local server on ${BASE_URL} =="
  (
    cd "$root"
    unset STOREAPI_FIXTURE_ONLY || true
    export STOREAPI_LIVE_STORES=1
    export STOREAPI_BOOTSTRAP_KEY="$BOOTSTRAP_KEY"
    export STOREAPI_DATABASE="$db_path"
    export PORT="$PORT"
    export NODE_ENV=development
    exec npx --yes tsx src/server.ts
  ) >"$server_log" 2>&1 &
  server_pid=$!
  started_server=1

  ready=0
  for _ in $(seq 1 50); do
    if ! kill -0 "$server_pid" >/dev/null 2>&1; then
      echo "---- server log ----" >&2
      cat "$server_log" >&2 || true
      fail "server exited before becoming ready"
    fi
    if curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.2
  done
  [[ "$ready" -eq 1 ]] || fail "server did not become ready on ${BASE_URL}/healthz"
else
  KEEP_SERVER=1
  BASE_URL="${BASE_URL%/}"
  echo "== using existing server ${BASE_URL} =="
  curl -fsS "${BASE_URL}/healthz" >/dev/null || fail "existing server is not healthy"
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storeapi-live-smoke.XXXXXX")"
trap 'cleanup; rm -rf "$tmp_dir"' EXIT

echo "== live flags =="
echo "STOREAPI_LIVE_STORES=1"
echo "STOREAPI_FIXTURE_ONLY is unset in the server process we started (or assumed unset on BASE_URL)"
echo "ios id=${IOS_ID}"
echo "play id=${PLAY_ID}"

echo "== GET /healthz =="
health_body="${tmp_dir}/health.json"
health_code="$(curl -sS -o "$health_body" -w "%{http_code}" "${BASE_URL}/healthz")"
[[ "$health_code" == "200" ]] || fail "/healthz returned ${health_code}"
[[ "$(json_get "$(cat "$health_body")" ok)" == "True" || "$(cat "$health_body")" == '{"ok":true}' ]] \
  || fail "/healthz body was not {ok:true}"
pass "/healthz 200"

echo "== iOS US listing (documented iTunes Lookup JSON) =="
ios_app="${tmp_dir}/ios-app.json"
ios_app_code="$(request GET "/v1/apps/ios/${IOS_ID}?country=US" "$ios_app")"
ios_app_body="$(cat "$ios_app")"
[[ "$ios_app_code" == "200" ]] || fail "iOS listing HTTP ${ios_app_code}: ${ios_app_body}"
[[ "$(json_path "$ios_app_body" data.store)" == "ios" ]] || fail "iOS listing store is not ios"
ios_name="$(json_path "$ios_app_body" data.name)"
[[ -n "$ios_name" ]] || fail "iOS listing missing name"
ios_rating="$(json_path "$ios_app_body" data.rating.average)"
[[ -n "$ios_rating" ]] || fail "iOS listing missing rating.average"
assert_no_estimates "iOS listing" "$ios_app_body"
[[ "$(json_path "$ios_app_body" meta.creditsCharged)" == "1" ]] || fail "iOS listing did not charge 1 credit"
pass "iOS US listing name=${ios_name} rating=${ios_rating} (iTunes Lookup)"

echo "== iOS US reviews (documented iTunes customerreviews RSS JSON) =="
ios_rev="${tmp_dir}/ios-reviews.json"
ios_rev_code="$(request GET "/v1/apps/ios/${IOS_ID}/reviews?country=US&page=1" "$ios_rev")"
ios_rev_body="$(cat "$ios_rev")"
[[ "$ios_rev_code" == "200" ]] || fail "iOS reviews HTTP ${ios_rev_code}: ${ios_rev_body}"
[[ "$(json_path "$ios_rev_body" data.country)" == "US" ]] || fail "iOS reviews country is not US"
[[ "$(json_path "$ios_rev_body" data.page)" == "1" ]] || fail "iOS reviews page is not 1"
review_count="$(json_len "$ios_rev_body" data.reviews)"
python3 -c 'import json,sys
page=json.loads(sys.argv[1])["data"]
if not isinstance(page.get("reviews"), list):
    raise SystemExit("reviews is not a list")
for review in page["reviews"]:
    stars=review.get("stars")
    body=review.get("body")
    if not isinstance(stars, int) or stars < 1 or stars > 5:
        raise SystemExit(f"invalid stars {stars!r}")
    if not isinstance(body, str):
        raise SystemExit("review body is not a string")
' "$ios_rev_body" || fail "iOS reviews failed star/body check"
assert_no_estimates "iOS reviews" "$ios_rev_body"
[[ "$(json_path "$ios_rev_body" meta.creditsCharged)" == "1" ]] || fail "iOS reviews did not charge 1 credit"
if [[ "$review_count" -eq 0 ]]; then
  pass "iOS US reviews via documented iTunes JSON RSS: empty feed (0 entries). None invented."
else
  pass "iOS US reviews page=1 count=${review_count} (iTunes RSS JSON)"
fi

echo "== Play US listing (public play.google.com HTML) =="
play_app="${tmp_dir}/play-app.json"
play_app_code="$(request GET "/v1/apps/play/${PLAY_ID}?country=US" "$play_app")"
play_app_body="$(cat "$play_app")"
if [[ "$play_app_code" == "200" ]]; then
  [[ "$(json_path "$play_app_body" data.store)" == "play" ]] || fail "Play listing store is not play"
  play_name="$(json_path "$play_app_body" data.name)"
  [[ -n "$play_name" ]] || fail "Play listing missing name"
  assert_no_estimates "Play listing" "$play_app_body"
  [[ "$(json_path "$play_app_body" meta.creditsCharged)" == "1" ]] || fail "Play listing did not charge 1 credit"
  pass "Play US listing name=${play_name} (public Play page)"
elif [[ "$play_app_code" == "503" ]]; then
  [[ "$(json_path "$play_app_body" error.code)" == "upstream_blocked" ]] \
    || fail "Play listing 503 without upstream_blocked: ${play_app_body}"
  [[ "$(json_path "$play_app_body" meta.creditsCharged)" == "0" ]] \
    || fail "Play listing upstream_blocked charged credits"
  pass_error "Play US listing upstream_blocked (public page blocked or unparseable; 0 credits)"
else
  fail "Play listing HTTP ${play_app_code}: ${play_app_body}"
fi

echo "== Play US reviews (no public reviews JSON — never invent) =="
play_rev="${tmp_dir}/play-reviews.json"
play_rev_code="$(request GET "/v1/apps/play/${PLAY_ID}/reviews?country=US&page=1" "$play_rev")"
play_rev_body="$(cat "$play_rev")"
if [[ "$play_rev_code" == "200" ]]; then
  review_count="$(json_len "$play_rev_body" data.reviews)"
  python3 -c 'import json,sys
page=json.loads(sys.argv[1])["data"]
for review in page["reviews"]:
    stars=review.get("stars")
    body=review.get("body")
    if not isinstance(stars, int) or stars < 1 or stars > 5:
        raise SystemExit(f"invalid stars {stars!r}")
    if not isinstance(body, str):
        raise SystemExit("review body is not a string")
' "$play_rev_body" || fail "Play reviews failed star/body check"
  assert_no_estimates "Play reviews" "$play_rev_body"
  [[ "$(json_path "$play_rev_body" meta.creditsCharged)" == "1" ]] || fail "Play reviews did not charge 1 credit"
  pass "Play US reviews page=1 count=${review_count} (only if public page yielded real reviews)"
elif [[ "$play_rev_code" == "503" ]]; then
  [[ "$(json_path "$play_rev_body" error.code)" == "upstream_blocked" ]] \
    || fail "Play reviews 503 without upstream_blocked: ${play_rev_body}"
  [[ "$(json_path "$play_rev_body" meta.creditsCharged)" == "0" ]] \
    || fail "Play reviews upstream_blocked charged credits"
  pass_error "Play US reviews upstream_blocked (no public reviews JSON; 0 credits; none invented)"
else
  fail "Play reviews HTTP ${play_rev_code}: ${play_rev_body}"
fi

echo "== country=JP is country_unsupported =="
jp_ios="${tmp_dir}/jp-ios.json"
jp_ios_code="$(request GET "/v1/apps/ios/${IOS_ID}?country=JP" "$jp_ios")"
jp_ios_body="$(cat "$jp_ios")"
[[ "$jp_ios_code" == "422" ]] || fail "iOS JP expected 422 got ${jp_ios_code}: ${jp_ios_body}"
[[ "$(json_path "$jp_ios_body" error.code)" == "country_unsupported" ]] \
  || fail "iOS JP error.code is not country_unsupported: ${jp_ios_body}"
[[ "$(json_path "$jp_ios_body" meta.creditsCharged)" == "0" ]] \
  || fail "iOS JP charged credits"
pass "iOS country=JP → 422 country_unsupported (0 credits)"

jp_play="${tmp_dir}/jp-play.json"
jp_play_code="$(request GET "/v1/apps/play/${PLAY_ID}?country=JP" "$jp_play")"
jp_play_body="$(cat "$jp_play")"
[[ "$jp_play_code" == "422" ]] || fail "Play JP expected 422 got ${jp_play_code}: ${jp_play_body}"
[[ "$(json_path "$jp_play_body" error.code)" == "country_unsupported" ]] \
  || fail "Play JP error.code is not country_unsupported: ${jp_play_body}"
[[ "$(json_path "$jp_play_body" meta.creditsCharged)" == "0" ]] \
  || fail "Play JP charged credits"
pass "Play country=JP → 422 country_unsupported (0 credits)"

echo "OK: live smoke walked iOS iTunes JSON + Play public page + JP country_unsupported"
if [[ "$KEEP_SERVER" -eq 0 ]]; then
  echo "(stopped the local live-stores process)"
fi
