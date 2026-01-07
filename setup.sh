#!/bin/bash

echo "========================================"
echo " SecureChat - Blockchain Setup Script"
echo "========================================"
echo ""

echo "[1/5] Installing Backend Dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Backend installation failed"
    exit 1
fi
echo "✅ Backend dependencies installed"
echo ""

echo "[2/5] Installing Frontend Dependencies..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend installation failed"
    exit 1
fi
echo "✅ Frontend dependencies installed"
echo ""

echo "[3/5] Setting up Environment Files..."
cd ../backend
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created backend/.env"
else
    echo "⚠️  backend/.env already exists, skipping"
fi

cd ../frontend
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created frontend/.env"
else
    echo "⚠️  frontend/.env already exists, skipping"
fi
echo ""

echo "[4/5] Compiling Smart Contract..."
cd ../backend
npx hardhat compile
if [ $? -ne 0 ]; then
    echo "⚠️  Smart contract compilation failed (you can do this manually later)"
else
    echo "✅ Smart contract compiled"
fi
echo ""

echo "[5/5] Setup Complete!"
echo ""
echo "========================================"
echo " Next Steps:"
echo "========================================"
echo ""
echo "1. Start Ganache (Terminal 1):"
echo "   cd backend"
echo "   npm run ganache"
echo ""
echo "2. Deploy Contract (Terminal 2):"
echo "   cd backend"
echo "   npm run deploy:hardhat"
echo "   (Copy contract address to .env files)"
echo ""
echo "3. Start Backend (Terminal 3):"
echo "   cd backend"
echo "   npm start"
echo ""
echo "4. Start Frontend (Terminal 4):"
echo "   cd frontend"
echo "   npm start"
echo ""
echo "5. Configure MetaMask:"
echo "   - Add Ganache network (Chain ID: 1337)"
echo "   - Import test account from Ganache"
echo ""
echo "========================================"
echo " For detailed instructions, see:"
echo " - QUICKSTART.md"
echo " - BLOCKCHAIN_SETUP.md"
echo "========================================"
echo ""

cd ..
