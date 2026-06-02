param(
  [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$PgBin = if ($env:PG_BIN) { $env:PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$InitDb = Join-Path $PgBin 'initdb.exe'
$PgCtl = Join-Path $PgBin 'pg_ctl.exe'
$Psql = Join-Path $PgBin 'psql.exe'

foreach ($exe in @($InitDb, $PgCtl, $Psql)) {
  if (-not (Test-Path $exe)) {
    throw "PostgreSQL executable not found: $exe. Set PG_BIN to your PostgreSQL bin directory."
  }
}

$EnvPath = Join-Path $Root '.env'
$envLine = Get-Content $EnvPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $envLine) {
  throw 'DATABASE_URL missing in .env'
}

$uri = [Uri]($envLine -replace '^DATABASE_URL=', '')
$userInfo = $uri.UserInfo.Split(':', 2)
$dbUser = $userInfo[0]
$dbPass = [Uri]::UnescapeDataString($userInfo[1])
$dbName = $uri.AbsolutePath.TrimStart('/')

if ($dbUser -ne 'postgres') {
  throw "Local PostgreSQL script expects DATABASE_URL user postgres, found $dbUser"
}

$PgRoot = Join-Path $Root '.postgres'
$DataDir = Join-Path $PgRoot 'data'
$LogPath = Join-Path $PgRoot 'postgres.log'
$PwFile = Join-Path $PgRoot 'pwfile.tmp'

New-Item -ItemType Directory -Force -Path $PgRoot | Out-Null

if (-not (Test-Path $DataDir)) {
  Set-Content -LiteralPath $PwFile -Value $dbPass -NoNewline -Encoding ascii
  try {
    & $InitDb -D $DataDir -U postgres --pwfile=$PwFile --auth=scram-sha-256 --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  } finally {
    Remove-Item -LiteralPath $PwFile -ErrorAction SilentlyContinue
  }
}

$conf = Join-Path $DataDir 'postgresql.conf'
$confText = Get-Content -LiteralPath $conf -Raw
if ($confText -notmatch "(?m)^port\s*=\s*$Port\b") {
  Add-Content -LiteralPath $conf -Value "`nport = $Port"
}
if ($confText -notmatch "(?m)^listen_addresses\s*=\s*'localhost'") {
  Add-Content -LiteralPath $conf -Value "listen_addresses = 'localhost'"
}

& $PgCtl -D $DataDir -l $LogPath -o "-p $Port" -w start
if ($LASTEXITCODE -ne 0) {
  $status = & $PgCtl -D $DataDir status
  if ($status -notmatch 'server is running') {
    throw 'pg_ctl start failed'
  }
}

$env:PGPASSWORD = $dbPass
$escapedDb = $dbName.Replace('"', '""')
$escapedDbLiteral = $dbName.Replace("'", "''")
$sql = "SELECT 'CREATE DATABASE ""$escapedDb""' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$escapedDbLiteral')\gexec"
$sql | & $Psql -h localhost -p $Port -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'database creation check failed' }

Write-Output "Local PostgreSQL is running on localhost:$Port with database $dbName."
