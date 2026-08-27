@echo off
chcp 65001 >nul
echo 正在推送到 GitHub: https://github.com/apple595201908/DuckFindBaby.git ...
git push -u origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo  推送成功！請前往 GitHub 查看您的專案：
    echo  https://github.com/apple595201908/DuckFindBaby
    echo ========================================
) else (
    echo.
    echo [提醒] 若顯示 Repository not found，請先至 https://github.com/new 建立名為 DuckFindBaby 的儲存庫後再按任意鍵重試。
)
pause
