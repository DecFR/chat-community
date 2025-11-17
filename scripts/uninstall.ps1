<#
.SYNOPSIS
  Uninstall helper for Chat-Community on Windows/PowerShell hosts.

DESCRIPTION
  This script helps to remove application files and optionally drop database or
  remove service entries. It's conservative and will prompt before destructive actions.

USAGE
  powershell -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1 [-Force] [-NoDbDrop] [-BackupDb <path>]
#>

param(
  [switch]$Force = $false,
  [switch]$NoDbDrop = $false,
  [string]$BackupDb = "",
  [switch]$DryRun = $false
)

function Confirm-Or-Exit($Message) {
  if ($Force -or $DryRun) { Write-Host "[Force/DryRun] $Message"; return }
  $r = Read-Host "$Message [y/N]"
  if ($r -notin @('y','Y')) { Write-Error "Aborted by user"; exit 1 }
}

Write-Host "== Chat-Community Uninstall (PowerShell) =="

$AppDir = "C:\opt\chat-community"
$StaticDir = "C:\var\www\chat-community\client"
$EnvFile = "C:\opt\chat-community\packages\api\.env"

if (Test-Path $AppDir) {
  Confirm-Or-Exit "Delete application directory '$AppDir'?"
  if (-not $DryRun) { Remove-Item -Recurse -Force -LiteralPath $AppDir }
  else { Write-Host "DRY-RUN: Remove-Item -Recurse -Force $AppDir" }
} else { Write-Host "App dir not found: $AppDir" }

if (Test-Path $StaticDir) {
  Confirm-Or-Exit "Delete static directory '$StaticDir'?"
  if (-not $DryRun) { Remove-Item -Recurse -Force -LiteralPath $StaticDir }
  else { Write-Host "DRY-RUN: Remove-Item -Recurse -Force $StaticDir" }
} else { Write-Host "Static dir not found: $StaticDir" }

if (Test-Path $EnvFile) {
  Confirm-Or-Exit "Remove env file '$EnvFile'?"
  if (-not $DryRun) { Remove-Item -Force -LiteralPath $EnvFile }
  else { Write-Host "DRY-RUN: Remove-Item -Force $EnvFile" }
}

if (-not $NoDbDrop) {
  # Windows DB operations vary; we will only prompt and optionally call pg_dump/psql if available
  if (Get-Command psql -ErrorAction SilentlyContinue) {
    Confirm-Or-Exit "Drop PostgreSQL database 'chat_community' and role 'chatuser'? This is irreversible."
    if ($BackupDb) {
      Write-Host "Creating backup to $BackupDb"
      if (-not $DryRun) { pg_dump -Fc -d "postgresql://postgres@localhost/chat_community" -f $BackupDb }
      else { Write-Host "DRY-RUN: pg_dump -Fc -d postgresql://postgres@localhost/chat_community -f $BackupDb" }
    }
    if (-not $DryRun) {
      psql -c "DROP DATABASE IF EXISTS \"chat_community\";"
      psql -c "DROP ROLE IF EXISTS chatuser;"
    }
  } else {
    Write-Host "psql not found on PATH; skipping DB drop."
  }
}

Write-Host "Uninstall script completed. Review leftovers (certificates, nginx equivalents) manually."
