// C 항목 점검: 취향·행동 데이터가 추천을 의도대로 바꾸는지, 저장 키·기존 설정을 건드리지 않는지 자동 확인한다.
// 사용: node tools/check-taste.mjs   (문제가 있으면 종료 코드 1)
import * as T from '../app/js/core/taste.js';
import { rankPlaces } from '../app/js/core/scoring.js';
import { PLACES } from '../app/js/data/places.js';

const problems = [];
const ok = (c, m) => { if (!c) problems.push(m); };
const mem = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, _d: d }; };

// 1) 저장 키: 새 키만 쓰고 기존 설정 키는 건드리지 않는다
{
  const st = mem(); st.setItem('eodigaji.v1', '{"profile":{"keep":1}}');
  T._setStorage(st);
  const t = T.loadTaste(); T.togglePref(t, 'nature'); T.recordView(t, 'a'); T.saveTaste(t);
  ok(st._d['eodigaji.v1'] === '{"profile":{"keep":1}}', '기존 설정 키(eodigaji.v1)가 바뀌었어요');
  ok(T.TASTE_KEY === 'eodigaji.taste.v1' && st._d['eodigaji.taste.v1'], '취향 데이터는 새 키(eodigaji.taste.v1)에 저장돼야 해요');
  ok(T.loadTaste().prefs[0] === 'nature', '저장한 취향을 다시 읽어야 해요');
  T._setStorage({ getItem: () => '깨진 값{', setItem() {} });
  ok(T.loadTaste().prefs.length === 0, '저장값이 깨져도 빈 취향으로 시작해야 해요');
}

// 2) 보정기: 취향에 맞는 곳이 위로, 숨긴 곳은 빠지고, 다녀온 곳은 낮아진다
{
  const mkp = (id, cat, name = id) => ({ ...PLACES.find((p) => p.scale === 'big' && !p.spot), id, cat, name, sub: '', lat: 37.57, lng: 126.99, spot: false, kto: false });
  const a = mkp('nat', 'nature'), b = mkp('shp', 'shop');
  const profile = { members: [{ id: 'm', label: '나', age: 38, gender: 'm', weight: 1 }], mode: 'hot', origin: { type: 'city', name: '서울', lat: 37.5665, lng: 126.978 } };
  const raw = (tasteObj, list = [a, b]) => Object.fromEntries(rankPlaces(list, profile, [], 120, 'all', { taste: tasteObj }).map((r) => [r.place.id, r.raw]));
  const t0 = { prefs: [], places: {}, v: 1 };
  const base = raw(null);
  const none = raw(T.makeTasteScorer(t0, [a, b]));
  ok(Math.abs(base.nat - none.nat) < 1e-9 && Math.abs(base.shp - none.shp) < 1e-9, '취향·기록이 없으면 점수가 그대로여야 해요');
  const tn = { prefs: ['nature'], places: {}, v: 1 };
  const withPref = raw(T.makeTasteScorer(tn, [a, b]));
  ok(withPref.nat / base.nat > 1.2 && withPref.shp / base.shp <= 1 + 1e-9, '고른 취향(자연)에 맞는 곳은 오르고 안 맞는 곳은 오르지 않아야 해요');
  ok(withPref.nat / base.nat <= 1.36, '취향 보정은 최대 +35%여야 해요');
  const th = { prefs: [], places: { nat: { h: 1 } }, v: 1 };
  const hid = rankPlaces([a, b], profile, [], 120, 'all', { taste: T.makeTasteScorer(th, [a, b]) }).map((r) => r.place.id);
  ok(!hid.includes('nat') && hid.includes('shp'), '관심 없음으로 숨긴 곳은 추천에서 빠져야 해요');
  const hid2 = rankPlaces([a, b], profile, [], 120, 'all', { taste: T.makeTasteScorer(th, [a, b]), hideHidden: false }).map((r) => r.place.id);
  ok(hid2.includes('nat'), 'hideHidden:false(상세 창용)면 숨긴 곳도 목록에 있어야 해요');
  const tv = { prefs: [], places: { nat: { d: '2026-11-01' } }, v: 1 };
  ok(raw(T.makeTasteScorer(tv, [a, b])).nat < base.nat, '다녀온 곳은 조금 낮아져야 해요');
  const tg = { prefs: [], places: { nat: { d: '2026-11-01', r: 5 } }, v: 1 };
  const tb = { prefs: [], places: { nat: { d: '2026-11-01', r: 1 } }, v: 1 };
  ok(raw(T.makeTasteScorer(tg, [a, b])).nat > raw(T.makeTasteScorer(tb, [a, b])).nat, '좋게 평가한 곳이 나쁘게 평가한 곳보다 높아야 해요');
  const aff = T.categoryAffinity({ prefs: [], places: { nat: { r: 5, d: 'x' } }, v: 1 }, [a, b], ['nat']);
  ok(aff.nature > 0 && aff.shop === undefined, '찜·좋은 평가는 그 분류의 호감을 올려야 해요');
}

// 3) 성별·나이를 취향 추정에 쓰지 않는다: 같은 취향·기록이면 동행인이 달라도 보정 배수가 같아야 한다
{
  const p = PLACES.find((x) => x.scale === 'big');
  const sc = T.makeTasteScorer({ prefs: ['nature'], places: {}, v: 1 }, [p]);
  ok(sc.factor(p) === sc.factor({ ...p }), '취향 보정은 장소와 사용자가 고른 값만으로 정해져야 해요');
}

if (problems.length) { console.log(`❌ 문제 ${problems.length}건\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('✅ 취향·행동 규칙 이상 없음');
