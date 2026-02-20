const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');

const router = express.Router();
router.use(verifyToken);

// 간단한 메모리 캐시 (프로덕션에서는 Redis 사용 권장)
const weatherCache = new Map();
const airQualityCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30분
const AIR_QUALITY_CACHE_DURATION = 60 * 60 * 1000; // 1시간 (대기질 데이터는 1시간마다 업데이트)

// 날씨 설명을 자연스러운 한국어로 변환하는 함수
function translateWeatherDescription(description, weatherId) {
  if (!description) return '알 수 없음';
  
  const desc = description.toLowerCase();
  
  // 잘못된 번역 수정
  const translationMap = {
    '튼구름': '흐림',
    'thick clouds': '흐림',
    'overcast clouds': '흐림',
    'broken clouds': '구름 많음',
    'scattered clouds': '구름 조금',
    'few clouds': '구름 조금',
    'clear sky': '맑음',
    'light rain': '가벼운 비',
    'moderate rain': '비',
    'heavy rain': '강한 비',
    'light snow': '가벼운 눈',
    'moderate snow': '눈',
    'heavy snow': '강한 눈',
    'mist': '안개',
    'fog': '안개',
    'haze': '연무',
  };
  
  // 직접 매핑 확인
  for (const [key, value] of Object.entries(translationMap)) {
    if (desc.includes(key)) {
      return value;
    }
  }
  
  // 날씨 ID 기반 매핑 (OpenWeatherMap 날씨 코드)
  if (weatherId) {
    const idMap = {
      200: '뇌우',
      201: '뇌우',
      202: '강한 뇌우',
      210: '약한 뇌우',
      211: '뇌우',
      212: '강한 뇌우',
      221: '불규칙한 뇌우',
      230: '뇌우와 이슬비',
      231: '뇌우와 이슬비',
      232: '강한 뇌우와 이슬비',
      300: '약한 이슬비',
      301: '이슬비',
      302: '강한 이슬비',
      310: '약한 이슬비',
      311: '이슬비',
      312: '강한 이슬비',
      313: '소나기와 이슬비',
      314: '강한 소나기와 이슬비',
      321: '소나기',
      500: '약한 비',
      501: '보통 비',
      502: '강한 비',
      503: '매우 강한 비',
      504: '극심한 비',
      511: '우박',
      520: '약한 소나기',
      521: '소나기',
      522: '강한 소나기',
      531: '불규칙한 소나기',
      600: '약한 눈',
      601: '눈',
      602: '강한 눈',
      611: '진눈깨비',
      612: '약한 진눈깨비',
      613: '진눈깨비',
      615: '약한 비와 눈',
      616: '비와 눈',
      620: '약한 눈 소나기',
      621: '눈 소나기',
      622: '강한 눈 소나기',
      701: '안개',
      711: '연기',
      721: '연무',
      731: '모래 먼지',
      741: '안개',
      751: '모래',
      761: '먼지',
      762: '화산재',
      771: '돌풍',
      781: '토네이도',
      800: '맑음',
      801: '구름 조금',
      802: '구름 많음',
      803: '구름 많음',
      804: '흐림',
    };
    
    if (idMap[weatherId]) {
      return idMap[weatherId];
    }
  }
  
  // 기본값: 원본 설명 반환 (이미 한국어일 수 있음)
  // 하지만 "튼구름" 같은 이상한 표현은 수정
  if (desc.includes('튼')) {
    return '흐림';
  }
  
  return description;
}

// 좌표 기반 지역명 추정 (간단한 매핑)
function getLocationName(latitude, longitude) {
  // 한국 주요 도시 좌표 범위 기반 추정
  if (latitude >= 37.4 && latitude <= 37.7 && longitude >= 126.8 && longitude <= 127.2) {
    return '서울';
  } else if (latitude >= 35.0 && latitude <= 35.3 && longitude >= 129.0 && longitude <= 129.3) {
    return '부산';
  } else if (latitude >= 35.1 && latitude <= 35.2 && longitude >= 126.7 && longitude <= 126.9) {
    return '광주';
  } else if (latitude >= 35.8 && latitude <= 36.0 && longitude >= 127.0 && longitude <= 127.2) {
    return '대전';
  } else if (latitude >= 35.5 && latitude <= 35.6 && longitude >= 129.3 && longitude <= 129.4) {
    return '울산';
  } else if (latitude >= 37.4 && latitude <= 37.6 && longitude >= 127.0 && longitude <= 127.2) {
    return '성남';
  } else if (latitude >= 37.5 && latitude <= 37.6 && longitude >= 126.6 && longitude <= 126.8) {
    return '인천';
  } else {
    // 기본값: 좌표 표시
    return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  }
}

