param(
    [string]$CommitMessage = "Update release build and installer"
)

$ErrorActionPreference = "Stop"
$root = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $root

Write-Host "==> Step 1: Running typecheck and tests..." -ForegroundColor Cyan
npm run typecheck
npm test

Write-Host "==> Step 2: Building Windows desktop installer..." -ForegroundColor Cyan
npm run desktop:build

Write-Host "==> Step 3: Packaging release bundles..." -ForegroundColor Cyan
if (Test-Path "release/package-v151.py") {
    python release/package-v151.py
}

Write-Host "==> Step 4: Staging and committing changes..." -ForegroundColor Cyan
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m $CommitMessage
} else {
    Write-Host "No unstaged changes to commit." -ForegroundColor Yellow
}

Write-Host "==> Step 5: Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

# Extract version from package.json
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$tag = "v$($pkg.version)"

# Check if tag needs updating
git tag -f $tag HEAD
git push -f origin $tag

Write-Host "==> Step 6: Updating GitHub Release..." -ForegroundColor Cyan
$token = (@"
protocol=https
host=github.com
"@ | git credential fill | Select-String "password=").Line.Replace("password=","").Trim()

if ($token) {
    $env:GH_TOKEN = $token
    $setupExe = "release/WhizReveal-$($pkg.version)-x64-setup.exe"
    $zipArchive = "release/WhizReveal-$($pkg.version)-Windows-x64.zip"
    $sourceZip = "release/WhizReveal-$($pkg.version)-source.zip"
    $checksums = "release/SHA256SUMS-$($pkg.version).txt"

    if (Test-Path $setupExe) {
        gh release upload $tag $setupExe $zipArchive $sourceZip $checksums --clobber --repo ZengLLQ/WhizReveal
        Write-Host "==> Uploaded assets to GitHub Release $tag successfully!" -ForegroundColor Green
    }
}

Write-Host "==> All automated release steps completed successfully!" -ForegroundColor Green
