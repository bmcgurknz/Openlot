# End-to-end Procore OpenLot lifecycle against a demo-mode instance (PowerShell).
# Start the server first in another window:  npm run dev:demo
$ErrorActionPreference = 'Stop'
$B = if ($env:BASE) { $env:BASE } else { 'http://localhost:4400' }
$P = 316
$json = @{ 'Content-Type' = 'application/json' }

Write-Host '== health =='
Invoke-RestMethod "$B/api/health" | ConvertTo-Json

Write-Host '== create a lot =='
$lot = Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/lots" -Headers $json -Body (@{
  workType = 'KF'; description = 'Road 2 kerb Ch 0000-0120 LHS'
  specReference = 'ITP-KF-01'; costCode = '06-110'; paymentItemNumber = '6.1'
  quantity = 120; uom = 'lm'
} | ConvertTo-Json)
Write-Host "created $($lot.id)"

Write-Host '== mark work complete, then see the blockers =='
Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/lots/$($lot.id)/transition" -Headers $json -Body '{"to":"work_complete"}' | Out-Null
Invoke-RestMethod "$B/api/projects/$P/lots/$($lot.id)/evaluation" | ConvertTo-Json -Depth 5

Write-Host '== pass LOT-EW-0014''s outstanding test and conform it =='
$dossier = Invoke-RestMethod "$B/api/projects/$P/lots/LOT-EW-0014"
$testId = $dossier.tests[0].id
Invoke-RestMethod -Method Patch -Uri "$B/api/tests/$testId" -Headers $json -Body '{"status":"passed"}' | Out-Null
Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/lots/LOT-EW-0014/transition" -Headers $json -Body '{"to":"conformed"}' | ConvertTo-Json -Depth 5

Write-Host '== create a claim period and run the gate =='
$claim = Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/claims" -Headers $json -Body (@{
  label = 'PC-14 2026-07'; periodStart = '2026-07-01'; periodEnd = '2026-07-31'
} | ConvertTo-Json)
Invoke-RestMethod "$B/api/projects/$P/claims/$($claim.id)/claimable" | ConvertTo-Json -Depth 5

Write-Host '== add the conformed lot; then prove double-claim prevention (LOT-EW-0012 is in PC-13) =='
Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/claims/$($claim.id)/lots" -Headers $json -Body '{"lotId":"LOT-EW-0014"}' | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "$B/api/projects/$P/claims/$($claim.id)/lots" -Headers $json -Body '{"lotId":"LOT-EW-0012"}'
} catch {
  Write-Host "Refused as expected: $($_.ErrorDetails.Message)"
}

Write-Host '== extract =='
(Invoke-WebRequest "$B/api/projects/$P/claims/$($claim.id)/extract.csv").Content
Write-Host "HTML report: $B/api/projects/$P/claims/$($claim.id)/extract.html"