// 더미 날씨 데이터 생성 (API 키가 없거나 유효하지 않을 때)
function generateDummyWeatherData(latitude, longitude) {
  const now = new Date();
  const hourly = [];
  
  // 24시간 더미 데이터 생성 (1시간 간격)
  for (let i = 0; i < 24; i++) {
    const hour = new Date(now);
    hour.setHours(now.getHours() + i);
    hourly.push({
      time: hour.toISOString(),
      hour: hour.getHours(),
      temperature: 20 + Math.floor(Math.random() * 10) - 5, // 15-25도
      humidity: 60 + Math.floor(Math.random() * 20), // 60-80%
      windSpeed: (0.8 + Math.random() * 0.6).toFixed(1), // 0.8-1.4 m/s (약 3-5 km/h)
      precipitation: Math.random() > 0.7 ? (Math.random() * 5).toFixed(1) : 0,
      snow: 0,
      weather: i % 3 === 0 ? '맑음' : i % 3 === 1 ? '구름 조금' : '흐림',
      weatherIcon: i % 3 === 0 ? '01d' : i % 3 === 1 ? '02d' : '03d',
      pm10: null,
      pm25: null,
    });
  }

  return {
    location: {
      latitude,
      longitude,
      address: getLocationName(latitude, longitude),
    },
    current: {
      temperature: hourly[0].temperature,
      humidity: hourly[0].humidity,
      windSpeed: hourly[0].windSpeed,
      weather: hourly[0].weather,
      weatherIcon: hourly[0].weatherIcon,
      pm10: null,
      pm25: null,
    },
    hourly,
    fetchedAt: new Date().toISOString(),
  };
}

// OpenWeatherMap API 호출 함수 (무료 플랜 사용)
async function fetchWeatherFromAPI(latitude, longitude) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  
  // API 키가 없거나 'dummy'로 설정되어 있으면 더미 데이터 반환
  if (!apiKey || apiKey === 'dummy' || apiKey.trim() === '') {
    console.warn('[Weather] API 키가 없어 더미 데이터를 사용합니다.');
    return generateDummyWeatherData(latitude, longitude);
  }

  try {
    // 먼저 One Call API 2.5 시도 (1시간 단위, 무료 플랜에서 사용 가능할 수 있음)
    try {
      const oneCallResponse = await axios.get('https://api.openweathermap.org/data/2.5/onecall', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'kr',
          exclude: 'minutely,daily,alerts', // 시간대별만 필요
        },
        timeout: 10000,
      });

      console.log('[Weather] ✅ OpenWeatherMap One Call API 2.5 호출 성공 (1시간 단위)');

      // One Call API 2.5 응답 구조에 맞게 변환
      const currentResponse = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'kr',
        },
        timeout: 10000,
      });

      return {
        current: currentResponse.data,
        hourly: oneCallResponse.data.hourly, // 1시간 단위 데이터
        isHourly: true,
      };
    } catch (oneCallError) {
      // One Call API 2.5 실패 시 기존 방식 사용
      console.log('[Weather] One Call API 2.5 사용 불가, 3시간 단위 API 사용:', oneCallError.response?.status || oneCallError.message);
    }

    // 무료 플랜: Current Weather API + 5 Day / 3 Hour Forecast API 조합
    const [currentResponse, forecastResponse] = await Promise.all([
      // 현재 날씨
      axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'kr',
        },
        timeout: 10000,
      }),
      // 5일간 3시간 간격 예보 (무료 플랜)
      axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'kr',
        },
        timeout: 10000,
      }),
    ]);

    console.log('[Weather] ✅ OpenWeatherMap API 호출 성공 (3시간 단위):', {
      location: currentResponse.data.name,
      temperature: currentResponse.data.main.temp,
      weather: currentResponse.data.weather[0]?.description,
    });

    return {
      current: currentResponse.data,
      forecast: forecastResponse.data,
      isHourly: false,
    };
  } catch (error) {
    // API 키가 유효하지 않거나 API 호출 실패 시 더미 데이터 반환
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.warn('[Weather] API 키가 유효하지 않습니다. 더미 데이터를 사용합니다.');
      return generateDummyWeatherData(latitude, longitude);
    }
    console.warn('[Weather] API 호출 실패, 더미 데이터를 사용합니다:', error.message);
    return generateDummyWeatherData(latitude, longitude);
  }
}

