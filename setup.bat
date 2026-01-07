@echo off
echo ========================================
echo  SecureChat - Blockchain Setup Script
echo ========================================
echo.

echo [1/5] Installing Backend Dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Backend installation failed
    pause
    exit /b 1
)
echo ✅ Backend dependencies installed
echo.

echo [2/5] Installing Frontend Dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Frontend installation failed
    pause
    exit /b 1
)
echo ✅ Frontend dependencies installed
echo.

echo [3/5] Setting up Environment Files...
cd ..\backend
if not exist .env (
    copy .env.example .env
    echo ✅ Created backend\.env
) else (
    echo ⚠️  backend\.env already exists, skipping
)

cd ..\frontend
if not exist .env (
    copy .env.example .env
    echo ✅ Created frontend\.env
) else (
    echo ⚠️  frontend\.env already exists, skipping
)
echo.

echo [4/5] Compiling Smart Contract...
cd ..\backend
call npx hardhat compile
if %errorlevel% neq 0 (
    echo ⚠️  Smart contract compilation failed (you can do this manually later)
) else (
    echo ✅ Smart contract compiled
)
echo.

echo [5/5] Setup Complete!
echo.
echo ========================================
echo  Next Steps:
echo ========================================
echo.
echo 1. Start Ganache (Terminal 1):
echo    cd backend
echo    npm run ganache
echo.
echo 2. Deploy Contract (Terminal 2):
echo    cd backend
echo    npm run deploy:hardhat
echo    (Copy contract address to .env files)
echo.
echo 3. Start Backend (Terminal 3):
echo    cd backend
echo    npm start
echo.
echo 4. Start Frontend (Terminal 4):
echo    cd frontend
echo    npm start
echo.
echo 5. Configure MetaMask:
echo    - Add Ganache network (Chain ID: 1337)
echo    - Import test account from Ganache
echo.
echo ========================================
echo  For detailed instructions, see:
echo  - QUICKSTART.md
echo  - BLOCKCHAIN_SETUP.md
echo ========================================
echo.

cd ..
pause
