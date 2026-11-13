// llm-playground-wiki 의 API 계약(contracts/)을 이 레포의 contracts/ 로 복사하고, 사본이 계약 목록(manifest.json)과 맞는지 본다.
//
//   node scripts/sync-contracts.mjs                 옆에 clone 한 ../llm-playground-wiki/contracts 에서 가져온다
//   node scripts/sync-contracts.mjs <contracts 폴더>  다른 곳에서 가져온다 (예: C:/Work/llm-playground-wiki/contracts)
//   node scripts/sync-contracts.mjs --check         사본만 본다 (wiki 레포 없이. 다르면 종료 코드 1)
//
// 규칙
// - wiki 가 manifest.json 의 artifacts 에 적은 파일(openapi.json · examples/*.json)과 manifest.json · CHANGELOG.md 를 가져온다.
//   사본 폴더에 있던 다른 예시 파일은 지운다 (wiki 에서 지운 예시가 남지 않게)
// - 줄 끝은 LF 로 맞춘다. manifest 의 해시는 LF 기준이라 Windows 에서 CRLF 로 받은 wiki 사본도 같은 해시가 된다
// - 가져온 파일의 sha256 이 manifest 와 다르면 아무것도 쓰지 않고 멈춘다 (wiki 작업 트리가 커밋과 다른 경우)
// - package.json 의 wikiContract 에 manifest 의 contract_version 을 적는다. --check 는 이 값 · openapi.json 의 info.version 도 본다

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const TARGET_DIR = resolve(ROOT, "contracts");
const DEFAULT_SOURCE_DIR = resolve(ROOT, "../llm-playground-wiki/contracts");
const PACKAGE_PATH = resolve(ROOT, "package.json");
const MANIFEST = "manifest.json";
const CHANGELOG = "CHANGELOG.md";
const EXAMPLES_DIR = "examples";
const ARTIFACT_PREFIX = "contracts/"; // manifest 의 artifacts 키는 wiki 레포 루트 기준 경로다

/**
 * @typedef {object} Manifest wiki 의 contracts/manifest.json (이 스크립트가 읽는 부분만)
 * @property {string} contract_version
 * @property {Record<string, string>} artifacts "contracts/…" 경로 → "sha256:<hex>"
 */

/** @param {string} message */
function fail(message) {
  throw new Error(`sync-contracts: ${message}`);
}

/** CRLF · CR 을 LF 로 바꾼다 */
function toLf(/** @type {string} */ text) {
  return text.replace(/\r\n?/g, "\n");
}

function sha256(/** @type {string} */ text) {
  return `sha256:${createHash("sha256").update(text, "utf-8").digest("hex")}`;
}

/** @returns {Manifest} */
function parseManifest(/** @type {string} */ text, /** @type {string} */ where) {
  const value = JSON.parse(text);
  if (typeof value?.contract_version !== "string" || typeof value?.artifacts !== "object") {
    fail(`${where}: contract_version · artifacts 가 없다`);
  }
  return value;
}

/** manifest 의 artifacts 를 contracts 폴더 안 상대 경로로 바꾼다 (openapi.json · examples/…) */
function artifactFiles(/** @type {Manifest} */ manifest) {
  return Object.entries(manifest.artifacts).map(([path, hash]) => {
    if (!path.startsWith(ARTIFACT_PREFIX)) {
      fail(`manifest 의 artifacts 에 contracts/ 밖 경로가 있다: ${path}`);
    }
    return { file: path.slice(ARTIFACT_PREFIX.length), hash };
  });
}

/**
 * contracts 폴더의 파일을 읽어 manifest 해시와 맞춰 본다.
 *
 * @returns {{ manifest: Manifest, files: Map<string, string> }} 상대 경로 → LF 로 맞춘 내용 (manifest · CHANGELOG 포함)
 */
function readContracts(/** @type {string} */ dir) {
  const read = (/** @type {string} */ file) => {
    const path = join(dir, file);
    if (!existsSync(path)) {
      fail(`${path} 가 없다`);
    }
    return toLf(readFileSync(path, "utf-8"));
  };
  const manifestText = read(MANIFEST);
  const manifest = parseManifest(manifestText, join(dir, MANIFEST));
  /** @type {Map<string, string>} */
  const files = new Map([
    [MANIFEST, manifestText],
    [CHANGELOG, read(CHANGELOG)],
  ]);
  const mismatched = [];
  for (const { file, hash } of artifactFiles(manifest)) {
    const text = read(file);
    if (sha256(text) !== hash) {
      mismatched.push(file);
    }
    files.set(file, text);
  }
  if (mismatched.length > 0) {
    fail(`${dir}: manifest.json 의 해시와 다른 파일 — ${mismatched.join(", ")}`);
  }
  return { manifest, files };
}

/** 사본 폴더의 예시 중 manifest 에 없는 파일 */
function staleExamples(/** @type {Map<string, string>} */ files) {
  const dir = join(TARGET_DIR, EXAMPLES_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .map((name) => `${EXAMPLES_DIR}/${name}`)
    .filter((file) => !files.has(file));
}

function readPackage() {
  return JSON.parse(readFileSync(PACKAGE_PATH, "utf-8"));
}

/** 사본이 manifest 와 맞고, 계약 버전이 package.json · openapi.json 과 같은지 본다 */
function check() {
  const { manifest, files } = readContracts(TARGET_DIR);
  const version = manifest.contract_version;
  const problems = [];
  const stale = staleExamples(files);
  if (stale.length > 0) {
    problems.push(`manifest 에 없는 예시 — ${stale.join(", ")}`);
  }
  const recorded = readPackage().wikiContract;
  if (recorded !== version) {
    problems.push(`package.json 의 wikiContract(${recorded})가 계약 버전(${version})과 다르다`);
  }
  const openapiVersion = JSON.parse(files.get("openapi.json") ?? "{}").info?.version;
  if (openapiVersion !== version) {
    problems.push(
      `openapi.json 의 info.version(${openapiVersion})이 계약 버전(${version})과 다르다`,
    );
  }
  if (problems.length > 0) {
    fail(
      `contracts/ 사본이 맞지 않는다. npm run sync:contracts 로 다시 가져온다\n- ${problems.join("\n- ")}`,
    );
  }
  process.stdout.write(`contracts/ 는 wiki 계약 ${version} 과 같다\n`);
}

/** wiki 의 contracts 폴더에서 가져와 사본과 package.json 을 바꾼다 */
function sync(/** @type {string} */ sourceDir) {
  const { manifest, files } = readContracts(sourceDir);
  for (const file of staleExamples(files)) {
    rmSync(join(TARGET_DIR, file));
  }
  for (const [file, text] of files) {
    const path = join(TARGET_DIR, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf-8");
  }
  const pkg = readPackage();
  pkg.wikiContract = manifest.contract_version;
  writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
  process.stdout.write(
    `가져왔다: wiki 계약 ${manifest.contract_version} (${files.size}개 파일, ${sourceDir})\n`,
  );
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  check();
} else {
  sync(resolve(args[0] ?? DEFAULT_SOURCE_DIR));
}
