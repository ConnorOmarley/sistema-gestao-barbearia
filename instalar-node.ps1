$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dest = Join-Path $root 'bin'

New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host 'Buscando a versao LTS do Node.js...'
$index = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -TimeoutSec 30
$lts = $index | Where-Object { $_.lts } | Sort-Object date -Descending | Select-Object -First 1
$version = $lts.version

Write-Host "Baixando Node.js $version (LTS)..."
$zipUrl = "https://nodejs.org/dist/$version/node-$version-win-x64.zip"
$zip = Join-Path $env:TEMP "node-$version-win-x64.zip"
Invoke-WebRequest -Uri $zipUrl -OutFile $zip -TimeoutSec 900

Write-Host 'Extraindo...'
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force

$extracted = Get-ChildItem -LiteralPath $dest -Directory | Where-Object { $_.Name -like 'node-v*' }
foreach ($dir in $extracted) {
    Get-ChildItem -LiteralPath $dir.FullName -Force | Move-Item -Destination $dest -Force
    Remove-Item -LiteralPath $dir.FullName -Force -Recurse
}
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue

$nodeExe = Join-Path $dest 'node.exe'
if (Test-Path $nodeExe) {
    Write-Host 'Instalacao concluida com sucesso!'
    exit 0
} else {
    Write-Host '[ERRO] node.exe nao encontrado apos a extracao.'
    exit 1
}