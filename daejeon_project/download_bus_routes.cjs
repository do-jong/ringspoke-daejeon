
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ========================================
// 설정
// ========================================

// .env의 DATA_GO_KR_SERVICE_KEY를 읽는다 - 절대 키를 직접 코드에 넣지 말 것
function loadServiceKey() {
    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) {
        throw new Error(".env 파일을 찾을 수 없습니다.");
    }

    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        const separator = trimmed.indexOf("=");

        if (!trimmed || trimmed.startsWith("#") || separator === -1) {
            continue;
        }

        if (trimmed.slice(0, separator).trim() === "DATA_GO_KR_SERVICE_KEY") {
            return trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
        }
    }

    throw new Error(".env에 DATA_GO_KR_SERVICE_KEY가 없습니다.");
}

const API_KEY = loadServiceKey();

const BASE_URL = "https://apis.data.go.kr/6300000/busRouteInfo";

const OUTPUT_DIR = path.join(__dirname, "public", "data");

const DELAY_MS = 150;
const MAX_PAGES = 1000;

// API 목록
const API = {
    routeInfoAll: "getRouteInfoAll",
    stationByRouteAll: "getStaionByRouteAll",
    routeInfo: "getRouteInfo",
    stationByRoute: "getStaionByRoute"
};


// ========================================
// 공통 함수
// ========================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function saveXML(folder, filename, xml) {
    const dir = path.join(OUTPUT_DIR, folder);

    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
        path.join(dir, filename),
        xml,
        "utf8"
    );
}

function getHash(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function getTagValues(xml, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(
        `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`,
        "gi"
    );

    return [...xml.matchAll(regex)].map(match =>
        match[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/<[^>]+>/g, "")
            .trim()
    );
}

function getFirstTagValue(xml, names) {
    for (const name of names) {
        const values = getTagValues(xml, name);

        if (values.length > 0 && values[0] !== "") {
            return values[0];
        }
    }

    return null;
}

function getRecordCount(xml) {
    const tags = [
        "item",
        "itemList",
        "row",
        "record"
    ];

    let count = 0;

    for (const tag of tags) {
        count += getTagValues(xml, tag).length;
    }

    return count;
}


// ========================================
// API 호출
// ========================================

async function requestAPI(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}/${endpoint}`);

    url.searchParams.set("serviceKey", API_KEY);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/xml"
        },
        signal: AbortSignal.timeout(30000)
    });

    const xml = await response.text();

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${xml.slice(0, 500)}`
        );
    }

    if (!xml.trim()) {
        throw new Error("빈 응답이 반환되었습니다.");
    }

    return xml;
}


// ========================================
// 페이지 수 확인
// ========================================

function getTotalPages(xml) {
    const pageValue = getFirstTagValue(xml, [
        "totalPage",
        "totalPages",
        "totalPageCount",
        "itemPageCnt"
    ]);

    if (pageValue && /^\d+$/.test(pageValue)) {
        return Number(pageValue);
    }

    const totalCount = getFirstTagValue(xml, [
        "totalCount",
        "totalCnt",
        "total_count"
    ]);

    const pageSize = getFirstTagValue(xml, [
        "numOfRows",
        "pageSize",
        "itemCount"
    ]);

    if (
        totalCount &&
        pageSize &&
        Number(pageSize) > 0
    ) {
        return Math.ceil(
            Number(totalCount) / Number(pageSize)
        );
    }

    return null;
}


// ========================================
// 전체 페이지 다운로드
// ========================================

async function downloadAllPages(endpoint, folder) {
    console.log(`\n[${endpoint}] 다운로드 시작`);

    const seenHashes = new Set();

    let page = 1;
    let totalPages = null;
    let downloaded = 0;

    while (page <= MAX_PAGES) {
        let xml;

        try {
            xml = await requestAPI(endpoint, {
                reqPage: page
            });
        } catch (error) {
            if (page === 1) {
                throw error;
            }

            console.log(`페이지 ${page}에서 종료: ${error.message}`);
            break;
        }

        const hash = getHash(xml);

        // 이전 페이지와 동일한 응답이면 종료
        if (seenHashes.has(hash)) {
            console.log("중복 응답 감지: 다운로드 종료");
            break;
        }

        seenHashes.add(hash);

        if (page === 1) {
            totalPages = getTotalPages(xml);

            if (totalPages !== null) {
                console.log(`전체 페이지: ${totalPages}`);
            } else {
                console.log("전체 페이지 수 확인 불가: 응답을 확인하며 다운로드");
            }
        }

        const recordCount = getRecordCount(xml);

        // 데이터가 없는 페이지면 종료
        if (recordCount === 0) {
            if (page === 1) {
                saveXML(folder, "page_001.xml", xml);
                console.log("데이터가 없는 응답입니다. XML 원본을 저장했습니다.");
            }
            break;
        }

        saveXML(
            folder,
            `page_${String(page).padStart(3, "0")}.xml`,
            xml
        );

        downloaded++;

        console.log(
            `페이지 ${page}${totalPages ? `/${totalPages}` : ""} 저장 (${recordCount}개 항목)`
        );

        if (totalPages !== null && page >= totalPages) {
            break;
        }

        page++;

        await sleep(DELAY_MS);
    }

    console.log(`[${endpoint}] 다운로드 완료: ${downloaded}페이지`);

    return downloaded;
}


