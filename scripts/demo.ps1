#!/usr/bin/env pwsh
# scripts/demo.ps1 — End-to-end smoke walk-through for the §14 demo flow.
# Requires: docker compose stack already running, services healthy.
#
# Usage:
#   pwsh ./scripts/demo.ps1
#   pwsh ./scripts/demo.ps1 -GatewayUrl http://localhost:8001

[CmdletBinding()]
param(
  [string]$GatewayUrl = 'http://localhost:8001',
  [string]$ForemanEmail = 'foreman@brueckesg.ch',
  [string]$PmEmail = 'pm@brueckesg.ch',
  [string]$ProcurementEmail = 'procurement@comstruct.com',
  [string]$Password = 'comstruct-demo'
)

$ErrorActionPreference = 'Stop'

function Login($email) {
  $body = @{ email = $email; password = $Password } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post -Uri "$GatewayUrl/auth/login" -Body $body -ContentType 'application/json'
  return $r.access_token
}

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }

Step 1 "Login as foreman ($ForemanEmail)"
$foremanTok = Login $ForemanEmail
Write-Host "  ✓ token acquired"

Step 2 "List projects"
$projects = Invoke-RestMethod -Headers @{ Authorization = "Bearer $foremanTok" } -Uri "$GatewayUrl/api/projects"
$projectId = $projects[0].id
Write-Host "  ✓ project: $($projects[0].name) [$projectId]"

Step 3 "Smart Add — recommend products for task"
$rec = Invoke-RestMethod -Method Post -Headers @{ Authorization = "Bearer $foremanTok" } `
  -Uri "$GatewayUrl/api/ai/recommend" -ContentType 'application/json' `
  -Body (@{ task = 'Sanitärinstallation Bad 2.OG, Anschlüsse abdichten' } | ConvertTo-Json)
Write-Host "  ✓ AI returned $($rec.items.Count) suggestions"

Step 4 "Add first 2 suggestions to cart"
foreach ($it in $rec.items | Select-Object -First 2) {
  $body = @{ product_id = $it.product_id; quantity = $it.suggested_qty } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Headers @{ Authorization = "Bearer $foremanTok" } `
    -Uri "$GatewayUrl/api/cart/add" -ContentType 'application/json' -Body $body | Out-Null
  Write-Host "  ✓ added $($it.name)"
}

Step 5 "Checkout (creates order — may go pending_approval)"
$checkout = Invoke-RestMethod -Method Post -Headers @{ Authorization = "Bearer $foremanTok" } `
  -Uri "$GatewayUrl/api/orders/checkout" -ContentType 'application/json' `
  -Body (@{ project_id = $projectId } | ConvertTo-Json)
$orderId = $checkout.id
Write-Host "  ✓ order $orderId — status: $($checkout.status) — total: $($checkout.total_amount) $($checkout.currency)"

if ($checkout.status -eq 'pending_approval') {
  Step 6 "Login as procurement admin"
  $procTok = Login $ProcurementEmail
  Write-Host "  ✓ token acquired"

  Step 7 "Approve the order"
  Invoke-RestMethod -Method Post -Headers @{ Authorization = "Bearer $procTok" } `
    -Uri "$GatewayUrl/api/orders/$orderId/approve" | Out-Null
  Write-Host "  ✓ approved"
}

Step 8 "Final order state"
$final = Invoke-RestMethod -Headers @{ Authorization = "Bearer $foremanTok" } -Uri "$GatewayUrl/api/orders/$orderId"
Write-Host "  ✓ status: $($final.status)" -ForegroundColor Green

Write-Host "`n🎉 demo flow complete." -ForegroundColor Green
