# LINE Music Class Manager

ระบบบริหารการเรียนการสอนดนตรีผ่าน LINE + Web Admin

## Stack
- Node.js / Express
- Firebase Firestore + Firebase Admin SDK
- LINE Messaging API
- LINE Login OAuth callback
- Render Hosting Free Plan
- GitHub deploy
- EJS Admin Web UI
- bcrypt password hash
- QR Code generation
- Excel import/export

## Start
```bash
cp .env.example .env
npm install
npm run seed:admin
npm run dev
```

เปิด `http://localhost:3000`

## Deploy Guide
อ่านไฟล์ `docs/BUILD_FROM_ZERO_TH.md`

## ไม่ใช้ Firebase Storage
โปรเจกต์นี้ไม่มี `storage.rules` และไม่ได้ใช้ Firebase Storage ตาม requirement
# line-music-class-manager
