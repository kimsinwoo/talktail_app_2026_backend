const express = require("express");
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const db = require("../models");
const config = require('../config');
const { AppError } = require('../middlewares/errorHandler');

// user 1, pet 5 추가
router.get("/createUserPet", async (req, res, next) => {
  try {
    // 1. 회원가입: 아이디 "a", 비밀번호 "a"인 계정 생성
    const username = 'a';
    const password = 'a';
    const email = 'a@test.com';
    const name = '테스트 사용자';
    const phone = '010-1234-5678';
    const postcode = '12345';
    const address = '서울시 강남구';
    const detail_address = '테헤란로 123';

    // 이메일 중복 확인
    const existingByEmail = await db.User.findByPk(email);
    if (existingByEmail) {
      // 이미 존재하면 기존 사용자 사용
      console.log('이미 존재하는 사용자:', email);
    } else {
      // 아이디 중복 확인
      const existingByUsername = await db.User.findOne({ where: { username } });
      if (existingByUsername) {
        throw new AppError('이미 사용 중인 아이디입니다.', 409);
      }

      // 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);

      // 사용자 생성
      await db.User.create({
        email,
        username,
        password: hashedPassword,
        name,
        phone,
        postcode,
        address,
        detail_address,
        role: 'user',
        status: 'ACTIVE',
        isActive: true,
      });
      console.log('사용자 생성 완료:', email);
    }

    // 2. 펫 5마리 추가
    const userEmail = email;
    const pets = [
      {
        name: '뽀삐',
        species: 'dog',
        breed: '골든 리트리버',
        weight: '25',
        gender: 'male',
        neutering: 'yes',
        birthDate: '2020-01-15',
        admissionDate: '2024-01-01',
        veterinarian: '김수의사',
        diagnosis: '건강',
        medicalHistory: '특이사항 없음',
        state: '입원중',
      },
      {
        name: '나비',
        species: 'cat',
        breed: '페르시안',
        weight: '4.5',
        gender: 'female',
        neutering: 'yes',
        birthDate: '2021-03-20',
        admissionDate: '2024-02-15',
        veterinarian: '이수의사',
        diagnosis: '건강',
        medicalHistory: '특이사항 없음',
        state: '입원중',
      },
      {
        name: '초코',
        species: 'dog',
        breed: '비글',
        weight: '12',
        gender: 'male',
        neutering: 'no',
        birthDate: '2019-06-10',
        admissionDate: '2024-03-01',
        veterinarian: '박수의사',
        diagnosis: '건강',
        medicalHistory: '특이사항 없음',
        state: '입원중',
      },
      {
        name: '루이',
        species: 'cat',
        breed: '러시안 블루',
        weight: '5.2',
        gender: 'male',
        neutering: 'yes',
        birthDate: '2022-05-12',
        admissionDate: '2024-04-10',
        veterinarian: '최수의사',
        diagnosis: '건강',
        medicalHistory: '특이사항 없음',
        state: '입원중',
      },
      {
        name: '미미',
        species: 'dog',
        breed: '포메라니안',
        weight: '3.5',
        gender: 'female',
        neutering: 'yes',
        birthDate: '2021-08-25',
        admissionDate: '2024-05-01',
        veterinarian: '정수의사',
        diagnosis: '건강',
        medicalHistory: '특이사항 없음',
        state: '입원중',
      },
    ];

    const createdPets = [];
    for (const petData of pets) {
      // 펫 코드 생성
      const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
      const pet_code = `PET-${Date.now()}-${randomStr}`;

      // 기존 펫 확인 (이름과 사용자로)
      const existingPet = await db.Pet.findOne({
        where: {
          user_email: userEmail,
          name: petData.name,
        },
      });

      if (existingPet) {
        console.log('이미 존재하는 펫:', petData.name);
        createdPets.push(existingPet);
      } else {
        const pet = await db.Pet.create({
          pet_code,
          name: petData.name,
          species: petData.species,
          breed: petData.breed,
          weight: petData.weight,
          gender: petData.gender,
          neutering: petData.neutering,
          birthDate: petData.birthDate,
          admissionDate: petData.admissionDate,
          veterinarian: petData.veterinarian,
          diagnosis: petData.diagnosis,
          medicalHistory: petData.medicalHistory,
          user_email: userEmail,
          device_address: null,
          state: petData.state,
          image: null,
        });
        createdPets.push(pet);
        console.log('펫 생성 완료:', petData.name);
      }
    }

    res.status(200).json({
      success: true,
      message: '더미 데이터 생성 완료',
      data: {
        user: {
          email,
          username,
          name,
        },
        pets: createdPets.map(p => ({
          pet_code: p.pet_code,
          name: p.name,
          species: p.species,
          breed: p.breed,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// 상태 체크 더미데이터 추가
router.get("/createDaily", async (req, res, next) => {
  try {
    const userEmail = 'a@test.com';
    
    // 등록된 모든 펫 가져오기
    const pets = await db.Pet.findAll({
      where: { user_email: userEmail },
      order: [['createdAt', 'ASC']], // 첫 번째 펫이 정상 데이터
    });

    if (pets.length === 0) {
      return res.status(400).json({
        success: false,
        message: '등록된 펫이 없습니다. 먼저 createUserPet을 실행하세요.',
      });
    }

    const today = new Date();
    const createdRecords = [];

    // 각 펫마다 7일치 데이터 생성
    for (let petIndex = 0; petIndex < pets.length; petIndex++) {
      const pet = pets[petIndex];
      const isFirstPet = petIndex === 0; // 첫 번째 펫은 모두 정상

      for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - dayOffset);
        const dateStr = checkDate.toISOString().slice(0, 10);

        // 기존 데이터 확인
        const existing = await db.DailyCheck.findOne({
          where: { user_email: userEmail, pet_code: pet.pet_code, date: dateStr },
        });

        if (existing) {
          console.log(`이미 존재하는 데이터: ${pet.name} - ${dateStr}`);
          continue;
        }

        let dailyData;

        if (isFirstPet) {
          // 첫 번째 펫: 모두 정상 (1번 답안지만)
          dailyData = {
            user_email: userEmail,
            pet_code: pet.pet_code,
            date: dateStr,
            meal: 'good',
            meal_detail: null,
            meal_note: null,
            water: 'normal',
            water_detail: null,
            water_note: null,
            activity: 'similar',
            activity_detail: null,
            activity_note: null,
            sleep: 'normal',
            sleep_detail: null,
            sleep_note: null,
            poop: 'normal',
            poop_detail: null,
            poop_note: null,
            special: 'none',
            special_note: null,
          };
        } else {
          // 나머지 펫: 다양한 경우의 수
          const dayVariation = dayOffset % 7;
          
          // 식사 데이터
          let meal, mealDetail, mealNote;
          if (dayVariation === 0) {
            meal = 'good';
            mealDetail = null;
            mealNote = null;
          } else if (dayVariation === 1) {
            meal = 'less';
            mealDetail = 'half_more';
            mealNote = '아침 사료는 잘 먹었지만 저녁은 조금 덜 먹었어요';
          } else if (dayVariation === 2) {
            meal = 'less';
            mealDetail = 'half';
            mealNote = '간식은 잘 먹었습니다';
          } else if (dayVariation === 3) {
            meal = 'little';
            mealDetail = 'few_bites';
            mealNote = '특정 사료만 거부했어요';
          } else if (dayVariation === 4) {
            meal = 'little';
            mealDetail = 'smell_only';
            mealNote = '새로운 사료를 시도했어요';
          } else {
            meal = 'good';
            mealDetail = null;
            mealNote = null;
          }

          // 음수량 데이터
          let water, waterDetail, waterNote;
          if (dayVariation === 0 || dayVariation === 5) {
            water = 'normal';
            waterDetail = null;
            waterNote = null;
          } else if (dayVariation === 1) {
            water = 'less';
            waterDetail = 'slightly_less';
            waterNote = '날씨가 시원했어요';
          } else if (dayVariation === 2) {
            water = 'less';
            waterDetail = 'half';
            waterNote = null; // 상세 선택만으로 충분
          } else if (dayVariation === 3) {
            water = 'more';
            waterDetail = 'slightly_more';
            waterNote = '산책을 많이 했어요';
          } else if (dayVariation === 4) {
            water = 'more';
            waterDetail = 'noticeably_more';
            waterNote = '날씨가 더웠어요';
          } else {
            water = 'more';
            waterDetail = 'constantly_seeking';
            waterNote = null; // 상세 선택만으로 충분
          }

          // 활동량 데이터
          let activity, activityDetail, activityNote;
          if (dayVariation === 0 || dayVariation === 6) {
            activity = 'similar';
            activityDetail = null;
            activityNote = null;
          } else if (dayVariation === 1) {
            activity = 'more';
            activityDetail = 'more_active';
            activityNote = '새로운 장난감에 관심이 많았어요';
          } else if (dayVariation === 2) {
            activity = 'more';
            activityDetail = 'long_excited';
            activityNote = '방문객이 왔어요';
          } else if (dayVariation === 3) {
            activity = 'less';
            activityDetail = 'less_play';
            activityNote = '날씨가 흐렸어요';
          } else if (dayVariation === 4) {
            activity = 'less';
            activityDetail = 'mostly_resting';
            activityNote = null; // 상세 선택만으로 충분
          } else {
            activity = 'less';
            activityDetail = 'dull_response';
            activityNote = null; // 상세 선택만으로 충분
          }

          // 수면 패턴 데이터
          let sleep, sleepDetail, sleepNote;
          if (dayVariation === 0 || dayVariation === 5) {
            sleep = 'normal';
            sleepDetail = null;
            sleepNote = null;
          } else if (dayVariation === 1) {
            sleep = 'less';
            sleepDetail = 'woke_frequently';
            sleepNote = '소음이 있었어요';
          } else if (dayVariation === 2) {
            sleep = 'less';
            sleepDetail = 'couldnt_rest_day';
            sleepNote = null; // 상세 선택만으로 충분
          } else if (dayVariation === 3) {
            sleep = 'more';
            sleepDetail = 'mostly_resting';
            sleepNote = null; // 상세 선택만으로 충분
          } else if (dayVariation === 4) {
            sleep = 'more';
            sleepDetail = 'chose_sleep';
            sleepNote = null; // 상세 선택만으로 충분
          } else {
            sleep = 'less';
            sleepDetail = 'tried_stay_awake';
            sleepNote = null; // 상세 선택만으로 충분
          }

          // 배변 상태 데이터
          let poop, poopDetail, poopNote;
          if (dayVariation === 0 || dayVariation === 6) {
            poop = 'normal';
            poopDetail = null;
            poopNote = null;
          } else if (dayVariation === 1) {
            poop = 'slightly';
            poopDetail = 'loose';
            poopNote = '색은 정상이었어요';
          } else if (dayVariation === 2) {
            poop = 'slightly';
            poopDetail = 'frequency_different';
            poopNote = '평소보다 한 번 더 봤어요';
          } else if (dayVariation === 3) {
            poop = 'different';
            poopDetail = 'diarrhea';
            poopNote = '하루에 3번 정도 있었어요';
          } else if (dayVariation === 4) {
            poop = 'different';
            poopDetail = 'very_hard';
            poopNote = '변비가 있었어요';
          } else {
            poop = 'slightly';
            poopDetail = 'color_slightly';
            poopNote = null; // 상세 선택만으로 충분
          }

          // 특이사항
          let special, specialNote;
          if (dayVariation === 0 || dayVariation === 5 || dayVariation === 6) {
            special = 'none';
            specialNote = null;
          } else if (dayVariation === 1) {
            special = 'yes';
            specialNote = '기침을 몇 번 했어요. 큰 문제는 아니었어요';
          } else if (dayVariation === 2) {
            special = 'yes';
            specialNote = '발을 절뚝거렸어요. 산책 후에 그랬어요';
          } else if (dayVariation === 3) {
            special = 'yes';
            specialNote = '눈곱이 조금 있었어요';
          } else {
            special = 'yes';
            specialNote = '귀를 자주 긁었어요';
          }

          dailyData = {
            user_email: userEmail,
            pet_code: pet.pet_code,
            date: dateStr,
            meal,
            meal_detail: mealDetail,
            meal_note: mealNote,
            water,
            water_detail: waterDetail,
            water_note: waterNote,
            activity,
            activity_detail: activityDetail,
            activity_note: activityNote,
            sleep,
            sleep_detail: sleepDetail,
            sleep_note: sleepNote,
            poop,
            poop_detail: poopDetail,
            poop_note: poopNote,
            special,
            special_note: specialNote,
          };
        }

        const record = await db.DailyCheck.create(dailyData);
        createdRecords.push({
          pet_name: pet.name,
          date: dateStr,
          id: record.id,
        });
        console.log(`데이터 생성: ${pet.name} - ${dateStr}`);
      }
    }

    res.status(200).json({
      success: true,
      message: '더미 일일 체크 데이터 생성 완료',
      data: {
        total_records: createdRecords.length,
        records: createdRecords,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/createBoard", async(req,res,next) => {
  try {
    const { CommunityPost, CommunityComment, User } = db;
    
    // 관리자 계정 찾기 또는 생성
    let adminUser = await User.findOne({ where: { role: 'admin' } });
    if (!adminUser) {
      adminUser = await User.findOne({ where: { role: 'super_admin' } });
    }
    if (!adminUser) {
      // 테스트용 관리자 계정 생성
      adminUser = await User.create({
        email: 'admin@talktail.com',
        username: 'admin',
        password: await bcrypt.hash('admin123', 12),
        name: '관리자',
        role: 'admin',
        status: 'ACTIVE',
        isActive: true,
      });
    }
    
    const adminEmail = adminUser.email;
    
    // 더미 게시글 데이터
    const dummyPosts = [
      // 공지사항
      {
        boardType: 'notice',
        category: null,
        title: '[공지] 커뮤니티 이용 규칙 안내',
        content: '커뮤니티를 이용하시는 모든 분들께 안전하고 즐거운 공간을 제공하기 위한 이용 규칙을 안내드립니다.',
        authorEmail: adminEmail,
        views: 1234,
        likes: 45,
        comments: 12,
        isPinned: true,
      },
      {
        boardType: 'notice',
        category: null,
        title: '[공지] 시스템 점검 안내',
        content: '2026년 1월 25일 새벽 2시부터 4시까지 시스템 점검이 진행됩니다.',
        authorEmail: adminEmail,
        views: 856,
        likes: 23,
        comments: 5,
        isPinned: true,
      },
      {
        boardType: 'notice',
        category: null,
        title: '새로운 기능 업데이트 안내',
        content: '더 나은 서비스를 위해 새로운 기능이 추가되었습니다.',
        authorEmail: adminEmail,
        views: 567,
        likes: 34,
        comments: 8,
        isPinned: false,
      },
      // 정보 공유
      {
        boardType: 'share',
        category: '산책',
        title: '우리 강아지 산책 루트 공유해요!',
        content: '서울 한강공원에서 산책하는데 정말 좋아하더라구요. 다른 분들도 추천드려요!',
        authorEmail: adminEmail,
        views: 234,
        likes: 18,
        comments: 5,
        isPinned: false,
      },
      {
        boardType: 'share',
        category: '건강',
        title: '반려동물 건강 관리 팁',
        content: '정기적인 건강 체크가 얼마나 중요한지 경험을 통해 알게 되었어요.',
        authorEmail: adminEmail,
        views: 456,
        likes: 32,
        comments: 12,
        isPinned: false,
      },
      {
        boardType: 'share',
        category: '병원',
        title: '좋은 병원 추천받아요',
        content: '서울 강남구 근처에 믿을 만한 병원이 있을까요?',
        authorEmail: adminEmail,
        views: 189,
        likes: 7,
        comments: 9,
        isPinned: false,
      },
      // 콘테스트
      {
        boardType: 'contest',
        category: null,
        title: '🎉 1월 사진 콘테스트 - 우리 반려동물의 겨울 이야기',
        content: '겨울을 함께하는 반려동물의 모습을 사진으로 남겨주세요!',
        authorEmail: adminEmail,
        views: 3456,
        likes: 234,
        comments: 89,
        isPinned: true,
      },
      {
        boardType: 'contest',
        category: null,
        title: '12월 콘테스트 수상작 발표',
        content: '많은 참여 감사드립니다. 수상작을 확인해보세요!',
        authorEmail: adminEmail,
        views: 1234,
        likes: 156,
        comments: 45,
        isPinned: false,
      },
      {
        boardType: 'contest',
        category: null,
        title: '2월 콘테스트 주제 공개',
        content: '다음 달 콘테스트 주제를 미리 공개합니다!',
        authorEmail: adminEmail,
        views: 567,
        likes: 45,
        comments: 12,
        isPinned: false,
      },
      // 질문게시판
      {
        boardType: 'qna',
        category: '식사',
        title: '강아지가 밥을 안 먹어요. 어떻게 해야 할까요?',
        content: '최근에 밥을 잘 안 먹는데 건강에 문제가 있는 건 아닐까 걱정됩니다.',
        authorEmail: adminEmail,
        views: 123,
        likes: 5,
        comments: 8,
        isPinned: false,
      },
      {
        boardType: 'qna',
        category: '목욕',
        title: '고양이 목욕 주기는 어떻게 해야 하나요?',
        content: '처음 고양이를 키우는데 목욕을 얼마나 자주 시켜야 할지 모르겠어요.',
        authorEmail: adminEmail,
        views: 234,
        likes: 12,
        comments: 15,
        isPinned: false,
      },
      {
        boardType: 'qna',
        category: '보험',
        title: '반려동물 보험 가입하셨나요?',
        content: '보험 가입이 필요한지, 어떤 보험이 좋은지 조언 부탁드려요.',
        authorEmail: adminEmail,
        views: 345,
        likes: 23,
        comments: 19,
        isPinned: false,
      },
      // 관리 루틴 공유
      {
        boardType: 'routine',
        category: '산책',
        title: '우리 집 산책 루틴 공유해요',
        content: '아침 20분, 저녁 30분 산책을 유지하려고 노력하고 있어요. 산책을 꾸준히 하니까 활동량 체크할 때 큰 변화가 줄어든 것 같아요.',
        authorEmail: adminEmail,
        views: 234,
        likes: 18,
        comments: 5,
        isPinned: false,
      },
      {
        boardType: 'routine',
        category: '식사',
        title: '식사 시간 일정하게 맞추는 법',
        content: '매일 같은 시간에 급여하려고 알람을 맞춰두고 있어요. 시간이 일정해지니까 식사량도 들쭉날쭉하지 않더라고요.',
        authorEmail: adminEmail,
        views: 189,
        likes: 15,
        comments: 8,
        isPinned: false,
      },
      {
        boardType: 'routine',
        category: '기록',
        title: '체크리스트를 놓치지 않는 방법',
        content: '저는 자기 전에 꼭 작성하는 걸로 정했어요. 습관이 되니까 오히려 기록하는 게 마음이 편해요.',
        authorEmail: adminEmail,
        views: 156,
        likes: 12,
        comments: 6,
        isPinned: false,
      },
      {
        boardType: 'routine',
        category: '음수',
        title: '물그릇 위치 바꿨더니 좋아졌어요',
        content: '조용한 쪽으로 물그릇 위치를 옮겼더니 음수량이 조금 더 안정된 것 같아요.',
        authorEmail: adminEmail,
        views: 145,
        likes: 10,
        comments: 4,
        isPinned: false,
      },
      {
        boardType: 'routine',
        category: '활동',
        title: '주말 루틴 따로 관리하고 있어요',
        content: '주말에는 활동량이 많아져서 그걸 감안하고 체크하려고 하고 있어요.',
        authorEmail: adminEmail,
        views: 123,
        likes: 9,
        comments: 3,
        isPinned: false,
      },
      {
        boardType: 'routine',
        category: '기록',
        title: '작은 기록이 쌓이니까 다르네요',
        content: '예전엔 그냥 느낌으로만 기억했는데, 기록해보니까 패턴이 보이더라고요.',
        authorEmail: adminEmail,
        views: 178,
        likes: 14,
        comments: 7,
        isPinned: false,
      },
      // 우리 아이 패턴 발견
      {
        boardType: 'pattern',
        category: '활동량',
        title: '비 오는 날은 항상 활동량이 줄어요',
        content: '최근 기록을 보니까 비 오는 날에는 활동량이 확 줄어들더라고요.',
        authorEmail: adminEmail,
        views: 267,
        likes: 22,
        comments: 9,
        isPinned: false,
      },
      {
        boardType: 'pattern',
        category: '식사',
        title: '산책 많이 한 다음날 식사량 감소',
        content: '활동량이 많았던 날 다음날은 식사량이 조금 줄어드는 패턴이 보여요.',
        authorEmail: adminEmail,
        views: 198,
        likes: 16,
        comments: 7,
        isPinned: false,
      },
      {
        boardType: 'pattern',
        category: '수면',
        title: '병원 다녀온 뒤 수면 패턴 변화',
        content: '병원 다녀온 날 이후로 2~3일 정도 수면 시간이 늘어나는 경향이 있었어요.',
        authorEmail: adminEmail,
        views: 234,
        likes: 19,
        comments: 11,
        isPinned: false,
      },
      {
        boardType: 'pattern',
        category: '음수',
        title: '저녁 간식 주면 다음날 음수량 증가',
        content: '간식 양이 많았던 날 다음날 물을 더 마시는 것 같아요.',
        authorEmail: adminEmail,
        views: 167,
        likes: 13,
        comments: 5,
        isPinned: false,
      },
      {
        boardType: 'pattern',
        category: '식사',
        title: '날씨 더우면 식사량 감소',
        content: '더운 날엔 항상 식사량이 조금 줄어드는 패턴이 반복되고 있어요.',
        authorEmail: adminEmail,
        views: 189,
        likes: 15,
        comments: 8,
        isPinned: false,
      },
      {
        boardType: 'pattern',
        category: '활동량',
        title: '주말엔 항상 컨디션이 좋아요',
        content: '주말엔 제가 집에 오래 있어서 그런지 활동량과 식사량이 안정적이에요.',
        authorEmail: adminEmail,
        views: 145,
        likes: 11,
        comments: 6,
        isPinned: false,
      },
    ];
    
    // 기존 게시글 삭제 (외래 키 제약 조건 때문에 순서대로 삭제)
    // 먼저 댓글과 좋아요를 삭제한 후 게시글 삭제
    await db.CommunityComment.destroy({ where: {} });
    await db.CommunityPostLike.destroy({ where: {} });
    await db.CommunityPost.destroy({ where: {} });
    
    // 게시글 생성
    const createdPosts = await CommunityPost.bulkCreate(dummyPosts);
    
    // 일부 게시글에 댓글 추가
    if (createdPosts.length > 0) {
      const comments = [
        {
          postId: createdPosts[0].id,
          authorEmail: adminEmail,
          content: '정말 유용한 정보 감사합니다!',
          likes: 5,
        },
        {
          postId: createdPosts[0].id,
          authorEmail: adminEmail,
          content: '저도 비슷한 경험이 있어요. 도움이 되셨다니 다행입니다.',
          likes: 3,
        },
        {
          postId: createdPosts[0].id,
          authorEmail: adminEmail,
          content: '추가로 궁금한 점이 있는데, 혹시 더 자세히 알려주실 수 있나요?',
          likes: 2,
        },
      ];
      
      await CommunityComment.bulkCreate(comments);
      
      // 댓글 수 업데이트
      await createdPosts[0].update({ comments: 3 });
    }
    
    res.json({
      success: true,
      message: '커뮤니티 게시판 더미데이터가 생성되었습니다',
      data: {
        total_posts: createdPosts.length,
        posts: createdPosts.map(p => ({
          id: p.id,
          boardType: p.boardType,
          title: p.title,
        })),
      },
    });
  } catch(e) {
    console.error(e);
    next(e);
  }
})

router.get("/createDiary", async(req, res, next) => {
  try {
    const userEmail = 'a@test.com';
    
    // 등록된 모든 펫 가져오기
    const pets = await db.Pet.findAll({
      where: { user_email: userEmail },
      order: [['createdAt', 'ASC']],
    });

    if (pets.length === 0) {
      return res.status(400).json({
        success: false,
        message: '등록된 펫이 없습니다. 먼저 createUserPet을 실행하세요.',
      });
    }

    const today = new Date();
    const createdDiaries = [];

    // 각 펫별로 7~10일치 일기 생성
    for (const pet of pets) {
      const daysToCreate = 7 + Math.floor(Math.random() * 4); // 7~10일
      const petName = pet.name;
      const petSpecies = pet.species; // 'dog' or 'cat'
      
      // 펫별 일기 템플릿
      const diaryTemplates = {
        '뽀삐': {
          titles: [
            '뽀삐와 함께한 산책',
            '뽀삐의 건강한 하루',
            '뽀삐가 좋아하는 간식',
            '뽀삐와 공원에서',
            '뽀삐의 활발한 모습',
            '뽀삐와 저녁 산책',
            '뽀삐의 식사 시간',
            '뽀삐와 놀아주기',
            '뽀삐의 수면 패턴',
            '뽀삐의 일상',
          ],
          contents: [
            '오늘도 뽀삐와 함께 산책을 나갔어요. 날씨가 좋아서 더 오래 걸었네요.',
            '뽀삐가 오늘도 밥을 잘 먹었어요. 건강한 모습이 보기 좋습니다.',
            '뽀삐가 좋아하는 간식을 주었더니 정말 좋아하더라구요.',
            '공원에서 뽀삐가 다른 강아지들과 잘 어울려 놀았어요.',
            '뽀삐가 오늘도 정말 활발하게 뛰어다녔어요.',
            '저녁에 뽀삐와 함께 산책을 나갔는데 날씨가 시원해서 좋았어요.',
            '뽀삐의 식사 시간이 일정해서 좋아요. 규칙적인 생활이 중요하죠.',
            '뽀삐와 집에서 놀아주었더니 정말 좋아하더라구요.',
            '뽀삐가 오늘도 충분히 잠을 잤는지 확인했어요.',
            '뽀삐의 하루하루가 건강하고 행복해 보여서 다행이에요.',
          ],
        },
        '나비': {
          titles: [
            '나비의 여유로운 하루',
            '나비와 함께한 오후',
            '나비의 식사 시간',
            '나비가 좋아하는 장난감',
            '나비의 수면 패턴',
            '나비와 창가에서',
            '나비의 건강 체크',
            '나비의 일상 관찰',
            '나비와 함께한 시간',
            '나비의 행복한 모습',
          ],
          contents: [
            '나비가 오늘도 여유롭게 하루를 보냈어요. 고양이답게 천천히 움직이네요.',
            '나비와 함께 오후 시간을 보냈어요. 창가에서 햇살을 즐기는 모습이 귀여워요.',
            '나비가 오늘도 밥을 잘 먹었어요. 식사량이 일정해서 좋습니다.',
            '나비가 좋아하는 장난감으로 놀아주었더니 관심을 보이더라구요.',
            '나비의 수면 패턴을 관찰했어요. 충분히 잠을 자는 것 같아요.',
            '나비가 창가에서 햇살을 즐기고 있었어요. 편안한 모습이었습니다.',
            '나비의 건강 상태를 체크했어요. 특별한 이상은 없어 보입니다.',
            '나비의 일상을 관찰했어요. 평소와 다름없이 건강해 보여요.',
            '나비와 함께 보낸 시간이 정말 소중했어요.',
            '나비가 행복해 보이는 모습을 보니 저도 기분이 좋아집니다.',
          ],
        },
        '초코': {
          titles: [
            '초코의 활발한 하루',
            '초코와 산책 나가기',
            '초코의 식사 관찰',
            '초코가 좋아하는 놀이',
            '초코의 건강 체크',
            '초코와 함께한 시간',
            '초코의 활동량',
            '초코의 일상 기록',
            '초코의 행복한 모습',
            '초코와 저녁 시간',
          ],
          contents: [
            '초코가 오늘도 정말 활발하게 움직였어요. 에너지가 넘치네요.',
            '초코와 함께 산책을 나갔어요. 좋아하는 루트로 걸었습니다.',
            '초코의 식사량을 관찰했어요. 평소와 비슷하게 잘 먹었어요.',
            '초코가 좋아하는 놀이를 해주었더니 정말 좋아하더라구요.',
            '초코의 건강 상태를 확인했어요. 특별한 문제는 없어 보입니다.',
            '초코와 함께 보낸 시간이 즐거웠어요.',
            '초코의 활동량이 오늘도 충분했어요. 운동이 중요하죠.',
            '초코의 일상을 기록했어요. 건강한 하루였습니다.',
            '초코가 행복해 보이는 모습을 보니 저도 기분이 좋아집니다.',
            '초코와 함께 저녁 시간을 보냈어요. 편안한 분위기였어요.',
          ],
        },
        '루이': {
          titles: [
            '루이의 조용한 하루',
            '루이와 함께한 오후',
            '루이의 식사 관찰',
            '루이의 수면 패턴',
            '루이의 건강 체크',
            '루이와 창가에서',
            '루이의 일상 기록',
            '루이의 행복한 모습',
            '루이와 함께한 시간',
            '루이의 여유로운 모습',
          ],
          contents: [
            '루이가 오늘도 조용하고 여유롭게 하루를 보냈어요.',
            '루이와 함께 오후 시간을 보냈어요. 편안한 분위기였습니다.',
            '루이의 식사량을 관찰했어요. 평소와 비슷하게 잘 먹었어요.',
            '루이의 수면 패턴을 확인했어요. 충분히 잠을 자는 것 같아요.',
            '루이의 건강 상태를 체크했어요. 특별한 이상은 없어 보입니다.',
            '루이가 창가에서 햇살을 즐기고 있었어요. 평화로운 모습이었어요.',
            '루이의 일상을 기록했어요. 건강한 하루였습니다.',
            '루이가 행복해 보이는 모습을 보니 저도 기분이 좋아집니다.',
            '루이와 함께 보낸 시간이 정말 소중했어요.',
            '루이의 여유로운 모습이 보기 좋아요. 건강해 보입니다.',
          ],
        },
        '미미': {
          titles: [
            '미미의 귀여운 하루',
            '미미와 함께한 산책',
            '미미의 식사 시간',
            '미미가 좋아하는 놀이',
            '미미의 건강 체크',
            '미미와 함께한 시간',
            '미미의 활동량',
            '미미의 일상 기록',
            '미미의 행복한 모습',
            '미미와 저녁 산책',
          ],
          contents: [
            '미미가 오늘도 정말 귀여운 모습으로 하루를 보냈어요.',
            '미미와 함께 산책을 나갔어요. 작은 다리로 열심히 걸었어요.',
            '미미의 식사 시간을 관찰했어요. 잘 먹는 모습이 귀여워요.',
            '미미가 좋아하는 놀이를 해주었더니 정말 좋아하더라구요.',
            '미미의 건강 상태를 확인했어요. 특별한 문제는 없어 보입니다.',
            '미미와 함께 보낸 시간이 즐거웠어요.',
            '미미의 활동량이 오늘도 적당했어요. 작은 몸으로 열심히 움직였어요.',
            '미미의 일상을 기록했어요. 건강한 하루였습니다.',
            '미미가 행복해 보이는 모습을 보니 저도 기분이 좋아집니다.',
            '미미와 함께 저녁 산책을 나갔어요. 날씨가 좋아서 좋았어요.',
          ],
        },
      };

      const templates = diaryTemplates[petName] || diaryTemplates['뽀삐'];
      const moods = ['happy', 'neutral', 'sad'];
      const weathers = ['sunny', 'cloudy', 'rainy'];
      const activities = [
        ['아침 산책', '간식 급여'],
        ['저녁 산책', '놀이'],
        ['산책', '식사', '수면'],
        ['활동', '식사'],
        ['산책', '간식'],
        ['놀이', '식사'],
        ['산책', '휴식'],
        ['식사', '수면'],
        ['활동', '간식'],
        ['산책', '놀이', '식사'],
      ];
      const checkpoints = [
        [{id: '1', label: '아침 산책', checked: true}, {id: '2', label: '식사', checked: true}],
        [{id: '1', label: '저녁 산책', checked: true}, {id: '2', label: '간식', checked: false}],
        [{id: '1', label: '산책', checked: true}, {id: '2', label: '식사', checked: true}, {id: '3', label: '수면', checked: true}],
        [{id: '1', label: '활동', checked: true}, {id: '2', label: '식사', checked: true}],
        [{id: '1', label: '산책', checked: true}, {id: '2', label: '간식', checked: true}],
        [{id: '1', label: '놀이', checked: true}, {id: '2', label: '식사', checked: true}],
        [{id: '1', label: '산책', checked: true}, {id: '2', label: '휴식', checked: true}],
        [{id: '1', label: '식사', checked: true}, {id: '2', label: '수면', checked: true}],
        [{id: '1', label: '활동', checked: true}, {id: '2', label: '간식', checked: false}],
        [{id: '1', label: '산책', checked: true}, {id: '2', label: '놀이', checked: true}, {id: '3', label: '식사', checked: true}],
      ];

      for (let dayOffset = daysToCreate - 1; dayOffset >= 0; dayOffset--) {
        const diaryDate = new Date(today);
        diaryDate.setDate(diaryDate.getDate() - dayOffset);
        const dateStr = diaryDate.toISOString().slice(0, 10);

        // 이미 해당 날짜에 일기가 있는지 확인
        const existingDiary = await db.Diary.findOne({
          where: {
            user_email: userEmail,
            pet_code: pet.pet_code,
            date: dateStr,
          },
        });

        if (existingDiary) {
          console.log(`이미 존재하는 일기: ${petName} - ${dateStr}`);
          continue;
        }

        // 랜덤하게 템플릿 선택
        const titleIndex = Math.floor(Math.random() * templates.titles.length);
        const contentIndex = Math.floor(Math.random() * templates.contents.length);
        const activityIndex = Math.floor(Math.random() * activities.length);
        const checkpointIndex = Math.floor(Math.random() * checkpoints.length);
        
        // 날씨와 기분은 랜덤하게 선택 (약간의 가중치 적용)
        const mood = moods[Math.floor(Math.random() * moods.length)];
        const weather = weathers[Math.floor(Math.random() * weathers.length)];

        const diary = await db.Diary.create({
          user_email: userEmail,
          pet_code: pet.pet_code,
          date: dateStr,
          title: templates.titles[titleIndex],
          content: templates.contents[contentIndex],
          mood: mood,
          weather: weather,
          activities: activities[activityIndex],
          photos: [],
          checkpoints: checkpoints[checkpointIndex],
        });

        createdDiaries.push({
          id: diary.id,
          pet_name: petName,
          date: dateStr,
          title: diary.title,
        });

        console.log(`일기 생성 완료: ${petName} - ${dateStr}`);
      }
    }

    res.json({
      success: true,
      message: '일기 더미데이터가 생성되었습니다',
      data: {
        total_diaries: createdDiaries.length,
        diaries_by_pet: pets.map(pet => ({
          pet_name: pet.name,
          pet_code: pet.pet_code,
          count: createdDiaries.filter(d => d.pet_name === pet.name).length,
        })),
        diaries: createdDiaries.slice(0, 20), // 처음 20개만 표시
      },
    });
  } catch(e) {
    console.error(e);
    next(e);
  }
})
module.exports = router;