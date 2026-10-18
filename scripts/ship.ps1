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
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$ver = $pkg.version
$releaseDir = Join-Path $root "release"
$stageDir = Join-Path $releaseDir "staging-$ver"
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

$prevStage = Get-ChildItem $releaseDir -Directory -Filter "staging-*" | Where-Object { $_.Name -ne "staging-$ver" } | Sort-Object Name -Descending | Select-Object -First 1
if ($prevStage) {
    foreach ($notice in @("FONT-NOTICE.md", "THREE-LICENSE.txt")) {
        $srcNotice = Join-Path $prevStage.FullName $notice
        if (Test-Path $srcNotice) { Copy-Item $srcNotice (Join-Path $stageDir $notice) -Force }
    }
    $startHere = Join-Path $prevStage.FullName "START-HERE.txt"
    if (Test-Path $startHere) {
        $startContent = (Get-Content $startHere -Raw) -replace "WhizReveal \d+\.\d+\.\d+", "WhizReveal $ver"
        [System.IO.File]::WriteAllText((Join-Path $stageDir "START-HERE.txt"), $startContent)
    }
}

$builtExe = Join-Path $root "src-tauri\target\release\whizreveal.exe"
$builtSetup = Join-Path $root "src-tauri\target\release\bundle\nsis\WhizReveal_${ver}_x64-setup.exe"
if (Test-Path $builtExe) {
    Copy-Item $builtExe (Join-Path $stageDir "WhizReveal.exe") -Force
    Copy-Item $builtExe (Join-Path $releaseDir "WhizReveal.exe") -Force
}
if (Test-Path $builtSetup) {
    Copy-Item $builtSetup (Join-Path $releaseDir "WhizReveal-$ver-x64-setup.exe") -Force
}

$portableZip = Join-Path $releaseDir "WhizReveal-$ver-Windows-x64.zip"
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $portableZip -Force

Write-Host "==> Step 4: Staging and committing changes..." -ForegroundColor Cyan
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m $CommitMessage
} else {
    Write-Host "No unstaged changes to commit." -ForegroundColor Yellow
}

git archive --format=zip --output="release/WhizReveal-$ver-source.zip" HEAD
$sumLines = foreach ($assetName in @("WhizReveal-$ver-x64-setup.exe", "WhizReveal-$ver-Windows-x64.zip", "WhizReveal-$ver-source.zip")) {
    $assetPath = Join-Path $releaseDir $assetName
    if (Test-Path $assetPath) {
        "$((Get-FileHash $assetPath -Algorithm SHA256).Hash.ToLower())  $assetName"
    }
}
[System.IO.File]::WriteAllLines((Join-Path $releaseDir "SHA256SUMS-$ver.txt"), $sumLines)

Write-Host "==> Step 5: Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

# Extract version from package.json
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

    # Ensure release exists
    $releaseExists = gh release view $tag --repo ZengLLQ/whiz-reveal 2>&1
    if ($LASTEXITCODE -ne 0) {
        $notesFile = "release/RELEASE-NOTES-$($pkg.version).md"
        if (Test-Path $notesFile) {
            gh release create $tag --title "WhizReveal $($pkg.version)" --notes-file $notesFile --repo ZengLLQ/whiz-reveal
        } else {
            gh release create $tag --title "WhizReveal $($pkg.version)" --notes "Release $($pkg.version)" --repo ZengLLQ/whiz-reveal
        }
    }

    if (Test-Path $setupExe) {
        gh release upload $tag $setupExe $zipArchive $sourceZip $checksums --clobber --repo ZengLLQ/whiz-reveal
        Write-Host "==> Uploaded Windows assets to GitHub Release $tag successfully!" -ForegroundColor Green
    }

    Write-Host "==> Step 7: Triggering macOS universal build via GitHub Actions..." -ForegroundColor Cyan
    try {
        gh workflow run "macOS universal build" --ref $tag --repo ZengLLQ/whiz-reveal
        Write-Host "==> macOS universal build triggered on GitHub Actions runner!" -ForegroundColor Green
    } catch {
        Write-Host "macOS workflow will trigger automatically via tag push." -ForegroundColor Yellow
    }
}

Write-Host "==> All automated release steps completed successfully!" -ForegroundColor Green
