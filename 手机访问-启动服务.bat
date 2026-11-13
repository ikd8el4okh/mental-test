@echo off
cd /d "%~dp0"
echo.
echo ============================================================
echo  Clinical scale assessment - local server for phone / tablet
echo ============================================================
echo.
echo  1. Keep this window open while using the app.
echo  2. Phone and PC must be on the same Wi-Fi / LAN.
echo  3. Open this URL in the phone browser:
echo.
echo       http://PC-IP:8000/
echo.
echo     Your PC IPv4 address(es):
ipconfig | findstr /i "IPv4"
echo.
echo  4. If the phone cannot open the page, allow Python
echo     through Windows Firewall, or change 8000 below.
echo.
echo  Starting server... Press Ctrl+C to stop.
echo.
python -m http.server 8000
echo.
echo Server stopped.
pause