// 3시간 데이터를 1시간 단위로 보간하는 함수
function interpolateHourlyData(forecastList) {
  const now = new Date();
  // 현재 시간의 정각으로 설정 (예: 15:34 -> 15:00)
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  
  const hourlyData = [];
  
  // 현재 시간 정각부터 24시간 이내의 예보만 필터링
  const filteredForecast = forecastList
    .filter((item) => {
      const itemTime = new Date(item.dt * 1000);
      const hoursDiff = (itemTime - currentHour) / (1000 * 60 * 60);
      // 현재 시간 정각 이후의 데이터만 포함 (0시간 이상)
      return hoursDiff >= 0 && hoursDiff <= 24;
    })
    .slice(0, 8); // 최대 8개 (3시간 간격 * 8 = 24시간)

  if (filteredForecast.length === 0) return [];

  // 각 3시간 간격 데이터 사이를 보간
  for (let i = 0; i < filteredForecast.length; i++) {
    const current = filteredForecast[i];
    const next = filteredForecast[i + 1];
    const currentTime = new Date(current.dt * 1000);
    
    // 현재 시점부터 다음 시점까지 1시간 간격으로 보간
    const hoursToNext = next ? (new Date(next.dt * 1000) - currentTime) / (1000 * 60 * 60) : 3;
    const steps = i === filteredForecast.length - 1 ? 3 : Math.min(3, hoursToNext);
    
    // 첫 번째 예보의 경우, 현재 시간 정각부터 시작하도록 조정
    let startOffset = 0;
    if (i === 0 && currentTime < currentHour) {
      // 현재 시간 정각이 예보 시간보다 이후면, 오프셋 계산
      startOffset = Math.floor((currentHour - currentTime) / (1000 * 60 * 60));
      // 오프셋이 steps보다 크거나 같으면 이 예보는 건너뛰기
      if (startOffset >= steps) continue;
    }
    
    for (let j = startOffset; j < steps; j++) {
      const hourTime = new Date(currentTime);
      hourTime.setHours(currentTime.getHours() + j);
      
      // 다음 데이터가 있으면 선형 보간, 없으면 현재 값 사용
      let temperature, humidity, windSpeed, precipitation, snow, weather, weatherIcon;
      
      if (next && j > 0) {
        const ratio = j / hoursToNext;
        temperature = Math.round(current.main.temp + (next.main.temp - current.main.temp) * ratio);
        humidity = Math.round(current.main.humidity + (next.main.humidity - current.main.humidity) * ratio);
        windSpeed = ((current.wind?.speed || 0) + ((next.wind?.speed || 0) - (current.wind?.speed || 0)) * ratio).toFixed(1);
        precipitation = ((current.rain?.['3h'] || current.snow?.['3h'] || 0) / 3) * (1 - ratio) + ((next.rain?.['3h'] || next.snow?.['3h'] || 0) / 3) * ratio;
        snow = ((current.snow?.['3h'] || 0) / 3) * (1 - ratio) + ((next.snow?.['3h'] || 0) / 3) * ratio;
        weather = translateWeatherDescription(current.weather?.[0]?.description, current.weather?.[0]?.id);
        weatherIcon = current.weather?.[0]?.icon || '01d';
      } else {
        temperature = Math.round(current.main.temp);
        humidity = current.main.humidity;
        windSpeed = current.wind?.speed ? current.wind.speed.toFixed(1) : '0';
        precipitation = (current.rain?.['3h'] || current.snow?.['3h'] || 0) / 3;
        snow = (current.snow?.['3h'] || 0) / 3;
        weather = translateWeatherDescription(current.weather?.[0]?.description, current.weather?.[0]?.id);
        weatherIcon = current.weather?.[0]?.icon || '01d';
      }
      
      hourlyData.push({
        time: hourTime.toISOString(),
        hour: hourTime.getHours(),
        temperature,
        humidity,
        windSpeed,
        precipitation: parseFloat(precipitation.toFixed(1)),
        snow: parseFloat(snow.toFixed(1)),
        weather,
        weatherIcon,
        pm10: null,
        pm25: null,
      });
    }
  }
  
  return hourlyData.slice(0, 24); // 최대 24시간
}

