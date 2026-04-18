#!/usr/bin/env bash
# scripts/demo.sh — End-to-end smoke walk-through for the §14 demo flow.
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8001}"
FOREMAN_EMAIL="${FOREMAN_EMAIL:-foreman@brueckesg.ch}"
PROCUREMENT_EMAIL="${PROCUREMENT_EMAIL:-procurement@comstruct.com}"
PASSWORD="${PASSWORD:-comstruct-demo}"

login() {
  local email="$1"
  curl -sS -X POST "$GATEWAY_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" \
    | jq -r .access_token
}

step() { printf "\n\033[36m[%s]\033[0m %s\n" "$1" "$2"; }

step 1 "Login as foreman ($FOREMAN_EMAIL)"
FOREMAN_TOK=$(login "$FOREMAN_EMAIL")

step 2 "List projects"
PROJECT_ID=$(curl -sS -H "Authorization: Bearer $FOREMAN_TOK" "$GATEWAY_URL/api/projects" | jq -r '.[0].id')
echo "  ✓ project: $PROJECT_ID"

step 3 "Smart Add — recommend products for task"
REC=$(curl -sS -X POST -H "Authorization: Bearer $FOREMAN_TOK" -H 'Content-Type: application/json' \
  "$GATEWAY_URL/api/ai/recommend" \
  -d '{"task":"Sanitärinstallation Bad 2.OG, Anschlüsse abdichten"}')
echo "  ✓ AI returned $(echo "$REC" | jq '.items|length') suggestions"

step 4 "Add first 2 suggestions to cart"
echo "$REC" | jq -c '.items[:2][]' | while read -r item; do
  PID=$(echo "$item" | jq -r .product_id)
  QTY=$(echo "$item" | jq -r .suggested_qty)
  curl -sS -X POST -H "Authorization: Bearer $FOREMAN_TOK" -H 'Content-Type: application/json' \
    "$GATEWAY_URL/api/cart/add" -d "{\"product_id\":\"$PID\",\"quantity\":$QTY}" >/dev/null
  echo "  ✓ added $(echo "$item" | jq -r .name)"
done

step 5 "Checkout"
CHECKOUT=$(curl -sS -X POST -H "Authorization: Bearer $FOREMAN_TOK" -H 'Content-Type: application/json' \
  "$GATEWAY_URL/api/orders/checkout" -d "{\"project_id\":\"$PROJECT_ID\"}")
ORDER_ID=$(echo "$CHECKOUT" | jq -r .id)
STATUS=$(echo "$CHECKOUT" | jq -r .status)
echo "  ✓ order $ORDER_ID — status: $STATUS"

if [ "$STATUS" = "pending_approval" ]; then
  step 6 "Login as procurement admin"
  PROC_TOK=$(login "$PROCUREMENT_EMAIL")
  step 7 "Approve order"
  curl -sS -X POST -H "Authorization: Bearer $PROC_TOK" "$GATEWAY_URL/api/orders/$ORDER_ID/approve" >/dev/null
  echo "  ✓ approved"
fi

step 8 "Final state"
curl -sS -H "Authorization: Bearer $FOREMAN_TOK" "$GATEWAY_URL/api/orders/$ORDER_ID" | jq '{id,status,total_amount,currency}'

echo -e "\n\033[32m🎉 demo flow complete.\033[0m"
