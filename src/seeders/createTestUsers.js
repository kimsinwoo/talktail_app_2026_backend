const bcrypt = require('bcryptjs');
const db = require('../models');
const config = require('../config');

async function createTestUsers() {
  try {
    console.log('🌱 Creating test users...');

    const hashedPassword = await bcrypt.hash('Test1234!@#$', config.security.bcryptRounds);

    // 관리자 계정
    const [admin, adminCreated] = await db.User.findOrCreate({
      where: { email: 'admin@talktail.com' },
      defaults: {
        email: 'admin@talktail.com',
        password: hashedPassword,
        name: '관리자',
        phone: '010-0000-0000',
        postcode: '00000',
        address: '서울시 강남구',
        detail_address: '테헤란로 123',
        role: 'admin',
        isActive: true,
      },
    });

    if (adminCreated) {
      console.log('✅ Admin user created: admin@talktail.com / Test1234!@#$');
    } else {
      console.log('ℹ️  Admin user already exists: admin@talktail.com');
    }

    // 업체 관리자 계정
    const [vendor, vendorCreated] = await db.User.findOrCreate({
      where: { email: 'vendor1@talktail.com' },
      defaults: {
        email: 'vendor1@talktail.com',
        password: hashedPassword,
        name: '업체관리자1',
        phone: '010-1111-1111',
        postcode: '11111',
        address: '서울시 강남구',
        detail_address: '테헤란로 456',
        role: 'vendor',
        isActive: true,
      },
    });

    if (vendorCreated) {
      console.log('✅ Vendor user created: vendor1@talktail.com / Test1234!@#$');
    } else {
      console.log('ℹ️  Vendor user already exists: vendor1@talktail.com');
    }

    // 일반 사용자 계정
    const [user, userCreated] = await db.User.findOrCreate({
      where: { email: 'user@talktail.com' },
      defaults: {
        email: 'user@talktail.com',
        password: hashedPassword,
        name: '일반사용자',
        phone: '010-2222-2222',
        postcode: '22222',
        address: '서울시 강남구',
        detail_address: '테헤란로 789',
        role: 'user',
        isActive: true,
      },
    });

    if (userCreated) {
      console.log('✅ User created: user@talktail.com / Test1234!@#$');
    } else {
      console.log('ℹ️  User already exists: user@talktail.com');
    }

    // 장바구니 생성
    if (adminCreated) {
      await db.Cart.findOrCreate({
        where: { user_email: admin.email },
        defaults: { user_email: admin.email },
      });
    }
    if (vendorCreated) {
      await db.Cart.findOrCreate({
        where: { user_email: vendor.email },
        defaults: { user_email: vendor.email },
      });
    }
    if (userCreated) {
      await db.Cart.findOrCreate({
        where: { user_email: user.email },
        defaults: { user_email: user.email },
      });
    }

    console.log('\n📋 Test Accounts:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('관리자 계정:');
    console.log('  이메일: admin@talktail.com');
    console.log('  비밀번호: Test1234!@#$');
    console.log('  역할: admin (플랫폼 관리자)');
    console.log('');
    console.log('업체 관리자 계정:');
    console.log('  이메일: vendor1@talktail.com');
    console.log('  비밀번호: Test1234!@#$');
    console.log('  역할: vendor (업체 관리자)');
    console.log('');
    console.log('일반 사용자 계정:');
    console.log('  이메일: user@talktail.com');
    console.log('  비밀번호: Test1234!@#$');
    console.log('  역할: user (일반 사용자)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test users:', error);
    process.exit(1);
  }
}

// 직접 실행 시
if (require.main === module) {
  createTestUsers();
}

module.exports = createTestUsers;