// ========================================
// 노선 ID 추출
// ========================================

function extractRouteIds() {
    const folder = path.join(OUTPUT_DIR, "route_info_all");

    if (!fs.existsSync(folder)) {
        throw new Error("전체 노선 기본정보 폴더가 없습니다.");
    }

    const files = fs.readdirSync(folder)
        .filter(file => file.endsWith(".xml"));

    const routeIds = new Set();

    // 노선 ID로 사용될 수 있는 XML 태그
    const possibleTags = [
        "ROUTE_CD",
        "ROUTE_ID",
        "BUS_ROUTE_ID",
        "busRouteId",
        "routeId"
    ];

    for (const filename of files) {
        const xml = fs.readFileSync(
            path.join(folder, filename),
            "utf8"
        );

        for (const tag of possibleTags) {
            const values = getTagValues(xml, tag);

            for (const value of values) {
                if (value) {
                    routeIds.add(value);
                }
            }
        }
    }

    return [...routeIds].sort();
}


// ========================================
// 노선별 API 다운로드
// ========================================

async function downloadByRoute(endpoint, folder, routeIds) {
    console.log(`\n[${endpoint}] 다운로드 시작`);
    console.log(`대상 노선: ${routeIds.length}개`);

    let success = 0;
    let failed = [];

    for (let i = 0; i < routeIds.length; i++) {
        const routeId = routeIds[i];

        try {
            const xml = await requestAPI(endpoint, {
                busRouteId: routeId
            });

            const filename = `${routeId.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`;

            saveXML(folder, filename, xml);

            success++;

        } catch (error) {
            failed.push({
                routeId,
                error: error.message
            });

            console.error(
                `실패: ${routeId} - ${error.message}`
            );
        }

        console.log(
            `[${i + 1}/${routeIds.length}] ${routeId}`
        );

        await sleep(DELAY_MS);
    }

    if (failed.length > 0) {
        const errorText = failed
            .map(item => `${item.routeId}: ${item.error}`)
            .join("\n");

        saveXML(
            folder,
            "failed_routes.txt",
            errorText
        );
    }

    console.log(`\n[${endpoint}] 결과`);
    console.log(`성공: ${success}`);
    console.log(`실패: ${failed.length}`);
}


// ========================================
// 전체 실행
// ========================================

async function main() {
    if (typeof fetch !== "function") {
        throw new Error("Node.js 18 이상 버전이 필요합니다.");
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log("====================================");
    console.log("대전광역시 버스 노선정보 전체 다운로드");
    console.log("====================================");

    // 1. 전체 노선 기본정보
    await downloadAllPages(
        API.routeInfoAll,
        "route_info_all"
    );

    // 2. 전체 노선 경유 정류소
    await downloadAllPages(
        API.stationByRouteAll,
        "station_by_route_all"
    );

    // 3. 전체 노선 기본정보에서 노선 ID 추출
    const routeIds = extractRouteIds();

    console.log(`\n추출된 노선 ID: ${routeIds.length}개`);

    if (routeIds.length === 0) {
        throw new Error(
            "노선 ID를 추출하지 못했습니다. route_info_all 폴더의 XML 태그를 확인하세요."
        );
    }

    // 4. 노선별 기본정보
    await downloadByRoute(
        API.routeInfo,
        "route_info",
        routeIds
    );

    // 5. 노선별 경유 정류소
    await downloadByRoute(
        API.stationByRoute,
        "station_by_route",
        routeIds
    );

    console.log("\n====================================");
    console.log("전체 다운로드 작업 종료");
    console.log(`저장 위치: ${OUTPUT_DIR}`);
    console.log("====================================");
}


main().catch(error => {
    console.error("\n다운로드 오류:");
    console.error(error);
    process.exitCode = 1;
});
