<#
.SYNOPSIS
    Prepare et publie une nouvelle version de l'application Electron "ERP POS Desktop".

.DESCRIPTION
    Enchaine les etapes de release en une seule commande :
      1. verification du token GitHub (GH_TOKEN) et des pre-requis ;
      2. bump du numero de version dans package.json ;
      3. build (frontend Vite + processus principal Electron) ;
      4. publication de la release sur GitHub Releases (electron-builder --publish always),
         qui declenche ensuite l'auto-update des postes.

.PARAMETER Version
    Version cible au format x.y.z. Si omise, le numero de patch est incremente
    automatiquement (ex. 1.0.2 -> 1.0.3).

.PARAMETER SkipBuild
    Reutilise dist/ et dist-electron/ deja construits (ne relance pas le build).
    Utile pour un simple repackage.

.PARAMETER Commit
    Apres publication, commit + push du bump de version sur la branche courante.

.PARAMETER Yes
    Mode automatique : ne pose aucune question de confirmation.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1 -Version 1.0.3 -Commit -Yes

.NOTES
    Le token GitHub est d'abord lu dans la variable d'environnement GH_TOKEN.
    S'il est absent, le script tente de le recuperer automatiquement via la GitHub CLI
    ('gh auth token'), a condition d'etre deja connecte ('gh auth login').
    Sinon, definis-le manuellement :  $env:GH_TOKEN = 'ghp_...'   (scope 'repo')
#>
[CmdletBinding()]
param(
    [string]$Version,
    [switch]$SkipBuild,
    [switch]$Commit,
    [switch]$Yes
)

# NB : on ne met PAS $ErrorActionPreference='Stop'. Sous Windows PowerShell 5.1,
# le moindre avertissement de npm ecrit sur stderr deviendrait une erreur fatale
# (meme avec 2>&1). On controle donc les echecs via $LASTEXITCODE et des tests explicites.

# ---- Racine du depot (ce script vit dans <racine>/scripts) ----
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$RepoSlug  = 'cyrhinov-bit/hinovgroup-b2b'
$TagPrefix = 'v'

# ---------------------------------------------------------------- Helpers
function Step([string]$Msg) { Write-Host "`n==> $Msg" -ForegroundColor Cyan }
function Ok([string]$Msg)   { Write-Host "    OK  $Msg" -ForegroundColor Green }
function Warn([string]$Msg) { Write-Host "    !   $Msg" -ForegroundColor Yellow }
function Die([string]$Msg)  { Write-Host "    X   $Msg" -ForegroundColor Red; exit 1 }

# Execute une commande native, relaie ses sorties (y compris les avertissements stderr)
# et echoue proprement si le code de sortie est non nul.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][scriptblock]$Action,
        [switch]$Soft
    )
    & $Action 2>&1 | ForEach-Object { Write-Host ("    " + $_) }
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        if ($Soft) { Warn "$Label : code de sortie $code" }
        else       { Die  "$Label a echoue (code $code)." }
    }
    return $code
}

function Confirm-Or-Abort([string]$Question) {
    if ($Yes) { return }
    $answer = Read-Host "$Question [o/N]"
    if ($answer -notmatch '^(o|oui|y|yes)$') { Die 'Annule par l''utilisateur.' }
}

# ---------------------------------------------------------------- 1. Pre-requis
Step 'Verification des pre-requis'

if (-not (Test-Path (Join-Path $Root 'package.json'))) { Die 'package.json introuvable (mauvais dossier ?).' }

if (-not $env:GH_TOKEN) {
    # Tentative de recuperation automatique via la GitHub CLI (si installee et connectee)
    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($ghCmd) {
        $ghToken = (& gh auth token 2>$null | Out-String).Trim()
        if ($ghToken) {
            $env:GH_TOKEN = $ghToken
            Ok "GH_TOKEN recupere automatiquement via 'gh auth token'."
        }
    }
}
if (-not $env:GH_TOKEN) {
    Die "GH_TOKEN introuvable. Connecte-toi avec 'gh auth login', ou definis :`n         `$env:GH_TOKEN = 'ghp_...'   (PAT GitHub, scope 'repo')"
}
if ($env:GH_TOKEN -notmatch '^(ghp_|github_pat_|gho_|ghu_|ghs_)') { Warn 'GH_TOKEN ne ressemble pas a un token GitHub.' }

$who = (& curl.exe -s -H "Authorization: Bearer $env:GH_TOKEN" 'https://api.github.com/user' 2>$null | ConvertFrom-Json)
if (-not $who -or -not $who.login) { Die 'GH_TOKEN invalide, expire ou sans droits.' }
Ok "Token valide (compte : $($who.login))"

