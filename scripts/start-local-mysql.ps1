param(
  [int]$Port = 3306
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $Root '.env'
if (-not (Test-Path $EnvPath)) {
  throw '.env is missing. Copy .env.example to .env and set DATABASE_URL.'
}

$envLine = Get-Content $EnvPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $envLine) {
  throw 'DATABASE_URL missing in .env'
}

$uri = [Uri]($envLine -replace '^DATABASE_URL=', '')
if ($uri.Scheme -notin @('mysql', 'mariadb')) {
  throw "Local MySQL script expects mysql:// or mariadb:// DATABASE_URL, found $($uri.Scheme)://"
}

$userInfo = $uri.UserInfo.Split(':', 2)
$dbUser = [Uri]::UnescapeDataString($userInfo[0])
$dbPass = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { '' }
$dbName = $uri.AbsolutePath.TrimStart('/')
$dbHost = if ($uri.Host) { $uri.Host } else { 'localhost' }
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { $Port }

if (-not $dbUser -or -not $dbPass -or -not $dbName) {
  throw 'DATABASE_URL must include user, password, and database, for example mysql://foam_user:password@localhost:3306/foam_crm'
}

function Find-MySqlClient {
  if ($env:MYSQL_BIN) {
    $candidate = Join-Path $env:MYSQL_BIN 'mysql.exe'
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $pathCommand = Get-Command mysql.exe -ErrorAction SilentlyContinue
  if ($null -ne $pathCommand -and $pathCommand.Source) {
    return $pathCommand.Source
  }

  $searchRoots = @(
    'C:\Program Files\MySQL',
    'C:\Program Files (x86)\MySQL',
    'C:\Program Files\MariaDB*',
    'C:\xampp\mysql\bin',
    'C:\laragon\bin\mysql'
  )

  foreach ($root in $searchRoots) {
    $match = Get-ChildItem -Path $root -Recurse -Filter mysql.exe -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($null -ne $match -and $match.FullName) {
      return $match.FullName
    }
  }

  return $null
}

$mysql = Find-MySqlClient

if (-not $mysql -or -not (Test-Path $mysql)) {
  throw 'mysql.exe not found. Install MySQL, add it to PATH, or set MYSQL_BIN to your MySQL bin directory. Searched PATH, MYSQL_BIN, C:\Program Files\MySQL, C:\Program Files (x86)\MySQL, C:\Program Files\MariaDB*, C:\xampp\mysql\bin, and C:\laragon\bin\mysql.'
}

function Invoke-MySql {
  param(
    [string]$User,
    [string]$Password,
    [string]$Database,
    [string]$Sql
  )

  $defaultsPath = Join-Path ([System.IO.Path]::GetTempPath()) "foam-crm-mysql-$([Guid]::NewGuid().ToString('N')).cnf"
  $defaultsText = @(
    '[client]',
    'protocol=TCP',
    "host=$dbHost",
    "port=$dbPort",
    "user=$User",
    "password=$Password",
    'default-character-set=utf8mb4'
  ) -join "`n"

  Set-Content -LiteralPath $defaultsPath -Value $defaultsText -Encoding ascii
  try {
    $args = @(
      "--defaults-extra-file=$defaultsPath",
      '--batch',
      '--skip-column-names'
  )
    if ($Database) {
      $args += @($Database)
    }
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $Sql | & $mysql @args 2>&1
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  } finally {
    Remove-Item -LiteralPath $defaultsPath -Force -ErrorAction SilentlyContinue
  }
}

$testSql = 'SELECT 1;'
$testOutput = Invoke-MySql -User $dbUser -Password $dbPass -Database $dbName -Sql $testSql 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Output "MySQL is reachable on ${dbHost}:${dbPort} with database $dbName."
  exit 0
}

if (-not $env:MYSQL_ADMIN_USER -or -not $env:MYSQL_ADMIN_PASSWORD) {
  throw "Could not connect to MySQL database $dbName as $dbUser. Start MySQL and create the database/user, or set MYSQL_ADMIN_USER and MYSQL_ADMIN_PASSWORD so this script can create them."
}

$escapedDb = $dbName.Replace('`', '``')
$escapedUser = $dbUser.Replace("'", "''")
$escapedPass = $dbPass.Replace("'", "''")
$setupSql = @"
CREATE DATABASE IF NOT EXISTS ``$escapedDb`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$escapedUser'@'%' IDENTIFIED BY '$escapedPass';
CREATE USER IF NOT EXISTS '$escapedUser'@'localhost' IDENTIFIED BY '$escapedPass';
GRANT ALL PRIVILEGES ON ``$escapedDb``.* TO '$escapedUser'@'%';
GRANT ALL PRIVILEGES ON ``$escapedDb``.* TO '$escapedUser'@'localhost';
FLUSH PRIVILEGES;
"@

Invoke-MySql -User $env:MYSQL_ADMIN_USER -Password $env:MYSQL_ADMIN_PASSWORD -Database '' -Sql $setupSql
if ($LASTEXITCODE -ne 0) {
  throw 'MySQL database/user creation failed.'
}

$testOutput = Invoke-MySql -User $dbUser -Password $dbPass -Database $dbName -Sql $testSql
if ($LASTEXITCODE -ne 0) {
  throw 'MySQL database was created, but application user still cannot connect.'
}

Write-Output "MySQL is reachable on ${dbHost}:${dbPort} with database $dbName."
