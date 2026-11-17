// 설명에 식당 이름이 없는 시리즈(또간집 등)를 위한 수기 입력 틀을 만든다.
// 정규 회차마다 { videoId, ep, region, restaurants: [] } 한 줄을 만들어 data/manual-episodes.json 에 추가한다(이미 있는 회차는 건드리지 않음).
// 관리자는 영상을 보고 restaurants 에 { name, role, addr? } 를 적는다. role: winner(최종 1위) | final(최종 선정) | visited(방문·소개) | mentioned(단순 언급)
// 적은 식당은 자동 수집분과 똑같이 업체 매칭·검수·판정을 거친다(모호하면 검수 큐, 실제 업체와 매칭 안 되면 추천 안 됨).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./data/', import.meta.url));
const read = (f, d) => { try { return JSON.parse(readFileSync(DIR + f, 'utf8')); } catch { return d; } };

export function buildSkeleton(videos, existing = { episodes: [] }) {
  const have = new Set(existing.episodes.map((e) => e.videoId));
  const add = [];
  for (const v of Object.values(videos)) {
    if (v.sponsored || (v.description || '').length < 200 || have.has(v.id)) continue; // 정규 회차(설명이 긴 영상)만
    const ep = (v.title.match(/EP\.?\s*(\d+)/i) || [])[1] || ((v.description.match(/또간집\s*(\d+)\s*화/) || [])[1] ? String(Number(v.description.match(/또간집\s*(\d+)\s*화/)[1]) - 1) : '');
    const region = ((v.description.match(/#([가-힣]+)/g) || []).map((t) => t.slice(1)).filter((t) => !/^(풍자|또간집|먹방|맛집)$/.test(t))[0]) || '';
    add.push({ videoId: v.id, ep: ep ? Number(ep) : null, publishedAt: v.publishedAt.slice(0, 10), region, restaurants: [] });
  }
  add.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  return { _설명: '관리자가 영상을 보고 restaurants 를 채운다. role: winner|final|visited|mentioned. 예: { "name": "부광족발", "role": "winner" }', episodes: [...existing.episodes, ...add] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sv = read('series-videos.json', { videos: {} }).videos;
  const out = buildSkeleton(sv, read('manual-episodes.json', { episodes: [] }));
  writeFileSync(DIR + 'manual-episodes.json', JSON.stringify(out, null, 1));
  console.log(`수기 입력 틀: 회차 ${out.episodes.length}개(식당이 비어 있는 회차 ${out.episodes.filter((e) => !e.restaurants.length).length})`);
}