// 산책 적합도 계산 함수
function calculateWalkScore(hourlyData, airQuality) {
  const temp = typeof hourlyData.temperature === 'number' ? hourlyData.temperature : parseFloat(hourlyData.temperature) || 0;
  const humidity = typeof hourlyData.humidity === 'number' ? hourlyData.humidity : parseFloat(hourlyData.humidity) || 0;
  const windSpeed = parseFloat(hourlyData.windSpeed) || 0;
  const precipitation = typeof hourlyData.precipitation === 'number' ? hourlyData.precipitation : parseFloat(hourlyData.precipitation) || 0;
  const pm25 = airQuality?.pm25 || hourlyData.pm25 || 0;
  
  // 구름량 추정 (weatherIcon 기반)
  // OpenWeatherMap 아이콘: 01d=맑음(0%), 02d=구름조금(20%), 03d=구름많음(60%), 04d=흐림(100%)
  let cloudCover = 0;
  const icon = hourlyData.weatherIcon || '01d';
  if (icon.includes('01')) cloudCover = 0; // 맑음
  else if (icon.includes('02')) cloudCover = 20; // 구름 조금
  else if (icon.includes('03')) cloudCover = 60; // 구름 많음
  else if (icon.includes('04')) cloudCover = 100; // 흐림
  else if (icon.includes('09') || icon.includes('10') || icon.includes('11')) cloudCover = 80; // 비/뇌우
  else if (icon.includes('13')) cloudCover = 70; // 눈
  else cloudCover = 50; // 기본값

  // 하드 스탑 조건 체크 (무조건 🔴)
  if (temp >= 32 || temp <= -5 || pm25 >= 80 || precipitation >= 5 || windSpeed >= 15) {
    return {
      score: -12,
      grade: 'bad',
      reasons: getReasons(temp, humidity, windSpeed, precipitation, pm25, true),
      warnings: getWarnings(temp, humidity, windSpeed, precipitation, pm25),
    };
  }
  
  // 온도 + 습도 조합 하드 스탑
  if (temp >= 30 && humidity >= 70) {
    return {
      score: -12,
      grade: 'bad',
      reasons: ['기온과 습도가 모두 높아 매우 위험합니다'],
      warnings: ['고온다습 환경으로 산책 금지'],
    };
  }

  // 항목별 점수 계산
  let tempScore = 0;
  if (temp >= 10 && temp <= 22) tempScore = 2;
  else if ((temp >= 5 && temp <= 9) || (temp >= 23 && temp <= 27)) tempScore = 1;
  else if ((temp >= 0 && temp <= 4) || (temp >= 28 && temp <= 30)) tempScore = 0;
  else tempScore = -2;

  let humidityScore = 0;
  if (humidity >= 40 && humidity <= 60) humidityScore = 2;
  else if ((humidity >= 30 && humidity <= 39) || (humidity >= 61 && humidity <= 70)) humidityScore = 1;
  else if (humidity >= 71 && humidity <= 80) humidityScore = 0;
  else humidityScore = -2;

  let windScore = 0;
  if (windSpeed >= 0 && windSpeed <= 5) windScore = 2;
  else if (windSpeed >= 6 && windSpeed <= 8) windScore = 1;
  else if (windSpeed >= 9 && windSpeed <= 12) windScore = 0;
  else windScore = -2;

  let precipScore = 0;
  if (precipitation === 0) precipScore = 2;
  else if (precipitation > 0 && precipitation <= 1) precipScore = 1;
  else if (precipitation > 1 && precipitation < 3) precipScore = 0;
  else precipScore = -2;

  let pm25Score = 0;
  if (pm25 >= 0 && pm25 <= 15) pm25Score = 2;
  else if (pm25 >= 16 && pm25 <= 35) pm25Score = 1;
  else if (pm25 >= 36 && pm25 <= 75) pm25Score = 0;
  else pm25Score = -2;

  let cloudScore = 0;
  if (cloudCover >= 20 && cloudCover <= 70) cloudScore = 2;
  else if ((cloudCover >= 0 && cloudCover <= 19) || (cloudCover >= 71 && cloudCover <= 90)) cloudScore = 1;
  else cloudScore = 0;

  // 총점 계산
  let totalScore = tempScore + humidityScore + windScore + precipScore + pm25Score + cloudScore;

  // 열 스트레스 보정 (등급 1단계 하향)
  let heatStressPenalty = false;
  if ((temp >= 26 && humidity >= 70) || (temp >= 28 && humidity >= 60) || (temp >= 30 && humidity >= 50)) {
    heatStressPenalty = true;
    totalScore -= 4; // 1단계 하향 (약 4점 감소)
  }

  // 미세먼지 등급 기반 최대 등급 제한
  // PM2.5가 36 이상(나쁨 이상)이면 최대 등급을 "보통"으로 제한
  // PM2.5가 76 이상(매우나쁨)이면 이미 하드 스탑 조건으로 처리됨
  let maxGrade = 'good'; // 기본 최대 등급
  if (pm25 >= 36 && pm25 < 76) {
    maxGrade = 'normal'; // 나쁨: 최대 "보통"까지만
  } else if (pm25 >= 76) {
    maxGrade = 'bad'; // 매우나쁨: 이미 하드 스탑으로 처리되지만 안전장치
  }

  // 최종 등급 결정
  let grade = 'bad';
  if (totalScore >= 8) grade = 'good';
  else if (totalScore >= 4) grade = 'normal';
  else grade = 'bad';

  // 미세먼지 등급 제한 적용
  if (maxGrade === 'normal' && grade === 'good') {
    grade = 'normal'; // 나쁨일 때는 "좋음"으로 올라가지 않음
  } else if (maxGrade === 'bad') {
    grade = 'bad'; // 매우나쁨일 때는 무조건 "안좋음"
  }

  return {
    score: totalScore,
    grade: grade,
    reasons: getReasons(temp, humidity, windSpeed, precipitation, pm25, false),
    warnings: getWarnings(temp, humidity, windSpeed, precipitation, pm25),
    heatStressPenalty: heatStressPenalty,
  };
}

