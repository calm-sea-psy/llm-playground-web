// contracts/openapi.json 에서 서버 형식 zod 스키마 · 화면 타입(camelCase) · 변환 함수를 만든다.
//
//   node scripts/gen-schemas.mjs           src/api/generated/schemas.generated.ts 를 쓴다
//   node scripts/gen-schemas.mjs --check   파일이 openapi.json 과 맞는지만 본다 (다르면 종료 코드 1)
//
// 규칙
// - 서버 형식: 응답의 모르는 키는 버리고 읽는다 (z.object). 계약 호환 규칙상 필드 추가는 선택 필드로만 하므로
//   새 필드가 더해져도 화면이 쓰는 기존 필드는 그대로 있다. 모르는 값(enum 밖의 값)은 그대로 거절한다
// - 응답 화면 타입: 키는 camelCase, format=date-time 문자열은 ms 숫자, 없을 수 있는 값은 null, 없을 수 있는 배열은 [] 로 채운다
//   (화면 코드는 undefined 를 다루지 않는다)
// - 요청: 키만 camelCase 로 바꾼 <이름>Input 타입과 서버 형식 본문 함수(to<이름>Body), 계약 제약 상수(길이 · 형식 · 범위)를 만든다.
//   기본값이 있는 선택 필드는 Input 에서는 선택이고, 본문에는 빠지면 기본값을 채운다 (openapi-typescript 는 그 필드를 필수로 적는다)
// - 경로 파라미터 · 쿼리 파라미터의 최댓값은 상수(<경로 첫 단어>_<파라미터>_MAXIMUM)로, 값 목록(enum)은 상수 배열 · 유니온 타입 ·
//   기본값 상수(<경로 첫 단어>_<파라미터>S · <경로 첫 단어><파라미터> · <경로 첫 단어>_<파라미터>_DEFAULT)로 만든다
// - text/event-stream 응답은 itemSchema(oneOf: event 이름 const + data 의 contentSchema $ref)를 읽어 이벤트 이름 목록 ·
//   화면 형식 이벤트 유니온 · 이벤트별 data 검증 스키마(<경로 첫 단어>_EVENTS · <경로 첫 단어>Event · <경로 첫 단어>EventDataSchemas)를 만든다
// - 키가 자유로운 객체(additionalProperties 가 스키마)는 키를 그대로 둔 Record 로 읽는다. 값을 바꿔야 하면(시각 · 객체) 멈춘다
// - 생성 결과는 openapi-typescript 가 만든 openapi.d.ts 와 컴파일 때 맞춰 본다 (이 스크립트의 실수를 잡는다)
// - 다루지 않는 JSON Schema 기능 · 응답 형식을 만나면 틀린 코드를 만들지 않고 멈춘다. 설명용 키(examples 등)는 지나간다
//
// - 계약에 description 이 없는 곳은 schema-descriptions.mjs 의 설명을 JSDoc 으로 넣는다
//
// 흐름: applyDescriptions(설명 보태기) → classify(응답 · 요청 컴포넌트 나누기 · 정렬) → enumCode · responseCode · requestCode(컴포넌트별 코드 조각)
//       → parameterCode · eventStreamCode(경로별 코드 조각) → generate(조립)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { DESCRIPTIONS } from "./schema-descriptions.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OPENAPI_PATH = resolve(ROOT, "contracts/openapi.json");
const OUT_PATH = resolve(ROOT, "src/api/generated/schemas.generated.ts");

/** JSON 응답 · 요청 본문의 형식 */
const JSON_MEDIA_TYPE = "application/json";

/** 이벤트 스트림 응답의 형식 (itemSchema 로 이벤트를 적는다) */
const EVENT_STREAM_MEDIA_TYPE = "text/event-stream";

/**
 * @typedef {object} Schema openapi.json 의 스키마 (이 스크립트가 다루는 부분만)
 * @property {string} [$ref]
 * @property {string} [type]
 * @property {string} [format]
 * @property {string} [pattern]
 * @property {string} [description]
 * @property {boolean} [deprecated]
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {number} [maxLength]
 * @property {number} [minLength]
 * @property {unknown} [default]
 * @property {string | number | boolean} [const]
 * @property {string[]} [enum]
 * @property {string[]} [required]
 * @property {Schema} [items]
 * @property {Schema[]} [anyOf]
 * @property {Schema[]} [oneOf]
 * @property {Record<string, Schema>} [properties]
 * @property {boolean | Schema} [additionalProperties]
 * @property {string} [contentMediaType]
 * @property {Schema} [contentSchema]
 */

/**
 * @typedef {object} EventStream 이벤트 스트림 응답 하나
 * @property {string} label 사람이 읽는 이름 (예: POST /ask)
 * @property {string} segment 경로 첫 단어 (예: ask). 생성하는 이름의 앞머리
 * @property {{ name: string, component: string }[]} events 이벤트 이름 · data 컴포넌트 (계약 순서)
 */

/**
 * @typedef {object} Context 생성 중에 함께 쓰는 정보
 * @property {Record<string, Schema>} schemas openapi.json 의 components.schemas
 * @property {(name: string) => boolean} isEnum 값 목록(enum) 컴포넌트인지
 */

/** @typedef {{ code: string, checks: string[], names: string[] }} Piece 컴포넌트 하나의 코드 조각 · 타입 확인 · 내보내는 이름 */

/** 코드에 반영하는 키 */
const HANDLED_KEYS = new Set([
  "$ref",
  "type",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "maxLength",
  "minLength",
  "default",
  "const",
  "enum",
  "required",
  "items",
  "anyOf",
  "properties",
  "additionalProperties",
]);

