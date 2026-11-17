// 전국 지역(시·군·구)별 핫플 점수(app/data/region-trends.json, tools/region-trends.mjs 가 만든다). 파일이 없으면 비어 있다.
let REGIONS = [];
export const setRegions = (rows) => { REGIONS = Array.isArray(rows) ? rows : []; };
export const getRegions = () => REGIONS;
