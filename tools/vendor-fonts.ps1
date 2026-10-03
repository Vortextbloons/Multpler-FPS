# Regenerates vendor/fonts/*.woff2 and vendor/fonts/fonts.css from Google Fonts.
# Run from anywhere:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\vendor-fonts.ps1
# Edit $families below if you change the families/weights requested by index.html.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$families = 'family=Barlow+Condensed:wght@400;500;600;700;800;900' +
            '&family=Barlow:wght@400;500;600;700' +
            '&family=IBM+Plex+Mono:wght@400;500;600'
$cssUrl = "https://fonts.googleapis.com/css2?$families&display=swap"
$fontsDir = Join-Path $PSScriptRoot '..\vendor\fonts'
New-Item -ItemType Directory -Force $fontsDir | Out-Null

$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

$css = & curl.exe -sS -A $ua $cssUrl
if ($LASTEXITCODE -ne 0) { throw "curl failed fetching CSS ($LASTEXITCODE)" }
$blocks = [regex]::Matches($css, '(?s)/\*\s*(?<subset>[a-z0-9-]+)\s*\*/\s*@font-face\s*\{(?<body>[^}]+)\}')
if ($blocks.Count -eq 0) { throw 'No @font-face blocks parsed from Google Fonts CSS' }

$keep = @('latin', 'latin-ext')
$out = New-Object System.Text.StringBuilder
[void]$out.AppendLine('/* Self-hosted copies of the Google Fonts used by the game. */')
[void]$out.AppendLine('/* Families: Barlow Condensed, Barlow, IBM Plex Mono (latin + latin-ext subsets). */')
[void]$out.AppendLine('/* Regenerate with tools/vendor-fonts.ps1 if you change the families/weights in index.html. */')
[void]$out.AppendLine('')

$kept = 0
foreach ($m in $blocks) {
  $subset = $m.Groups['subset'].Value
  if ($keep -notcontains $subset) { continue }
  $body = $m.Groups['body'].Value
  $family  = [regex]::Match($body, "font-family:\s*'([^']+)'").Groups[1].Value
  $style   = [regex]::Match($body, 'font-style:\s*(\w+)').Groups[1].Value
  $weight  = [regex]::Match($body, 'font-weight:\s*(\d+)').Groups[1].Value
  $url     = [regex]::Match($body, 'src:\s*url\((https://[^)]+)\)').Groups[1].Value
  $urange  = [regex]::Match($body, 'unicode-range:\s*([^;]+);?').Groups[1].Value
  if (-not $family -or -not $url) { throw "Could not parse block for subset '$subset'" }

  $slug = ($family.ToLower() -replace '\s+', '-')
  $file = "$slug-$weight-$subset.woff2"
  if ($style -ne 'normal') { $file = "$slug-$weight-$style-$subset.woff2" }

  $dest = Join-Path $fontsDir $file
  & curl.exe -sS -A $ua -o $dest $url
  if ($LASTEXITCODE -ne 0) { throw "curl failed fetching $url ($LASTEXITCODE)" }
  $kept++

  [void]$out.AppendLine('/* ' + $subset + ' */')
  [void]$out.AppendLine('@font-face {')
  [void]$out.AppendLine("  font-family: '$family';")
  [void]$out.AppendLine("  font-style: $style;")
  [void]$out.AppendLine("  font-weight: $weight;")
  [void]$out.AppendLine('  font-display: swap;')
  [void]$out.AppendLine("  src: url('$file') format('woff2');")
  if ($urange) { [void]$out.AppendLine('  unicode-range: ' + $urange + ';') }
  [void]$out.AppendLine('}')
  [void]$out.AppendLine('')
  Write-Host "vendored $file"
}

Set-Content -Path (Join-Path $fontsDir 'fonts.css') -Value $out.ToString() -Encoding UTF8
Write-Host "kept $kept font faces across $($keep.Count) subsets"