/** 설명용 키. 검증에 영향이 없어 지나간다 (description · deprecated 는 JSDoc 으로 옮긴다) */
const ANNOTATION_KEYS = new Set([
  "title",
  "description",
  "examples",
  "example",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
]);

/** 생성 파일 머리. 파라미터 값 목록이 있으면 openapi-typescript 의 operations 도 가져와 맞춰 본다 */
function header(/** @type {boolean} */ usesOperations) {
  const types = usesOperations ? "components, operations" : "components";
  return `// 이 파일은 scripts/gen-schemas.mjs 가 contracts/openapi.json 에서 만든다. 손으로 고치지 않는다 (npm run gen:api).
// 서버 형식(snake_case) zod 스키마(*Raw), 화면 타입(camelCase), 서버 → 화면 변환 함수(to*), 화면 → 서버 요청 본문 함수(to*Body),
// 요청 제약 상수(*_MAX_LENGTH · *_PATTERN · *_MAXIMUM 등), 파라미터 값 목록(*S · *_DEFAULT), 이벤트 스트림(*_EVENTS · *Event · *EventDataSchemas).

import { z } from "zod";

import type { ${types} } from "./openapi";

type Schemas = components["schemas"];
`;
}

// ---------------------------------------------------------------------------
// 이름 · 스키마 모양을 다루는 작은 함수
// ---------------------------------------------------------------------------

/** @param {string} message */
function fail(message) {
  throw new Error(`gen-schemas: ${message}`);
}

/** @param {string} ref */
function refName(ref) {
  return ref.split("/").at(-1) ?? fail(`잘못된 $ref: ${ref}`);
}

/** snake_case → camelCase. 앞 밑줄은 그대로 두고, 연속 밑줄은 하나로 본다 (_links → _links, a__b → aB) */
function camelKey(/** @type {string} */ key) {
  return key.replace(/(?<=[A-Za-z0-9])_+([A-Za-z0-9])/g, (_m, c) => c.toUpperCase());
}

/** PascalCase 이름 → 변수 이름 (HTTPValidationError → httpValidationError) */
function varName(/** @type {string} */ name) {
  const lowered = name.replace(/^[A-Z]+(?=[A-Z][a-z]|$)/, (m) => m.toLowerCase());
  return lowered.charAt(0).toLowerCase() + lowered.slice(1);
}

