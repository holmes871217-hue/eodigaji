// 골프 탭 규칙 점검: node tools/check-golf.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { nameKey, isHiddenName, parseGolfpangRows, golfpangTotal, perPersonCost, nextSaturday0600, cityOf, flightIncluded, coordsFromGoogleUrl, unescapeHtml, is18Tee, isPar3, cartIncludedText, median } from './golf/lib.mjs';
import { golfDomestic, golfDrive, golfAbroad, golfCountries, golfDays, localPrice } from '../app/js/core/golf.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('이름 열쇠', () => {
  assert.equal(nameKey('화성&#40;P&#41;'), '화성');
  assert.equal(nameKey('블루원용인(퍼)'), '블루원용인');
  assert.equal(nameKey('코리아-퍼9'), '코리아');
  assert.equal(nameKey('아세코밸리(P)'), nameKey('아세코밸리-퍼9'));
  assert.equal(nameKey('포웰(안성)cc'), '포웰안성');
  assert.equal(nameKey('뉴서울CC'), '뉴서울');
  assert.ok(isHiddenName('여주(비공개)'));
});

t('골팡 표 읽기', () => {
  const html = `<span class="num_product">총 <strong>1839 </strong> 개</span>
  <tr id="tr_1"> <td>한강이남</td><td>11월28일 (토)</td><td>11:53</td><td> </td><td align="left">세현</td><td>18홀</td><td> </td><td> <span class="price">220,000</span>원 </td><td>판매자</td><td class="state"> 일반캐디 </td><td> 양도 </td><td>5</td> </tr>
  <tr id="tr_2"> <td>한강이남</td><td>11월28일 (토)</td><td>12:00</td><td> </td><td>x</td><td>18홀</td><td> </td><td>문의</td><td>a</td><td>b</td><td>c</td><td>1</td> </tr>`;
  const rows = parseGolfpangRows(html);
  assert.equal(rows.length, 1, '가격 없는 줄은 뺀다');
  assert.equal(rows[0].price, 220000);
  assert.equal(rows[0].name, '세현');
  assert.equal(rows[0].holes, '18홀');
  assert.equal(golfpangTotal(html), 1839);
});

t('1인 총비용', () => {
  const c = perPersonCost(250000, 120000, 150000);
  assert.equal(c.total, 250000 + 30000 + 37500);
  assert.ok(c.complete);
  const d = perPersonCost(90000, 0, 0);
  assert.equal(d.total, 90000);
  assert.equal(d.complete, false);
  assert.deepEqual(d.missing, ['카트비', '캐디피']);
  const nc = perPersonCost(100000, 80000, 140000, { noCaddie: true });
  assert.equal(nc.total, 120000);
  assert.ok(nc.complete, '노캐디는 캐디피 없어도 완전');
  const est = perPersonCost(90000, 0, 0, { estCart: 100000, estCaddie: 140000 });
  assert.equal(est.total, 90000 + 25000 + 35000, '모르는 카트·캐디피는 지역 중간값으로 예상 포함');
  assert.deepEqual(est.estimated, ['카트비', '캐디피']);
  assert.equal(est.complete, false);
  const inc = perPersonCost(120000, 100000, 140000, { cartIncluded: true });
  assert.equal(inc.total, 120000 + 35000, '카트비 포함 상품은 카트비를 더하지 않음');
  assert.ok(isPar3('한림광릉퍼블릭(PAR3)') && isPar3('파인파크 AT 군산 파3') && !isPar3('뉴서울'));
  assert.ok(cartIncludedText('그린피+카트비 포함') && !cartIncludedText('정규캐디'));
  assert.equal(median([0, 100, 300, 200]), 200);
});

t('18홀 티타임만', () => {
  assert.ok(is18Tee({ min_cost: 250000, is_9h: 'N', is_9h2: 'N', course_name: '예술IN_18홀라운드' }));
  assert.ok(!is18Tee({ min_cost: 50000, is_9h: 'Y', course_name: 'A' }));
  assert.ok(!is18Tee({ min_cost: 50000, is_9h: 'N', course_name: '예술OUT_9홀라운드' }));
  assert.ok(!is18Tee({ min_cost: 0, is_9h: 'N', course_name: 'x' }));
});

t('다음 토요일 06시', () => {
  // 2026-11-23(월) 10:00 KST → 11/28 06:00
  assert.equal(nextSaturday0600(new Date('2026-11-23T01:00:00Z')), '202611280600');
  // 토요일 당일이면 다음 주 토요일
  assert.equal(nextSaturday0600(new Date('2026-11-28T01:00:00Z')), '202612050600');
});

