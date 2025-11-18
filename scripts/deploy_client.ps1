param(
  [string]$RepoDir = 'D:\opt\chat-community',
  [string]$Branch = 'master',
  [string]$StaticDir = 'C:\inetpub\wwwroot\chat'
)

Write-Host "Deploying client from $RepoDir (branch: $Branch) -> $StaticDir"

if (-not (Test-Path $RepoDir)) {
  Write-Error "Repo dir $RepoDir not found. Aborting."
  exit 2
}

Set-Location $RepoDir

# Git pull/reset
git fetch origin --prune
git checkout $Branch
git reset --hard origin/$Branch
git clean -fd

# Ensure pnpm available
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Error "pnpm not found in PATH. Install pnpm or run this script in environment with pnpm."
  exit 3
}

pnpm install --frozen-lockfile

# Build. Use environment variable VITE_API_URL if provided, otherwise default to /api
if (-not $env:VITE_API_URL) { $env:VITE_API_URL = '/api' }
Write-Host "Building client with VITE_API_URL=$($env:VITE_API_URL)"
pnpm --filter client run build

# Copy files
if (-Not (Test-Path $StaticDir)) { New-Item -ItemType Directory -Path $StaticDir -Force | Out-Null }
# Remove existing files (be careful)
Get-ChildItem -Path $StaticDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$RepoDir\packages\client\dist\*" -Destination $StaticDir -Recurse -Force

Write-Host "Client files copied to $StaticDir"
Write-Host "If you use IIS, perform an app pool recycle or iisreset if needed."