/** 이름 → 대문자 상수 이름 (RetrievalMode → RETRIEVAL_MODE, session_id → SESSION_ID) */
function upperSnake(/** @type {string} */ name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/** snake_case · 경로 단어 → PascalCase 타입 이름 (ask → Ask, retrieval_mode → RetrievalMode) */
function pascalCase(/** @type {string} */ name) {
  const camel = camelKey(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** 키가 자유로운 객체의 값 스키마 (additionalProperties 가 스키마일 때). 아니면 undefined */
function dictValue(/** @type {Schema} */ s) {
  return typeof s.additionalProperties === "object" ? s.additionalProperties : undefined;
}

/** 값 목록 상수 이름. 영어 복수형 (RetrievalMode → RETRIEVAL_MODES, AnswerStatus → ANSWER_STATUSES, Category → CATEGORIES) */
function listName(/** @type {string} */ name) {
  const word = upperSnake(name);
  if (/[^AEIOU]Y$/.test(word)) {
    return `${word.slice(0, -1)}IES`;
  }
  return /(S|X|Z|CH|SH)$/.test(word) ? `${word}ES` : `${word}S`;
}

/** @param {Schema} s @param {string} where */
function checkKeys(s, where) {
  for (const key of Object.keys(s)) {
    if (!HANDLED_KEYS.has(key) && !ANNOTATION_KEYS.has(key)) {
      fail(`${where}: 다루지 않는 키 "${key}" — 스크립트를 고쳐야 한다`);
    }
  }
}

/** anyOf 가 [X, null] 이면 X, 아니면 undefined */
function nullableInner(/** @type {Schema} */ s) {
  if (!s.anyOf) {
    return undefined;
  }
  const others = s.anyOf.filter((x) => x.type !== "null");
  return others.length === 1 && others.length < s.anyOf.length ? others[0] : undefined;
}

/** 아무 값이나 되는 스키마 ({}, 설명만 있는 것) */
function isAny(/** @type {Schema} */ s) {
  return (
    s.$ref === undefined &&
    s.type === undefined &&
    s.anyOf === undefined &&
    s.const === undefined &&
    s.enum === undefined
  );
}

/** 스키마가 참조하는 컴포넌트 이름들 */
function refsOf(/** @type {Schema} */ s) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {Schema | undefined} */ x) => {
    if (!x) {
      return;
    }
    if (x.$ref) {
      out.push(refName(x.$ref));
    }
    walk(x.items);
    walk(dictValue(x));
    x.anyOf?.forEach(walk);
    Object.values(x.properties ?? {}).forEach(walk);
  };
  walk(s);
  return out;
}

/** 스키마 안 어딘가에 date-time 이 있는지 */
function hasDateTime(/** @type {Schema} */ s) {
  const value = dictValue(s);
  return (
    (s.type === "string" && s.format === "date-time") ||
    (s.items !== undefined && hasDateTime(s.items)) ||
    (value !== undefined && hasDateTime(value)) ||
    (s.anyOf?.some(hasDateTime) ?? false)
  );
}

/** 설명 조각을 " · " 로 잇는다. 하나도 없으면 undefined */
function joinNotes(/** @type {(string | undefined)[]} */ notes) {
  const text = notes.filter((n) => n !== undefined && n !== "").join(" · ");
  return text === "" ? undefined : text;
}

/** 한 줄 JSDoc. 설명이 없으면 빈 문자열 */
function doc(/** @type {(string | undefined)[]} */ notes, indent = "") {
  const text = joinNotes(notes);
  return text === undefined ? "" : `${indent}/** ${text.replace(/\*\//g, "* /")} */\n`;
}

// ---------------------------------------------------------------------------
// 0. 설명 보태기
// ---------------------------------------------------------------------------

/**
 * 계약에 없는 설명(schema-descriptions.mjs)을 스키마의 description 으로 보탠 사본을 만든다.
 * 없는 컴포넌트 · 필드를 가리키거나 계약에 이미 description 이 있으면 멈춘다 (설명이 두 곳에서 어긋나지 않게)
 *
 * @param {Record<string, Schema>} schemas
 * @param {Record<string, string>} descriptions "컴포넌트" 또는 "컴포넌트.필드" → 설명
 * @returns {Record<string, Schema>}
 */
function applyDescriptions(schemas, descriptions) {
  /** @type {Record<string, Schema>} */
  const out = JSON.parse(JSON.stringify(schemas)); // openapi.json 에서 읽은 값이라 JSON 사본으로 충분하다
  for (const [path, text] of Object.entries(descriptions)) {
    const [name = "", key] = path.split(".");
    const component = out[name] ?? fail(`schema-descriptions.mjs: 없는 컴포넌트 "${name}"`);
    const target =
      key === undefined
        ? component
        : (component.properties?.[key] ?? fail(`schema-descriptions.mjs: 없는 필드 "${path}"`));
    if (target.description !== undefined) {
      fail(`schema-descriptions.mjs: 계약에 "${path}" 설명이 생겼다. 이 항목을 지운다`);
    }
    target.description = text;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. 컴포넌트 나누기 · 정렬
// ---------------------------------------------------------------------------

/** 이 스키마에 허용한 키(와 설명용 키)만 있는지 본다 */
function checkOnlyKeys(
  /** @type {Record<string, unknown>} */ s,
  /** @type {string[]} */ allowed,
  /** @type {string} */ where,
) {
  for (const key of Object.keys(s)) {
    if (!allowed.includes(key) && !ANNOTATION_KEYS.has(key)) {
      fail(`${where}: 다루지 않는 키 "${key}" — 스크립트를 고쳐야 한다`);
    }
  }
}

/**
 * 이벤트 스트림 itemSchema 의 항목 하나 → 이벤트 이름 · data 컴포넌트.
 * { type: object, required: [event, data], properties: { event: { const }, data: { type: string, contentMediaType: json, contentSchema: { $ref } } } }
 * 꼴만 다룬다 (data 가 JSON 객체 컴포넌트 하나인 이벤트)
 */
function eventOf(/** @type {Schema} */ item, /** @type {string} */ where) {
  const shape = `${where}: 다루지 않는 이벤트 모양 — event 이름 const 와 data 의 contentSchema $ref 만 다룬다`;
  checkOnlyKeys(item, ["type", "required", "properties"], where);
  const { event, data, ...rest } = item.properties ?? {};
  const required = [...(item.required ?? [])].sort().join(",");
  if (item.type !== "object" || required !== "data,event" || Object.keys(rest).length > 0) {
    fail(shape);
  }
  if (event === undefined || data === undefined) {
    return fail(shape);
  }
  checkOnlyKeys(event, ["const"], `${where}.event`);
  checkOnlyKeys(data, ["type", "contentMediaType", "contentSchema"], `${where}.data`);
  const ref = data.contentSchema?.$ref;
  if (
    typeof event.const !== "string" ||
    data.type !== "string" ||
    data.contentMediaType !== JSON_MEDIA_TYPE ||
    ref === undefined ||
    Object.keys(data.contentSchema ?? {}).length !== 1
  ) {
    return fail(shape);
  }
  return { name: event.const, component: refName(ref) };
}

/**
 * paths 의 이벤트 스트림 응답들. 응답 형식은 JSON 과 이벤트 스트림만 다루고, 그 밖의 형식이면 멈춘다
 *
 * @returns {EventStream[]}
 */
function eventStreamsOf(/** @type {Record<string, Record<string, any>>} */ paths) {
  /** @type {EventStream[]} */
  const streams = [];
  for (const [path, ops] of Object.entries(paths)) {
    const segment = path.split("/").find((s) => s !== "") ?? fail(`잘못된 경로: ${path}`);
    for (const [method, op] of Object.entries(ops)) {
      for (const [status, res] of Object.entries(op.responses ?? {})) {
        const where = `${method.toUpperCase()} ${path} ${status}`;
        for (const [mediaType, content] of Object.entries(res.content ?? {})) {
          if (mediaType === JSON_MEDIA_TYPE) {
            continue;
          }
          if (mediaType !== EVENT_STREAM_MEDIA_TYPE) {
            fail(`${where}: 다루지 않는 응답 형식 "${mediaType}"`);
          }
          checkOnlyKeys(content, ["itemSchema"], `${where} ${mediaType}`);
          const items = content.itemSchema ?? fail(`${where}: 이벤트 스트림에 itemSchema 가 없다`);
          checkOnlyKeys(items, ["oneOf"], `${where} itemSchema`);
          const events = (items.oneOf ?? fail(`${where}: itemSchema 에 oneOf 가 없다`)).map(
            (/** @type {Schema} */ item, /** @type {number} */ i) =>
              eventOf(item, `${where} itemSchema.oneOf[${i}]`),
          );
          const names = events.map((e) => e.name);
          if (new Set(names).size !== names.length) {
            fail(`${where}: 이벤트 이름이 겹친다 (${names.join(", ")})`);
          }
          streams.push({ label: `${method.toUpperCase()} ${path}`, segment, events });
        }
      }
    }
  }
  return streams;
}

/** paths 에서 요청 본문 · 응답(이벤트 data 포함)이 참조하는 컴포넌트 이름 (참조를 따라 닿는 것까지) */
function reachableFromPaths(
  /** @type {Record<string, Schema>} */ schemas,
  /** @type {Record<string, Record<string, any>>} */ paths,
) {
  /** @type {string[]} */
  const responseRoots = eventStreamsOf(paths).flatMap((stream) =>
    stream.events.map((e) => e.component),
  );
  /** @type {string[]} */
  const requestRoots = [];
  for (const ops of Object.values(paths)) {
    for (const op of Object.values(ops)) {
      const body = op.requestBody?.content?.[JSON_MEDIA_TYPE]?.schema;
      if (body) {
        requestRoots.push(...refsOf(body));
      }
      for (const res of Object.values(op.responses ?? {})) {
        const schema = res.content?.[JSON_MEDIA_TYPE]?.schema;
        if (schema) {
          responseRoots.push(...refsOf(schema));
        }
      }
    }
  }
  const reach = (/** @type {string[]} */ roots) => {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length > 0) {
      const name = stack.pop();
      if (name === undefined || seen.has(name)) {
        continue;
      }
      seen.add(name);
      stack.push(...refsOf(schemas[name] ?? fail(`없는 컴포넌트: ${name}`)));
    }
    return seen;
  };
  return { responseNames: reach(responseRoots), requestNames: reach(requestRoots) };
}

/** 참조하는 컴포넌트가 먼저 나오도록 정렬한다 (zod 스키마는 정의 순서가 중요하다) */
function dependencyOrder(/** @type {Record<string, Schema>} */ schemas) {
  /** @type {string[]} */
  const ordered = [];
  const visit = (/** @type {string} */ name, /** @type {Set<string>} */ path) => {
    if (ordered.includes(name)) {
      return;
    }
    if (path.has(name)) {
      fail(`순환 참조: ${name}`);
    }
    path.add(name);
    refsOf(schemas[name]).forEach((dep) => visit(dep, path));
    path.delete(name);
    ordered.push(name);
  };
  Object.keys(schemas)
    .sort()
    .forEach((name) => visit(name, new Set()));
  return ordered;
}

// ---------------------------------------------------------------------------
// 2. 스키마 → 코드 식 (zod · 화면 타입 · 변환)
// ---------------------------------------------------------------------------

/** 서버 형식 zod 식. 다루지 않는 기능이면 멈춘다 */
function zodOf(/** @type {Context} */ ctx, /** @type {Schema} */ s, /** @type {string} */ where) {
  checkKeys(s, where);
  if (s.$ref) {
    const name = refName(s.$ref);
    return ctx.isEnum(name) ? `${varName(name)}Schema` : `${varName(name)}Raw`;
  }
  const inner = nullableInner(s);
  if (inner) {
    return `${zodOf(ctx, inner, where)}.nullable()`;
  }
  if (s.anyOf) {
    return `z.union([${s.anyOf.map((x) => zodOf(ctx, x, where)).join(", ")}])`;
  }
  if (s.const !== undefined) {
    return `z.literal(${JSON.stringify(s.const)})`;
  }
  if (s.enum) {
    return `z.enum(${JSON.stringify(s.enum)})`;
  }
  switch (s.type) {
    case "string":
      return zodStringOf(s, where);
    case "integer":
    case "number": {
      let out = s.type === "integer" ? "z.number().int()" : "z.number()";
      if (s.minimum !== undefined) {
        out += `.min(${s.minimum})`;
      }
      if (s.maximum !== undefined) {
        out += `.max(${s.maximum})`;
      }
      return out;
    }
    case "boolean":
      return "z.boolean()";
    case "array":
      return `z.array(${zodOf(ctx, s.items ?? fail(`${where}: items 없는 배열`), `${where}[]`)})`;
    case "object": {
      if (s.properties) {
        fail(`${where}: 이름 없는 객체는 다루지 않는다 (컴포넌트로 빼야 한다)`);
      }
      if (s.additionalProperties === false) {
        fail(`${where}: 키가 없는 객체(additionalProperties false)는 다루지 않는다`);
      }
      // 키가 자유로운 객체: 키는 데이터라 camelCase 로 바꾸지 않는다
      const value = dictValue(s);
      return `z.record(z.string(), ${value ? zodOf(ctx, value, `${where}{}`) : "z.unknown()"})`;
    }
    case undefined:
      return "z.unknown()"; // {} = 아무 값
    default:
      return fail(`${where}: 다루지 않는 type "${s.type}"`);
  }
}

/** 문자열 zod 식 (시각 · 길이 · 형식) */
function zodStringOf(/** @type {Schema} */ s, /** @type {string} */ where) {
  if (s.format === "date-time") {
    // 서버(pydantic)는 UTC 시각을 Z 로, 다른 시간대는 +09:00 처럼 보낸다
    return "z.iso.datetime({ offset: true })";
  }
  if (s.format !== undefined) {
    fail(`${where}: 다루지 않는 format "${s.format}"`);
  }
  let out = "z.string()";
  if (s.minLength !== undefined) {
    out += `.min(${s.minLength})`;
  }
  if (s.maxLength !== undefined) {
    out += `.max(${s.maxLength})`;
  }
  if (s.pattern !== undefined) {
    out += `.regex(new RegExp(${JSON.stringify(s.pattern)}))`;
  }
  return out;
}

/** 값 자체의 화면 타입. 필드가 비었을 때 붙는 null · [] 는 responseField 가 정한다 */
function screenTypeOf(/** @type {Schema} */ s) {
  if (s.$ref) {
    return refName(s.$ref);
  }
  const inner = nullableInner(s);
  if (inner) {
    return `${screenTypeOf(inner)} | null`;
  }
  if (s.anyOf) {
    return s.anyOf.map(screenTypeOf).join(" | ");
  }
  if (s.const !== undefined) {
    return JSON.stringify(s.const);
  }
  if (s.enum) {
    return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  }
  switch (s.type) {
    case "string":
      return s.format === "date-time" ? "number" : "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array": {
      const item = screenTypeOf(s.items ?? {});
      return item.includes("|") ? `(${item})[]` : `${item}[]`;
    }
    case "object": {
      const value = dictValue(s);
      return `Record<string, ${value ? screenTypeOf(value) : "unknown"}>`;
    }
    default:
      return "unknown";
  }
}

/** 서버 값 식(access) → 화면 값 식. 바꿀 것이 없으면 access 그대로 */
function convertOf(
  /** @type {Context} */ ctx,
  /** @type {Schema} */ s,
  /** @type {string} */ access,
) {
  if (s.$ref) {
    return ctx.isEnum(refName(s.$ref)) ? access : `to${refName(s.$ref)}(${access})`;
  }
  const inner = nullableInner(s);
  if (inner) {
    const converted = convertOf(ctx, inner, access);
    return converted === access ? access : `${access} == null ? null : ${converted}`;
  }
  if (s.type === "string" && s.format === "date-time") {
    return `Date.parse(${access})`;
  }
  if (s.type === "array" && s.items) {
    const converted = convertOf(ctx, s.items, "item");
    return converted === "item" ? access : `${access}.map((item) => ${converted})`;
  }
  const value = dictValue(s);
  if (value && convertOf(ctx, value, "value") !== "value") {
    fail(`${access}: 키가 자유로운 객체의 값을 바꾸는 것(객체 · 시각)은 아직 다루지 않는다`);
  }
  return access;
}

/**
 * 응답 필드 하나의 화면 타입 · 변환 식 · 규칙 설명. 필드를 한 번만 분류해 셋을 함께 만든다 (서로 어긋나지 않게)
 * - 늘 있음(필수 · 기본값 있음): 값 그대로 변환
 * - 없을 수 있는 배열: [] 로 채운다
 * - 아무 값: unknown 그대로
 * - 그 밖에 없을 수 있는 값($ref · enum · const 포함): null 로 채운다
 *
 * @returns {{ type: string, expr: string, rule: string | undefined }}
 */
function responseField(
  /** @type {Context} */ ctx,
  /** @type {string} */ key,
  /** @type {Schema} */ p,
  /** @type {boolean} */ isRequired,
) {
  const access = `raw.${key}`;
  const timeRule = hasDateTime(p) ? "ms 시각 (서버의 date-time 을 바꾼 값)" : undefined;
  if (isRequired || p.default !== undefined) {
    return { type: screenTypeOf(p), expr: convertOf(ctx, p, access), rule: timeRule };
  }
  if (p.type === "array") {
    return {
      type: screenTypeOf(p),
      expr: convertOf(ctx, p, `(${access} ?? [])`),
      rule: joinNotes([timeRule, "서버가 보내지 않으면 빈 목록"]),
    };
  }
  if (isAny(p)) {
    return { type: "unknown", expr: access, rule: undefined };
  }
  const inner = nullableInner(p) ?? p;
  const converted = convertOf(ctx, inner, access);
  return {
    type: `${screenTypeOf(inner)} | null`,
    expr: converted === access ? `${access} ?? null` : `${access} == null ? null : ${converted}`,
    rule: joinNotes([timeRule, "서버가 보내지 않으면 null"]),
  };
}

/** 요청 필드는 평평하게만 바꾼다 (중첩 객체 · 시각 · 여러 형식은 본문 변환을 따로 만들어야 해서 멈춘다) */
function checkRequestField(
  /** @type {Context} */ ctx,
  /** @type {Schema} */ p,
  /** @type {string} */ where,
) {
  zodOf(ctx, p, where); // 다루지 않는 JSON Schema 기능이면 여기서 멈춘다
  const target = nullableInner(p) ?? p;
  const item = target.type === "array" ? (target.items ?? {}) : target;
  const isObjectRef = item.$ref !== undefined && !ctx.isEnum(refName(item.$ref));
  if (isObjectRef || item.type === "object" || hasDateTime(target) || target.anyOf) {
    fail(
      `${where}: 요청의 중첩 객체 · 시각 · 여러 형식 필드는 아직 다루지 않는다 (요청 본문 변환을 고쳐야 한다)`,
    );
  }
}

/** 한 객체 안에서 camelCase 키가 겹치지 않는다 */
function checkCamelKeys(/** @type {string} */ name, /** @type {string[]} */ keys) {
  const seen = new Map();
  for (const key of keys) {
    const camel = camelKey(key);
    if (seen.has(camel)) {
      fail(`${name}: "${seen.get(camel)}" 와 "${key}" 가 같은 화면 키 "${camel}" 이 된다`);
    }
    seen.set(camel, key);
  }
}

// ---------------------------------------------------------------------------
// 3. 컴포넌트별 코드 조각
// ---------------------------------------------------------------------------

/** 값 목록(enum) 컴포넌트: 상수 배열 · 유니온 타입 · zod 스키마 */
function enumCode(/** @type {string} */ name, /** @type {Schema} */ s) {
  const list = listName(name);
  const v = varName(name);
  /** @type {Piece} */
  const piece = {
    code: `${doc([s.description ?? `${name} 값 목록`])}export const ${list} = ${JSON.stringify(s.enum)} as const;
/** ${list} 의 값 하나 */
export type ${name} = (typeof ${list})[number];
/** ${name} 검증 */
export const ${v}Schema = z.enum(${list});
`,
    checks: [`Expect<Same<${name}, Schemas["${name}"]>>`],
    names: [list, name, `${v}Schema`],
  };
  return piece;
}

/** 응답 객체 컴포넌트: 서버 형식 zod 스키마 · 화면 타입 · 서버 → 화면 변환 함수 */
function responseCode(
  /** @type {Context} */ ctx,
  /** @type {string} */ name,
  /** @type {Schema} */ s,
) {
  const v = varName(name);
  const required = new Set(s.required ?? []);
  const props = Object.entries(s.properties ?? {});

  const fields = props.map(([key, p]) => {
    let expr = zodOf(ctx, p, `${name}.${key}`);
    if (!required.has(key)) {
      expr += p.default !== undefined ? `.default(${JSON.stringify(p.default)})` : ".optional()";
    }
    return `  ${key}: ${expr},`;
  });

  // 화면 타입과 변환 함수는 필드마다 한 번 분류한 결과로 함께 만든다
  const planned = props.map(([key, p]) => ({
    key,
    p,
    ...responseField(ctx, key, p, required.has(key)),
  }));
  const typeFields = planned.map(
    ({ key, p, type, rule }) =>
      `${doc([p.description, rule, p.deprecated ? "@deprecated" : undefined], "  ")}  ${camelKey(key)}: ${type};`,
  );

  /** @type {Piece} */
  const piece = {
    code: `${doc([s.description ?? `${name} 서버 형식 검증`])}export const ${v}Raw = z.object({
${fields.join("\n")}
});

${doc([s.description ?? `${name} 화면 형식`])}export interface ${name} {
${typeFields.join("\n")}
}

/** ${name} 서버 형식 → 화면 형식 */
export function to${name}(raw: z.output<typeof ${v}Raw>): ${name} {
  return {
${planned.map(({ key, expr }) => `    ${camelKey(key)}: ${expr},`).join("\n")}
  };
}
`,
    checks: [`Expect<Same<z.output<typeof ${v}Raw>, Schemas["${name}"]>>`],
    names: [`${v}Raw`, name, `to${name}`],
  };
  return piece;
}

/** 요청 객체 컴포넌트: 제약 상수 · <이름>Input 타입 · 화면 → 서버 요청 본문 함수 */
function requestCode(
  /** @type {Context} */ ctx,
  /** @type {string} */ name,
  /** @type {Schema} */ s,
) {
  const required = new Set(s.required ?? []);
  const props = Object.entries(s.properties ?? {});
  const input = `${name}Input`;
  /** @type {string[]} */
  const names = [input, `to${name}Body`];
  props.forEach(([key, p]) => checkRequestField(ctx, p, `${name}.${key}`));

  // 요청 제약 상수: 화면이 보내기 전에 막는 데 쓴다 (손으로 옮겨 적지 않게)
  const constants = props.flatMap(([key, p]) => {
    const target = nullableInner(p) ?? p;
    const prefix = `${upperSnake(name)}_${upperSnake(key)}`;
    /** @type {string[]} */
    const out = [];
    if (target.maxLength !== undefined) {
      names.push(`${prefix}_MAX_LENGTH`);
      out.push(`/** ${name}.${key} 최대 길이 (계약 maxLength) */
export const ${prefix}_MAX_LENGTH = ${target.maxLength};`);
    }
    if (target.minLength !== undefined) {
      names.push(`${prefix}_MIN_LENGTH`);
      out.push(`/** ${name}.${key} 최소 길이 (계약 minLength) */
export const ${prefix}_MIN_LENGTH = ${target.minLength};`);
    }
    if (target.pattern !== undefined) {
      names.push(`${prefix}_PATTERN`);
      out.push(`/** ${name}.${key} 형식 (계약 pattern) */
export const ${prefix}_PATTERN = new RegExp(${JSON.stringify(target.pattern)});`);
    }
    if (target.minimum !== undefined) {
      names.push(`${prefix}_MINIMUM`);
      out.push(`/** ${name}.${key} 최솟값 (계약 minimum) */
export const ${prefix}_MINIMUM = ${target.minimum};`);
    }
    if (target.maximum !== undefined) {
      names.push(`${prefix}_MAXIMUM`);
      out.push(`/** ${name}.${key} 최댓값 (계약 maximum) */
export const ${prefix}_MAXIMUM = ${target.maximum};`);
    }
    return out;
  });
  // 기본값이 있는 선택 필드: 화면은 빼고 보내도 되고, 본문에는 기본값을 채운다
  const defaultOf = (/** @type {string} */ key, /** @type {Schema} */ p) =>
    required.has(key) || p.default === undefined ? undefined : JSON.stringify(p.default);
  const typeFields = props.map(([key, p]) => {
    const optional = required.has(key) ? "" : "?";
    const fallback = defaultOf(key, p);
    const notes = [
      p.description,
      fallback === undefined ? undefined : `빼면 ${fallback}`,
      p.deprecated ? "@deprecated" : undefined,
    ];
    return `${doc(notes, "  ")}  ${camelKey(key)}${optional}: ${screenTypeOf(p)};`;
  });
  const bodyFields = props.map(([key, p]) => {
    const fallback = defaultOf(key, p);
    const value = `request.${camelKey(key)}`;
    return `    ${key}: ${fallback === undefined ? value : `${value} ?? ${fallback}`},`;
  });

  /** @type {Piece} */
  const piece = {
    code: `${constants.join("\n\n")}

${doc([s.description, `${name} 화면 형식 (요청). 선택 여부는 계약 그대로다`])}export interface ${input} {
${typeFields.join("\n")}
}

/** ${name} 화면 형식 → 서버 형식 요청 본문 */
export function to${name}Body(request: ${input}): Schemas["${name}"] {
  return {
${bodyFields.join("\n")}
  };
}
`,
    checks: [],
    names,
  };
  return piece;
}

/** 파라미터 값 목록 (enum): 상수 배열 · 유니온 타입 · 기본값 상수. openapi-typescript 의 operations 와 맞춰 본다 */
function parameterEnumCode(
  /** @type {string} */ label,
  /** @type {string} */ segment,
  /** @type {Record<string, any>} */ op,
  /** @type {{ name: string, in: string, schema: Schema }} */ parameter,
) {
  const values = parameter.schema.enum ?? [];
  const type = `${pascalCase(segment)}${pascalCase(parameter.name)}`;
  const list = listName(type);
  const operationId =
    op.operationId ?? fail(`${label}: operationId 가 없어 생성 타입과 맞춰 볼 수 없다`);
  const names = [list, type];
  let code = `/** ${label} 의 ${parameter.name} 값 목록 (계약 ${parameter.in} 파라미터) */
export const ${list} = ${JSON.stringify(values)} as const;
/** ${list} 의 값 하나 */
export type ${type} = (typeof ${list})[number];
`;
  if (parameter.schema.default !== undefined) {
    if (!values.includes(String(parameter.schema.default))) {
      fail(`${label} ${parameter.name}: 기본값이 값 목록에 없다`);
    }
    names.push(`${upperSnake(type)}_DEFAULT`);
    code += `/** ${label} 의 ${parameter.name} 기본값 (보내지 않으면 서버가 쓰는 값) */
export const ${upperSnake(type)}_DEFAULT: ${type} = ${JSON.stringify(parameter.schema.default)};
`;
  }
  const where = `operations["${operationId}"]["parameters"]["${parameter.in}"]`;
  return {
    code,
    checks: [`Expect<Same<${type}, NonNullable<NonNullable<${where}>["${parameter.name}"]>>>`],
    names,
  };
}

/**
 * 파라미터 상수 (손으로 옮겨 적지 않게).
 * 최댓값 예: /session/{session_id} 의 limit → SESSION_LIMIT_MAXIMUM. 값 목록 예: /ask 의 mode → ASK_MODES · AskMode · ASK_MODE_DEFAULT
 */
function parameterCode(/** @type {Record<string, Record<string, any>>} */ paths) {
  /** @type {Piece[]} */
  const pieces = [];
  for (const [path, ops] of Object.entries(paths)) {
    const segment = path.split("/").find((s) => s !== "") ?? fail(`잘못된 경로: ${path}`);
    for (const [method, op] of Object.entries(ops)) {
      const label = `${method.toUpperCase()} ${path}`;
      for (const parameter of op.parameters ?? []) {
        const schema = parameter.schema ?? {};
        checkKeys(schema, `${label} ${parameter.name}`);
        if (schema.enum) {
          pieces.push(parameterEnumCode(label, segment, op, parameter));
        }
        if (schema.maximum !== undefined) {
          const name = `${upperSnake(segment)}_${upperSnake(parameter.name)}_MAXIMUM`;
          pieces.push({
            code: `/** ${path} 의 ${parameter.name} 최댓값 (계약 maximum) */
export const ${name} = ${schema.maximum};
`,
            checks: [],
            names: [name],
          });
        }
      }
    }
  }
  return pieces;
}

/**
 * 이벤트 스트림 응답 하나: 이벤트 이름 목록 · 화면 형식 이벤트 유니온 · 이벤트 이름 → data 검증 · 변환 스키마.
 * 예: POST /ask → ASK_EVENTS · AskEventName · AskEvent · askEventDataSchemas
 */
function eventStreamCode(/** @type {Context} */ ctx, /** @type {EventStream} */ stream) {
  const prefix = pascalCase(stream.segment);
  const list = `${upperSnake(prefix)}_EVENTS`;
  const nameType = `${prefix}EventName`;
  const eventType = `${prefix}Event`;
  const schemasName = `${varName(prefix)}EventDataSchemas`;
  for (const { name, component } of stream.events) {
    const s = ctx.schemas[component] ?? fail(`${stream.label} ${name}: 없는 컴포넌트 ${component}`);
    if (!s.properties) {
      fail(`${stream.label} ${name}: data 는 객체 컴포넌트여야 한다 (${component})`);
    }
  }
  const union = stream.events
    .map(({ name, component }) => `  | { event: ${JSON.stringify(name)}; data: ${component} }`)
    .join("\n");
  const entries = stream.events
    .map(
      ({ name, component }) =>
        `  ${JSON.stringify(name)}: ${varName(component)}Raw.transform(to${component}),`,
    )
    .join("\n");
  /** @type {Piece} */
  const piece = {
    code: `/** ${stream.label} 의 ${EVENT_STREAM_MEDIA_TYPE} 이벤트 이름 (계약 itemSchema 순서) */
export const ${list} = ${JSON.stringify(stream.events.map((e) => e.name))} as const;
/** ${list} 의 값 하나 */
export type ${nameType} = (typeof ${list})[number];

/** ${stream.label} 의 이벤트 하나 (화면 형식). event 가 data 의 모양을 정한다 */
export type ${eventType} =
${union};

/** ${stream.label} 이벤트 이름 → data(JSON 으로 읽은 값) 서버 형식 검증 · 화면 형식 변환 */
export const ${schemasName} = {
${entries}
} satisfies { [E in ${eventType} as E["event"]]: z.ZodType<E["data"]> };
`,
    checks: [],
    names: [list, nameType, eventType, schemasName],
  };
  return piece;
}

/** 생성 결과가 openapi-typescript 의 타입과 같은지 확인하는 타입 목록 */
function checksCode(/** @type {string[]} */ checks) {
  return `// 생성한 스키마가 openapi-typescript 의 타입(openapi.d.ts)과 같은지 컴파일 때 확인한다 (생성 스크립트의 실수를 잡는다)
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Same<A, B> = Mutual<A, B> extends true ? Mutual<keyof A, keyof B> : false;
type Expect<T extends true> = T;
/** 생성 결과 확인용 (값으로 쓰지 않는다) */
export type GeneratedMatchesContract = [
${checks.map((c) => `  ${c},`).join("\n")}
];
`;
}

// ---------------------------------------------------------------------------
// 4. 조립
// ---------------------------------------------------------------------------

/**
 * 생성기. components 와 paths 를 읽어 응답 · 요청에 쓰이는 컴포넌트를 나누고 코드를 만든다.
 *
 * @param {{ components: { schemas: Record<string, Schema> }, paths: Record<string, Record<string, any>> }} api
 * @param {Record<string, string>} [descriptions] 계약에 없는 설명 ("컴포넌트" 또는 "컴포넌트.필드" → 설명)
 * @returns {string} 포맷하기 전의 TypeScript 코드
 */
export function generate(api, descriptions = {}) {
  const schemas = applyDescriptions(api.components.schemas, descriptions);
  /** @type {Context} */
  const ctx = { schemas, isEnum: (name) => Array.isArray(schemas[name]?.enum) };
  const { responseNames, requestNames } = reachableFromPaths(schemas, api.paths);

  /** @type {Piece[]} */
  const pieces = [];
  for (const name of dependencyOrder(schemas)) {
    const s = schemas[name];
    checkKeys(s, name);
    if (s.enum) {
      pieces.push(enumCode(name, s));
      continue;
    }
    if (!s.properties) {
      fail(`${name}: properties 없는 컴포넌트`);
    }
    checkCamelKeys(name, Object.keys(s.properties));
    if (responseNames.has(name) && requestNames.has(name)) {
      fail(`${name}: 요청 · 응답에 함께 쓰이는 컴포넌트는 아직 다루지 않는다`);
    }
    if (responseNames.has(name)) {
      pieces.push(responseCode(ctx, name, s));
    }
    if (requestNames.has(name)) {
      pieces.push(requestCode(ctx, name, s));
    }
  }
  const parameterPieces = parameterCode(api.paths);
  pieces.push(...parameterPieces);
  pieces.push(...eventStreamsOf(api.paths).map((stream) => eventStreamCode(ctx, stream)));

  // 같은 이름을 두 번 내보내지 않는다
  const exported = new Set();
  for (const n of pieces.flatMap((piece) => piece.names)) {
    if (exported.has(n)) {
      fail(`내보내는 이름 "${n}" 이 겹친다`);
    }
    exported.add(n);
  }

  // 파라미터 값 목록이 있을 때만 operations 를 가져온다 (쓰지 않는 import 는 타입 검사가 거절한다)
  const usesOperations = parameterPieces.some((piece) => piece.checks.length > 0);
  return [
    header(usesOperations),
    ...pieces.map((piece) => piece.code),
    checksCode(pieces.flatMap((piece) => piece.checks)),
  ].join("\n");
}

/** openapi.json 을 읽어 만든 코드를 프로젝트 Prettier 설정으로 포맷한다 */
export async function generateFormatted(openapiPath = OPENAPI_PATH) {
  const api = JSON.parse(readFileSync(openapiPath, "utf-8"));
  const options = (await resolveConfig(OUT_PATH)) ?? {};
  return format(generate(api, DESCRIPTIONS), { ...options, filepath: OUT_PATH });
}

async function main() {
  const formatted = await generateFormatted();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT_PATH, "utf-8");
    } catch {
      current = "";
    }
    if (current !== formatted) {
      process.stderr.write(
        "schemas.generated.ts 가 openapi.json 과 다르다. npm run gen:api 로 다시 만든다\n",
      );
      process.exit(1);
    }
    process.stdout.write("schemas.generated.ts 는 openapi.json 과 같다\n");
    return;
  }
  writeFileSync(OUT_PATH, formatted, "utf-8");
  process.stdout.write(`만들었다: ${OUT_PATH}\n`);
}

// 테스트에서 import 할 때는 실행하지 않는다
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
