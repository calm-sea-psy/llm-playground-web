// 계약(openapi.json)에 아직 description 이 없는 컴포넌트 · 필드의 설명. gen-schemas.mjs 가 생성 타입의 JSDoc 으로 넣는다.
// 키는 "컴포넌트" 또는 "컴포넌트.필드"(서버 형식 이름)다. 없는 컴포넌트 · 필드를 가리키면 생성이 멈춘다.
// wiki 가 계약에 description 을 넣으면 그 항목은 여기서 지운다 (둘 다 있으면 생성이 멈추고 지울 항목을 알려 준다).

/** 계약에 아직 없는 설명 */
export const DESCRIPTIONS = {
  "HealthResponse.status": "서버가 떴으면 늘 ok",
  "HealthResponse.collection": "검색 대상 컬렉션 이름",

  "SearchHit.chunk_id": "청크 id",
  "SearchHit.doc_id": "원문서 id",

  "SearchResponse.query": "받은 질의 그대로",
  "SearchResponse.collection": "검색한 컬렉션 이름",
};
