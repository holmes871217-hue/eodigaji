@echo off
rem Double-click this file to open the app preview in your browser.
rem Close this black window to stop the preview.
start "" http://localhost:5173/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 5173