# L'application ne doit pas etre ouverte (sinon verrou de fichiers -> EPERM a l'empaquetage).
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ERP POS*' })
if ($running.Count -gt 0) {
    Warn "L'application semble ouverte ($($running[0].ProcessName)). Ferme-la pour eviter une erreur EPERM."
    Confirm-Or-Abort 'Continuer quand meme ?'
}

$branch = (& git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
if (-not $branch) { $branch = 'main' }
if ($branch -ne 'main') { Warn "Branche courante : '$branch' (le bump sera applique ici)." }

# ---------------------------------------------------------------- 2. Version
Step 'Calcul de la version'

$pkgPath = Join-Path $Root 'package.json'
$pkgRaw  = Get-Content -LiteralPath $pkgPath -Raw
$match   = [regex]::Match($pkgRaw, '"version"\s*:\s*"([^"]+)"')
if (-not $match.Success) { Die 'Champ "version" introuvable dans package.json.' }
$current = $match.Groups[1].Value

if ([string]::IsNullOrWhiteSpace($Version)) {
    $parts    = $current.Split('.')
    $parts[-1] = ([int]$parts[-1] + 1).ToString()
    $Version  = $parts -join '.'
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { Die "Version invalide : '$Version' (format attendu x.y.z)." }
if ($Version -eq $current) { Die "La version cible est identique a l'actuelle ($current)." }

$tag = "$TagPrefix$Version"
Write-Host "    Version actuelle : $current"
Write-Host "    Version cible    : $Version  (tag $tag)"

$httpCode = (& curl.exe -s -o NUL -w '%{http_code}' "https://api.github.com/repos/$RepoSlug/releases/tags/$tag" 2>$null)
if ($httpCode -eq '200') {
    Warn "La release '$tag' existe deja sur GitHub ; elle sera mise a jour."
    Confirm-Or-Abort 'Continuer ?'
}

# ---------------------------------------------------------------- 3. Bump
Step "Bump de package.json -> $Version"
$versionRx = [regex]'("version"\s*:\s*")[^"]+(")'
$newRaw    = $versionRx.Replace($pkgRaw, ('${1}' + $Version + '${2}'), 1)
[System.IO.File]::WriteAllText($pkgPath, $newRaw, (New-Object System.Text.UTF8Encoding($false)))
Ok 'package.json mis a jour.'

# ---------------------------------------------------------------- 4. Build
if ($SkipBuild) {
    Warn 'Build ignore (-SkipBuild) : reutilisation de dist/ et dist-electron/.'
    if (-not (Test-Path (Join-Path $Root 'dist')))          { Die 'dist/ introuvable.' }
    if (-not (Test-Path (Join-Path $Root 'dist-electron'))) { Die 'dist-electron/ introuvable.' }
} else {
    Step 'Build (frontend Vite + main Electron)'
    $env:ELECTRON = 'true'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

    $null = Invoke-Native 'electron:prepare'  { npm run electron:prepare }
    $null = Invoke-Native 'build frontend'    { npm run build }
    $null = Invoke-Native 'tsc main Electron' { npx tsc -p tsconfig.electron.json }
    Ok 'Build termine.'
}

# ---------------------------------------------------------------- 5. Publication
Step "Publication de la release $tag sur GitHub"
Confirm-Or-Abort "Publier $tag sur $RepoSlug ?"

$null = Invoke-Native 'electron-builder --publish' { npx electron-builder --win --publish always }
Ok "Release publiee : https://github.com/$RepoSlug/releases/tag/$tag"

# ---------------------------------------------------------------- 6. Commit (optionnel)
if ($Commit) {
    Step 'Commit + push du bump de version'
    $rc = 0
    $rc += Invoke-Native 'git add'    { git add package.json } -Soft
    $rc += Invoke-Native 'git commit' { git commit -m "chore(release): bump version $Version" } -Soft
    $rc += Invoke-Native 'git push'   { git push origin $branch } -Soft
    if ($rc -eq 0) { Ok 'Version commitee et poussee.' }
    else           { Warn 'Commit/push incomplet : verifie l''etat Git.' }
}

# ---------------------------------------------------------------- Resume
Step 'Termine'
Write-Host "    Version publiee : $Version"
Write-Host "    Release         : https://github.com/$RepoSlug/releases/tag/$tag"
Write-Host ''
Write-Host "    Les postes detecteront la mise a jour automatiquement (10 s apres demarrage, puis toutes les 4 h)."
Write-Host "    Pense a changer/regenerer ton GH_TOKEN s'il a circule."
