@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4175 in your browser.
echo Keep this window open while exploring.
start "" http://127.0.0.1:4175
node scripts\serve.mjs
pause