// 이유(reasons) 생성 함수
function getReasons(temp, humidity, windSpeed, precipitation, pm25, isHardStop) {
  const reasons = [];
  
  if (isHardStop) {
    if (temp >= 32) reasons.push('기온이 매우 높습니다');
    if (temp <= -5) reasons.push('기온이 매우 낮습니다');
    if (pm25 >= 80) reasons.push('미세먼지 농도가 매우 높습니다');
    if (precipitation >= 5) reasons.push('강수량이 많습니다');
    if (windSpeed >= 15) reasons.push('풍속이 매우 강합니다');
    return reasons;
  }

  // 점수가 0 이하인 항목만 reasons에 포함
  if (temp < 0 || temp > 30) reasons.push('기온이 적정 범위를 벗어났습니다');
  if (humidity > 80) reasons.push('습도가 높아 체감 더위가 큽니다');
  if (windSpeed > 12) reasons.push('풍속이 강합니다');
  if (precipitation > 3) reasons.push('강수량이 많습니다');
  if (pm25 > 75) reasons.push('미세먼지 농도가 높습니다');
  
  return reasons;
}

// 경고(warnings) 생성 함수
function getWarnings(temp, humidity, windSpeed, precipitation, pm25) {
  const warnings = [];
  
  if (temp >= 30) warnings.push('고온 주의');
  if (temp <= 0) warnings.push('저온 주의');
  if (pm25 >= 76) warnings.push('미세먼지 매우나쁨');
  if (precipitation >= 3) warnings.push('강한 비 예상');
  if (windSpeed >= 13) warnings.push('강풍 주의');
  
  return warnings;
}

// 미세먼지 등급 판정 함수 (한국 환경부 기준)
function getAirQualityGrade(pm25, pm10) {
  // PM2.5 기준 (우선순위)
  if (pm25 !== null && pm25 !== undefined && !isNaN(pm25)) {
    if (pm25 <= 15) return { grade: '좋음', color: '#4CAF50', pm25, pm10 };
    if (pm25 <= 35) return { grade: '보통', color: '#FFC107', pm25, pm10 };
    if (pm25 <= 75) return { grade: '나쁨', color: '#FF9800', pm25, pm10 };
    return { grade: '매우나쁨', color: '#F44336', pm25, pm10 };
  }
  
  // PM10 기준 (PM2.5가 없을 때)
  if (pm10 !== null && pm10 !== undefined && !isNaN(pm10)) {
    if (pm10 <= 30) return { grade: '좋음', color: '#4CAF50', pm25, pm10 };
    if (pm10 <= 80) return { grade: '보통', color: '#FFC107', pm25, pm10 };
    if (pm10 <= 150) return { grade: '나쁨', color: '#FF9800', pm25, pm10 };
    return { grade: '매우나쁨', color: '#F44336', pm25, pm10 };
  }
  
  return { grade: null, color: null, pm25: null, pm10: null };
}