t('도시·항공 포함 여부·좌표', () => {
  assert.equal(cityOf('방콕라군 + 스카이밸리&#40;항공불포함&#41;').iata, 'BKK');
  assert.equal(cityOf('치앙마이 인타논 108홀').iata, 'CNX');
  assert.equal(cityOf('코타 넥서스 리조트').iata, 'BKI');
  assert.equal(cityOf('(오사카)간사히 시내2색골프').iata, 'KIX');
  assert.equal(cityOf('알 수 없는 곳'), null);
  assert.equal(flightIncluded('방콕(항공불포함)'), 'no');
  assert.equal(flightIncluded('세부 무제한 골프'), 'unknown');
  assert.deepEqual(coordsFromGoogleUrl('https://www.google.co.kr/maps/place/x/@13.65,101.27,17z/data=!3d13.655224!4d101.2823534!16s'), { lat: 13.655224, lng: 101.2823534 });
  assert.equal(unescapeHtml('경기남부 &gt; 용인'), '경기남부 > 용인');
});

t('국내 목록: 시간 제한·가격 순·개수 제한 없음', () => {
  const origin = { type: 'city', name: '안산', lat: 37.3204, lng: 126.8454 };
  const mk = (id, total, drive, lat = 37.3, lng = 126.9) => ({ id, name: id, area: '', lat, lng, drive: drive ? { 안산: drive } : {}, days: { '2026-11-28': { total, green: total, complete: true, missing: [], offers: [] } } });
  const data = { domestic: [mk('a', 200000, [100, 90, 'x']), mk('b', 100000, [130, 120, 'x']), mk('c', 150000, [60, 50, 'x']), mk('far', 50000, null, 35.1, 129.0)] };
  for (let i = 0; i < 60; i++) data.domestic.push(mk(`m${i}`, 300000 + i, [30, 20, 'x']));
  const rows = golfDomestic(data, { origin, day: '2026-11-28', maxMin: 120 });
  assert.equal(rows[0].c.id, 'c', '가격 낮은 순');
  assert.ok(!rows.some((r) => r.c.id === 'b'), '130분은 2시간 밖');
  assert.ok(!rows.some((r) => r.c.id === 'far'), '부산(추정)은 밖');
  assert.equal(rows.length, 62, '개수 제한 없음');
  assert.equal(golfDrive(data.domestic[0], origin).kind, 'kakao');
  assert.equal(golfDrive(data.domestic[0], { type: 'gps', lat: 37.3, lng: 126.84 }).kind, 'est', '거점이 아니면 추정으로 표시');
  assert.deepEqual(golfDays({ dates: ['2026-11-22', '2026-11-24'] }, '2026-11-23'), ['2026-11-24']);
});

t('해외 목록', () => {
  const data = { abroad: [{ country: '태국', city: '방콕', price: 300 }, { country: '태국', city: '치앙마이', price: 100 }, { country: '일본', city: '후쿠오카', price: 50 }] };
  assert.deepEqual(golfAbroad(data, { country: '태국' }).map((x) => x.price), [100, 300]);
  assert.equal(golfAbroad(data, { country: '태국', city: '방콕' }).length, 1);
  assert.equal(golfCountries(data)[0].name, '태국');
  assert.equal(localPrice({ perUnit: { THB: 40 } }, 4000, 'THB'), '100');
  assert.equal(localPrice(null, 4000, 'THB'), null);
});

// 실제 자료 파일이 있으면 모양을 점검한다.
const f = new URL('../app/data/golf.json', import.meta.url);
if (fs.existsSync(f)) {
  t('golf.json 모양', () => {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.ok(j.updatedAt && Array.isArray(j.dates) && Array.isArray(j.domestic) && Array.isArray(j.abroad));
    for (const c of j.domestic) {
      assert.ok(c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng), `좌표 없음 ${c.name}`);
      for (const [day, d] of Object.entries(c.days)) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(day));
        assert.ok(d.total >= d.green && d.green > 0, `가격 이상 ${c.name}`);
        assert.ok(d.offers.length >= 1 && d.offers.every((o) => ['ts', 'gp', 'tu'].includes(o[0]) && o[1] > 0 && o[2] > 0), `출처 없음 ${c.name}`);
        assert.ok(d.total === Math.min(...d.offers.map((o) => o[3])), `총비용 최저 아님 ${c.name}`);
        assert.ok(!isPar3(c.name), `파3 포함됨 ${c.name}`);
      }
    }
    for (const t2 of j.abroad) assert.ok(t2.title && t2.price > 0 && t2.url, `해외 상품 이상 ${t2.title}`);
  });
}

console.log(`골프 점검 ${n}개 통과`);
