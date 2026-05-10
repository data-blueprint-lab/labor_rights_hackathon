param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$srcRoot = Join-Path $Root 'src-data'
$outDir = Join-Path $Root 'data'
$outFile = Join-Path $outDir 'labor-rights-data.js'

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Convert-ToNumber {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $normalized = $Value.Trim().Replace(',', '.')
    try {
        return [double]::Parse($normalized, [System.Globalization.CultureInfo]::InvariantCulture)
    } catch {
        return $null
    }
}

function Load-CsvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Missing CSV file: $Path"
    }

    return Import-Csv -Path $Path
}

$employmentCsv = Get-ChildItem -Path $srcRoot -Recurse -File -Filter 'Employment rate by sex.csv' | Select-Object -First 1
$payCsv = Get-ChildItem -Path $srcRoot -Recurse -File -Filter 'Gender pay gap in unadjusted form.csv' | Select-Object -First 1
$povertyCsv = Get-ChildItem -Path $srcRoot -Recurse -File -Filter 'In-work at-risk-of-poverty rate by sex.csv' | Select-Object -First 1
$tenureCsv = Get-ChildItem -Path $srcRoot -Recurse -File -Filter 'Employed persons by job tenure.csv' | Select-Object -First 1
$hoursCsv = Get-ChildItem -Path $srcRoot -Recurse -File -Filter '*Mean weekly hours usually worked per employee by sex -- Annual.csv' | Select-Object -First 1

$employment = Load-CsvFile $employmentCsv.FullName | ForEach-Object {
    [pscustomobject]@{
        country = $_.geo
        year    = [int]$_.TIME_PERIOD
        sex     = $_.sex
        value   = (Convert-ToNumber $_.OBS_VALUE)
    }
}

$payGap = Load-CsvFile $payCsv.FullName | ForEach-Object {
    [pscustomobject]@{
        country = $_.geo
        year    = [int]$_.TIME_PERIOD
        value   = (Convert-ToNumber $_.OBS_VALUE)
    }
}

$poverty = Load-CsvFile $povertyCsv.FullName | ForEach-Object {
    [pscustomobject]@{
        country = $_.geo
        year    = [int]$_.TIME_PERIOD
        sex     = $_.sex
        value   = (Convert-ToNumber $_.OBS_VALUE)
    }
}

$tenure = Load-CsvFile $tenureCsv.FullName | ForEach-Object {
    [pscustomobject]@{
        country  = $_.geo
        year     = [int]$_.TIME_PERIOD
        sex      = $_.sex
        duration = $_.duration
        value    = (Convert-ToNumber $_.OBS_VALUE)
    }
}

$hours = Load-CsvFile $hoursCsv.FullName | ForEach-Object {
    [pscustomobject]@{
        country = $_.'ref_area.label'
        year    = [int]$_.time
        sex     = $_.'sex.label'
        value   = (Convert-ToNumber $_.obs_value)
        source  = $_.'source.label'
    }
}

$payload = [ordered]@{
    meta = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        datasets = [ordered]@{
            employment = $employment.Count
            payGap     = $payGap.Count
            poverty    = $poverty.Count
            tenure     = $tenure.Count
            hours      = $hours.Count
        }
    }
    employment = $employment
    payGap     = $payGap
    poverty    = $poverty
    tenure     = $tenure
    hours      = $hours
}

$json = $payload | ConvertTo-Json -Depth 6 -Compress
$content = "window.__LABOR_RIGHTS_DATA__ = $json;"
Set-Content -Path $outFile -Value $content -Encoding UTF8

Write-Host "Wrote $outFile"