// 한국 환경공단 대기질 API 호출 함수
async function fetchAirQuality(latitude, longitude) {
  const apiKey = process.env.AIRKOREA_API_KEY;
  
  if (!apiKey || apiKey === 'dummy' || apiKey.trim() === '') {
    console.warn('[AirQuality] API 키가 없어 미세먼지 데이터를 가져올 수 없습니다.');
    return null;
  }

  try {
    // 좌표를 기반으로 시도명 추정
    const locationName = getLocationName(latitude, longitude);
    let sidoName = '서울';
    
    if (locationName.includes('부산')) sidoName = '부산';
    else if (locationName.includes('인천')) sidoName = '인천';
    else if (locationName.includes('광주')) sidoName = '광주';
    else if (locationName.includes('대전')) sidoName = '대전';
    else if (locationName.includes('울산')) sidoName = '울산';
    else if (locationName.includes('성남')) sidoName = '경기';
    else if (locationName.includes('서울')) sidoName = '서울';
    
    // 한국 환경공단 실시간 대기질 조회 API
    // 공공데이터포털: 시도별 실시간 측정정보 조회
    // End Point: https://apis.data.go.kr/B552584/ArpltnInforInqireSvc
    const url = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty`;
    
    // 공공데이터포털 API 키 처리
    // 일반 인증키를 그대로 사용 (공공데이터포털이 자동으로 처리)
    // 참고: "포털에서 제공되는 Encoding/Decoding 된 인증키를 적용하면서 구동되는 키를 사용하시기 바랍니다"
    const serviceKey = apiKey.trim();
    
    console.log('[AirQuality] API 호출 시도:', { url, sidoName, serviceKeyLength: serviceKey.length });
    
    const response = await axios.get(url, {
      params: {
        serviceKey: serviceKey,
        returnType: 'json',
        numOfRows: '100',
        pageNo: '1',
        sidoName: sidoName,
        ver: '1.0',
      },
      timeout: 10000,
    });

    // 응답 데이터 구조 확인
    console.log('[AirQuality] API 응답 구조:', JSON.stringify(response.data, null, 2).substring(0, 500));
    
    if (response.data && response.data.response) {
      const responseBody = response.data.response.body;
      
      if (!responseBody) {
        console.warn('[AirQuality] 응답 body가 없습니다:', response.data.response);
        return null;
      }
      
      const items = responseBody.items;
      
      if (!items || items.length === 0) {
        console.warn('[AirQuality] 측정소 데이터가 없습니다.');
        return null;
      }
      
      // 통신장애가 없는 측정소 찾기 (pm25Value나 pm10Value가 "-"가 아닌 것)
      let stationData = null;
      for (const item of items) {
        const pm25Value = item.pm25Value;
        const pm10Value = item.pm10Value;
        const pm25Flag = item.pm25Flag;
        const pm10Flag = item.pm10Flag;
        
        // 통신장애가 아니고 실제 수치가 있는 측정소 찾기
        if (pm25Flag !== '통신장애' && pm10Flag !== '통신장애' && 
            pm25Value !== '-' && pm10Value !== '-' && 
            pm25Value && pm10Value && 
            !isNaN(parseFloat(pm25Value)) && !isNaN(parseFloat(pm10Value))) {
          stationData = item;
          console.log('[AirQuality] 통신장애가 없는 측정소 발견:', item.stationName);
          break;
        }
      }
      
      // 통신장애가 없는 측정소가 없으면 등급 정보가 있는 첫 번째 측정소 사용
      if (!stationData) {
        // 등급 정보가 있는 측정소 찾기
        for (const item of items) {
          if (item.pm25Grade || item.pm10Grade) {
            stationData = item;
            console.warn('[AirQuality] 통신장애가 없는 측정소를 찾지 못했습니다. 등급 정보가 있는 측정소 사용:', item.stationName);
            break;
          }
        }
        
        // 등급 정보도 없으면 첫 번째 측정소 사용
        if (!stationData) {
          stationData = items[0];
          console.warn('[AirQuality] 첫 번째 측정소 사용:', stationData.stationName);
        }
      }
      
      // 필드명 확인
      const pm25Value = stationData.pm25Value;
      const pm10Value = stationData.pm10Value;
      const pm25Grade = stationData.pm25Grade; // 등급 정보 (1=좋음, 2=보통, 3=나쁨, 4=매우나쁨)
      const pm10Grade = stationData.pm10Grade;
      
      // 수치 파싱
      const pm25 = pm25Value && pm25Value !== '-' && pm25Value !== '' && !isNaN(pm25Value)
        ? parseFloat(pm25Value) 
        : null;
      const pm10 = pm10Value && pm10Value !== '-' && pm10Value !== '' && !isNaN(pm10Value)
        ? parseFloat(pm10Value) 
        : null;
      
      // 등급 정보가 있으면 등급 기반으로 판정 (수치가 없을 때)
      let finalPm25 = pm25;
      let finalPm10 = pm10;
      
      // 등급 정보로 추정 (수치가 없을 때만)
      if (!finalPm25 && pm25Grade) {
        // 등급 기반 중간값 추정 (정확하지 않지만 대략적인 값)
        const gradeValues = { '1': 10, '2': 25, '3': 55, '4': 100 };
        finalPm25 = gradeValues[pm25Grade] || null;
        console.log('[AirQuality] PM2.5 수치가 없어 등급 기반 추정값 사용:', { grade: pm25Grade, estimated: finalPm25 });
      }
      if (!finalPm10 && pm10Grade) {
        const gradeValues = { '1': 20, '2': 55, '3': 115, '4': 200 };
        finalPm10 = gradeValues[pm10Grade] || null;
        console.log('[AirQuality] PM10 수치가 없어 등급 기반 추정값 사용:', { grade: pm10Grade, estimated: finalPm10 });
      }

      console.log('[AirQuality] ✅ 대기질 데이터 조회 성공:', {
        stationName: stationData.stationName || '알 수 없음',
        pm25: finalPm25,
        pm10: finalPm10,
        pm25Raw: pm25Value,
        pm10Raw: pm10Value,
        pm25Grade,
        pm10Grade,
        pm25Flag: stationData.pm25Flag,
        pm10Flag: stationData.pm10Flag,
      });

      return {
        pm25: finalPm25,
        pm10: finalPm10,
        stationName: stationData.stationName || locationName,
        dataTime: stationData.dataTime,
      };
    }

    console.warn('[AirQuality] 대기질 데이터가 없습니다.');
    return null;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 401 || status === 403) {
        console.error('[AirQuality] ❌ 인증 실패 (401/403):');
        console.error('[AirQuality] API 키를 확인하세요. 공공데이터포털에서 발급받은 인증키(Service Key)를 .env 파일에 추가하세요.');
        console.error('[AirQuality] API 키 형식: AIRKOREA_API_KEY=발급받은_인증키');
        if (errorData) {
          console.error('[AirQuality] 에러 상세:', JSON.stringify(errorData, null, 2));
        }
      } else {
        console.warn('[AirQuality] 대기질 API 호출 실패:', status, errorData || error.message);
      }
    } else {
      console.warn('[AirQuality] 대기질 API 호출 실패:', error.message);
    }
    return null;
  }
}

// 날씨 데이터 가공 함수
function processWeatherData(apiData, latitude, longitude, airQuality) {
  // 더미 데이터가 이미 가공된 형태로 반환된 경우
  if (apiData.current && typeof apiData.current === 'object' && 'temperature' in apiData.current && !apiData.current.main) {
    console.log('[Weather] 더미 데이터 감지됨');
    // 더미 데이터에도 산책 적합도 등급 추가
    if (apiData.hourly && Array.isArray(apiData.hourly)) {
      apiData.hourly = apiData.hourly.map((item) => {
        const walkScore = calculateWalkScore(item, airQuality);
        return {
          ...item,
          walkScore: walkScore,
        };
      });
    }
    return apiData; // 이미 가공된 더미 데이터
  }

  const current = apiData.current;
  
  // One Call API 2.5 응답 처리 (1시간 단위)
  if (apiData.isHourly && apiData.hourly) {
    const locationName = current.name || getLocationName(latitude, longitude);
    
    const currentWeather = {
      temperature: Math.round(current.main.temp),
      humidity: current.main.humidity,
      windSpeed: current.wind?.speed ? current.wind.speed.toFixed(1) : '0',
      weather: translateWeatherDescription(current.weather?.[0]?.description, current.weather?.[0]?.id),
      weatherIcon: current.weather?.[0]?.icon || '01d',
      pm10: null,
      pm25: null,
    };

    const now = new Date();
    // 현재 시간의 정각으로 설정 (예: 15:34 -> 15:00)
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);
    
    const hourlyWeather = apiData.hourly
      .filter((item) => {
        const itemTime = new Date(item.dt * 1000);
        const hoursDiff = (itemTime - currentHour) / (1000 * 60 * 60);
        // 현재 시간 정각 이후의 데이터만 포함 (0시간 이상)
        return hoursDiff >= 0 && hoursDiff <= 24;
      })
      .slice(0, 24)
      .map((item) => {
        const date = new Date(item.dt * 1000);
        // 강수량/강설량 데이터 추출 (OpenWeatherMap API 구조 확인)
        // One Call API 2.5: rain['1h'], snow['1h'] 또는 rain, snow 필드 직접 사용
        const rain1h = item.rain?.['1h'] || item.rain || 0;
        const snow1h = item.snow?.['1h'] || item.snow || 0;
        const precipitation = rain1h || snow1h || 0;
        
        const hourlyItem = {
          time: date.toISOString(),
          hour: date.getHours(),
          temperature: Math.round(item.temp),
          humidity: item.humidity,
          windSpeed: item.wind_speed ? item.wind_speed.toFixed(1) : '0',
          precipitation: parseFloat(precipitation.toFixed(1)),
          snow: parseFloat((snow1h || 0).toFixed(1)),
          weather: translateWeatherDescription(item.weather?.[0]?.description, item.weather?.[0]?.id),
          weatherIcon: item.weather?.[0]?.icon || '01d',
          pm10: null,
          pm25: null,
        };
        // 산책 적합도 등급 계산
        hourlyItem.walkScore = calculateWalkScore(hourlyItem, airQuality);
        return hourlyItem;
      });

    return {
      location: {
        latitude,
        longitude,
        address: locationName,
      },
      current: currentWeather,
      hourly: hourlyWeather,
      fetchedAt: new Date().toISOString(),
    };
  }

  // 3시간 단위 데이터 처리 (보간하여 1시간 단위로 변환)
  const forecastList = apiData.forecast?.list || [];
  const locationName = current.name || getLocationName(latitude, longitude);

  const currentWeather = {
    temperature: Math.round(current.main.temp),
    humidity: current.main.humidity,
      windSpeed: current.wind?.speed ? current.wind.speed.toFixed(1) : '0',
    weather: translateWeatherDescription(current.weather?.[0]?.description, current.weather?.[0]?.id),
    weatherIcon: current.weather?.[0]?.icon || '01d',
    pm10: null,
    pm25: null,
  };

  // 3시간 데이터를 1시간 단위로 보간
  let hourlyWeather = interpolateHourlyData(forecastList);
  
  // 각 시간대별로 산책 적합도 등급 계산
  hourlyWeather = hourlyWeather.map((item) => {
    const walkScore = calculateWalkScore(item, airQuality);
    return {
      ...item,
      walkScore: walkScore,
    };
  });

  return {
    location: {
      latitude,
      longitude,
      address: locationName,
    },
    current: currentWeather,
    hourly: hourlyWeather,
    fetchedAt: new Date().toISOString(),
  };
}

// 날씨 예보 조회
router.get('/forecast', async (req, res, next) => {
  try {
    let latitude = parseFloat(req.query.latitude);
    let longitude = parseFloat(req.query.longitude);

    // 위치 정보가 없으면 기본값 (서울)
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      latitude = 37.5665; // 서울
      longitude = 126.9780;
    }

    // 캐시 키 생성
    const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
    const cached = weatherCache.get(cacheKey);
    
    // 캐시 확인
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log('[Weather] 캐시된 데이터 반환:', cacheKey);
      
      // 캐시된 데이터에도 미세먼지 정보 추가 (별도 캐시에서 가져오기)
      const airQualityCacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
      const cachedAirQuality = airQualityCache.get(airQualityCacheKey);
      
      let airQualityForCache = null;
      if (cachedAirQuality && (Date.now() - cachedAirQuality.timestamp < AIR_QUALITY_CACHE_DURATION)) {
        cached.data.airQuality = cachedAirQuality.data;
        cached.data.airQualityStation = cachedAirQuality.stationName;
        airQualityForCache = cachedAirQuality.data;
      } else {
        // 미세먼지 캐시가 없거나 만료되었으면 새로 가져오기
        const airQualityData = await fetchAirQuality(latitude, longitude);
        if (airQualityData) {
          const airQuality = {
            data: getAirQualityGrade(airQualityData.pm25, airQualityData.pm10),
            stationName: airQualityData.stationName,
            timestamp: Date.now(),
          };
          airQualityCache.set(airQualityCacheKey, airQuality);
          cached.data.airQuality = airQuality.data;
          cached.data.airQualityStation = airQuality.stationName;
          airQualityForCache = airQuality.data;
        }
      }
      
      // 캐시된 데이터에 산책 적합도 등급이 없으면 다시 계산
      if (cached.data.hourly && cached.data.hourly.length > 0 && !cached.data.hourly[0].walkScore) {
        cached.data.hourly = cached.data.hourly.map((item) => {
          const walkScore = calculateWalkScore(item, airQualityForCache);
          return {
            ...item,
            walkScore: walkScore,
          };
        });
      }
      
      return res.json({ success: true, data: cached.data });
    }

    // API 호출
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const isUsingDummy = !apiKey || apiKey === 'dummy' || apiKey.trim() === '';
    
    if (isUsingDummy) {
      console.warn('[Weather] ⚠️ 더미 데이터 사용 중 - 실제 날씨와 다를 수 있습니다.');
      console.warn('[Weather] 실제 날씨 데이터를 사용하려면 .env 파일에 유효한 OPENWEATHER_API_KEY를 설정하세요.');
    } else {
      console.log('[Weather] OpenWeatherMap API 호출 중...', { latitude, longitude });
    }
    
    const apiData = await fetchWeatherFromAPI(latitude, longitude);
    
    // 미세먼지 데이터 먼저 가져오기 (산책 적합도 계산에 필요)
    const airQualityCacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
    let airQuality = airQualityCache.get(airQualityCacheKey);
    
    if (!airQuality || (Date.now() - airQuality.timestamp > AIR_QUALITY_CACHE_DURATION)) {
      const airQualityData = await fetchAirQuality(latitude, longitude);
      if (airQualityData) {
        airQuality = {
          data: getAirQualityGrade(airQualityData.pm25, airQualityData.pm10),
          stationName: airQualityData.stationName,
          timestamp: Date.now(),
        };
        airQualityCache.set(airQualityCacheKey, airQuality);
      } else {
        airQuality = {
          data: { grade: null, color: null, pm25: null, pm10: null },
          stationName: null,
          timestamp: Date.now(),
        };
      }
    }
    
    // 데이터 가공 (미세먼지 정보 포함하여 산책 적합도 계산)
    const processedData = processWeatherData(apiData, latitude, longitude, airQuality.data);
    
    // 미세먼지 정보 추가
    processedData.airQuality = airQuality.data;
    processedData.airQualityStation = airQuality.stationName;
    
    // 더미 데이터 사용 여부 판단 (더 정확하게)
    // OpenWeatherMap API 응답은 current.main.temp 구조를 가지고 있음
    // 더미 데이터는 current.temperature 구조를 가짐
    const isActuallyDummy = !apiData.current?.main || (apiData.current && typeof apiData.current === 'object' && 'temperature' in apiData.current && !apiData.current.main);
    
    if (isActuallyDummy) {
      processedData.isDummy = true;
      console.log('[Weather] 📊 더미 데이터 반환:', {
        location: processedData.location.address,
        temperature: processedData.current.temperature,
      });
    } else {
      processedData.isDummy = false;
      console.log('[Weather] ✅ 실제 OpenWeatherMap API 데이터 반환:', {
        location: processedData.location.address,
        temperature: processedData.current.temperature,
        weather: processedData.current.weather,
        source: 'OpenWeatherMap',
        note: '네이버와 데이터 소스가 다를 수 있습니다.',
      });
    }
    
    // 캐시 저장
    weatherCache.set(cacheKey, {
      data: processedData,
      timestamp: Date.now(),
    });

    res.json({ success: true, data: processedData });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

