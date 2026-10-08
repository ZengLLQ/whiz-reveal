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
$verClean = $pkg.version.Replace(".", "")
$packScript = "release/package-v$verClean.py"
if (Test-Path $packScript) {
    python $packScript
} elseif (Test-Path "release/package-v160.py") {
    python release/package-v160.py
} elseif (Test-Path "release/package-v151.py") {
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
    $releaseExists = gh release view $tag --repo ZengLLQ/WhizReveal 2>&1
    if ($LASTEXITCODE -ne 0) {
        $notesFile = "release/RELEASE-NOTES-$($pkg.version).md"
        if (Test-Path $notesFile) {
            gh release create $tag --title "WhizReveal $($pkg.version)" --notes-file $notesFile --repo ZengLLQ/WhizReveal
        } else {
            gh release create $tag --title "WhizReveal $($pkg.version)" --notes "Release $($pkg.version)" --repo ZengLLQ/WhizReveal
        }
    }

    if (Test-Path $setupExe) {
        gh release upload $tag $setupExe $zipArchive $sourceZip $checksums --clobber --repo ZengLLQ/WhizReveal
        Write-Host "==> Uploaded Windows assets to GitHub Release $tag successfully!" -ForegroundColor Green
    }

    Write-Host "==> Step 7: Triggering macOS universal build via GitHub Actions..." -ForegroundColor Cyan
    try {
        gh workflow run "macOS universal build" --ref $tag --repo ZengLLQ/WhizReveal
        Write-Host "==> macOS universal build triggered on GitHub Actions runner!" -ForegroundColor Green
    } catch {
        Write-Host "macOS workflow will trigger automatically via tag push." -ForegroundColor Yellow
    }
}

Write-Host "==> All automated release steps completed successfully!" -ForegroundColor Green
