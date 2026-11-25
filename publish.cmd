@echo off
rem Отправить изменения сайта на GitHub вручную
cd /d "%~dp0"
git add -A
git commit -m "update"
git pull --rebase --autostash
git push
pause
