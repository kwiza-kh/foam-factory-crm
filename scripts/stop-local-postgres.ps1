$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$PgBin = if ($env:PG_BIN) { $env:PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$DataDir = Join-Path $Root '.postgres\data'

if (-not (Test-Path $PgCtl)) {
  throw "pg_ctl.exe not found: $PgCtl. Set PG_BIN to your PostgreSQL bin directory."
}

if (-not (Test-Path $DataDir)) {
  Write-Output 'Local PostgreSQL data directory does not exist.'
  exit 0
}

& $PgCtl -D $DataDir -m fast -w stop
