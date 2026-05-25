# PowerShell script to initialize a GitHub repo and push the web/ folder to main branch
# Usage: edit the variables below, then run in PowerShell where this script lives.

$repoUrl = Read-Host "Enter the GitHub repo URL (https://github.com/yourname/repo.git)"
$userEmail = Read-Host "Your Git user email"
$userName = Read-Host "Your Git user name"

Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-Not (Test-Path -Path .git)) {
    git init
}
git config user.email $userEmail
git config user.name $userName
git add .
git commit -m "Add PWA prototype"
git branch -M main
git remote remove origin -ErrorAction SilentlyContinue
git remote add origin $repoUrl
git push -u origin main

Write-Host "Done. Now open your repo Settings → Pages and enable Pages from the main branch (root)."
