import { getBatchOnnadaCardCache, getOnnadaCardCache, setOnnadaCardCache, OnnadaCardCache } from "../db";

export interface OnnadaCardMeta {
  onnadaId: string;
  titleKo: string;
  titleJa?: string | null;
  poster: string;
  studio?: string | null;
  classification?: string | null;
  ageRating?: string | null;
  rating?: number | null;
}

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

// 24시간 인메모리 LRU 캐시
const memCache = new Map<string, { meta: OnnadaCardMeta | null; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeSearchKey(title: string): string {
  if (!title) return "";
  return title
    .trim()
    .replace(/[\[\(][^\]\)]*[\]\)]/g, "") // 괄호 내용 제거 (예: (2024), [자막])
    .replace(/[\~\!\@\#\$\%\^\&\*\_\+\=\`\{\}\|\:\;\"\'\<\>\?\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 온나다에서 단일 작품의 카드 메타데이터(포스터, 제작사, 분류, 등급)를 수집
 */
export async function fetchOnnadaCardMeta(
  title: string,
  originalTitle?: string
): Promise<OnnadaCardMeta | null> {
  const cleanKey = normalizeSearchKey(title) || title.trim();
  if (!cleanKey) return null;

  const now = Date.now();
  const cachedMem = memCache.get(cleanKey);
  if (cachedMem && now - cachedMem.timestamp < CACHE_TTL_MS) {
    return cachedMem.meta;
  }

  // 1. Neon DB 캐시 확인
  try {
    const dbCached = await getOnnadaCardCache(cleanKey);
    if (dbCached) {
      const meta: OnnadaCardMeta = {
        onnadaId: dbCached.onnada_id,
        titleKo: dbCached.title_ko,
        titleJa: dbCached.title_ja,
        poster: dbCached.poster_url,
        studio: dbCached.studio,
        classification: dbCached.classification,
        ageRating: dbCached.age_rating,
        rating: dbCached.rating,
      };
      memCache.set(cleanKey, { meta, timestamp: now });
      return meta;
    }
  } catch (err) {
    console.warn("[OnnadaCard] DB cache read error:", err);
  }

  // 2. 온나다 웹 검색 파싱
  const queriesToTry = [cleanKey];
  if (originalTitle && normalizeSearchKey(originalTitle) !== cleanKey) {
    queriesToTry.push(normalizeSearchKey(originalTitle));
  }

  let onnadaId = "";
  let posterUrl = "";
  let titleKo = "";
  let titleJa = "";
  let classification = "TV 시리즈";
  let ageRating = "";

  for (const q of queriesToTry) {
    if (!q) continue;
    try {
      const searchUrl = `https://onnada.com/search?section=anime&q=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, {
        headers: HEADERS,
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) continue;
      const html = await res.text();

      // 카드 링크 및 포스터 정규식 매칭
      // 예: href="/anime/4095" ... src="https://data.onnada.com/anime/..."
      const cardPattern = /href=\\?["']\/anime\/(\d+)\\?["'].*?src=\\?["'](https:\/\/data\.onnada\.com\/anime\/[^"'\\]+)\\?["']/s;
      const match = cardPattern.exec(html);

      if (match) {
        onnadaId = match[1];
        posterUrl = match[2];

        // 타이틀 추출
        const titleMatch = new RegExp(`href=\\\\?["']\\/anime\\/${onnadaId}\\\\?["'][^>]*aria-label=\\\\?["']([^"'\\\\]+)\\\\?["']`).exec(html);
        if (titleMatch) {
          titleKo = titleMatch[1];
        } else {
          titleKo = title;
        }

        // 분류 (TV 시리즈 등)
        const clsMatch = /분류\\?<\/span>.*?<span[^>]*>([^<]+)<\/span>/s.exec(html);
        if (clsMatch) classification = clsMatch[1].trim();

        // 등급 (15세 이상 등)
        const ageMatch = /등급\\?<\/span>.*?<span[^>]*>([^<]+)<\/span>/s.exec(html);
        if (ageMatch) ageRating = ageMatch[1].trim();

        break;
      } else {
        // 단독 anime 링크 검색 폴백
        const idMatch = /href=\\?["']\/anime\/(\d+)\\?["']/.exec(html);
        if (idMatch) {
          onnadaId = idMatch[1];
          const imgMatch = /(https:\/\/data\.onnada\.com\/anime\/[^"'\s\\]+)/.exec(html);
          if (imgMatch) posterUrl = imgMatch[1];
          titleKo = title;
          break;
        }
      }
    } catch (searchErr) {
      // 다음 쿼리 시도
    }
  }

  if (!onnadaId) {
    // 매칭 실패 시 1시간 동안 재요청 방지 캐시
    memCache.set(cleanKey, { meta: null, timestamp: now });
    return null;
  }

  // 3. 상세 페이지에서 제작사(Studio) 및 일본어 원제 추출
  let studio = "";
  try {
    const detailUrl = `https://onnada.com/anime/${onnadaId}`;
    const dRes = await fetch(detailUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(4000),
    });

    if (dRes.ok) {
      const dHtml = await dRes.text();

      // 제작사 추출: "production1":"Ufotable" 또는 <dt>제작사</dt><dd>...<a...>Ufotable</a>
      const prodMatch = /\\"production1\\":\\"([^\\"]+)\\"/.exec(dHtml);
      if (prodMatch && prodMatch[1]) {
        studio = prodMatch[1].trim();
      } else {
        const dtMatch = /제작사<\/dt><dd[^>]*>.*?<a[^>]*>([^<]+)<\/a>/s.exec(dHtml);
        if (dtMatch && dtMatch[1]) {
          studio = dtMatch[1].trim();
        }
      }

      // 일본어 원제 추출: "official_title":"鬼滅の刃"
      const jaMatch = /\\"official_title\\":\\"([^\\"]+)\\"/.exec(dHtml);
      if (jaMatch && jaMatch[1]) {
        titleJa = jaMatch[1].trim();
      }

      // 분류 보강: "ani_type" 또는 <dt>분류</dt>
      const typeMatch = /분류<\/dt><dd[^>]*>([^<]+)<\/dd>/s.exec(dHtml);
      if (typeMatch && typeMatch[1]) {
        classification = typeMatch[1].trim();
      }
    }
  } catch (detailErr) {
    // 상세 조회 실패 시에도 기본 정보는 유지
  }

  const meta: OnnadaCardMeta = {
    onnadaId,
    titleKo: titleKo || title,
    titleJa: titleJa || originalTitle || null,
    poster: posterUrl,
    studio: studio || null,
    classification: classification || "TV 시리즈",
    ageRating: ageRating || null,
    rating: null,
  };

  // 4. 인메모리 & Neon DB 캐시 저장
  memCache.set(cleanKey, { meta, timestamp: now });
  try {
    await setOnnadaCardCache({
      search_key: cleanKey,
      onnada_id: onnadaId,
      title_ko: meta.titleKo,
      title_ja: meta.titleJa,
      poster_url: meta.poster,
      studio: meta.studio,
      classification: meta.classification,
      age_rating: meta.ageRating,
      rating: meta.rating,
    });
  } catch (saveErr) {
    console.warn("[OnnadaCard] DB cache save error:", saveErr);
  }

  return meta;
}

/**
 * 여러 타이틀의 온나다 카드 메타데이터를 배치로 일괄 결합
 */
export async function enrichWithOnnada(
  items: Array<{ title: string; originalTitle?: string }>
): Promise<Map<string, OnnadaCardMeta>> {
  const metaMap = new Map<string, OnnadaCardMeta>();
  if (!items || items.length === 0) return metaMap;

  // 1. 메모리 캐시 및 일괄 DB 캐시 우선 확인
  const toFetch: Array<{ title: string; originalTitle?: string; cleanKey: string }> = [];
  const searchKeys: string[] = [];

  for (const item of items) {
    const cleanKey = normalizeSearchKey(item.title) || item.title.trim();
    if (!cleanKey) continue;

    const cachedMem = memCache.get(cleanKey);
    if (cachedMem && Date.now() - cachedMem.timestamp < CACHE_TTL_MS) {
      if (cachedMem.meta) {
        metaMap.set(item.title, cachedMem.meta);
      }
    } else {
      toFetch.push({ title: item.title, originalTitle: item.originalTitle, cleanKey });
      searchKeys.push(cleanKey);
    }
  }

  if (toFetch.length === 0) return metaMap;

  // 2. Neon DB 일괄 조회 (1회 SQL 쿼리로 수십 개 즉시 복원)
  try {
    const dbBatch = await getBatchOnnadaCardCache(searchKeys);
    const remainingToFetch: typeof toFetch = [];

    for (const item of toFetch) {
      const dbCached = dbBatch.get(item.cleanKey);
      if (dbCached) {
        const meta: OnnadaCardMeta = {
          onnadaId: dbCached.onnada_id,
          titleKo: dbCached.title_ko,
          titleJa: dbCached.title_ja,
          poster: dbCached.poster_url,
          studio: dbCached.studio,
          classification: dbCached.classification,
          ageRating: dbCached.age_rating,
          rating: dbCached.rating,
        };
        memCache.set(item.cleanKey, { meta, timestamp: Date.now() });
        metaMap.set(item.title, meta);
      } else {
        remainingToFetch.push(item);
      }
    }

    // 3. DB에도 없는 항목만 병렬(최대 5개 동시)로 온나다 웹 파싱
    const batchSize = 5;
    for (let i = 0; i < remainingToFetch.length; i += batchSize) {
      const batch = remainingToFetch.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (item) => {
          const meta = await fetchOnnadaCardMeta(item.title, item.originalTitle);
          if (meta) {
            metaMap.set(item.title, meta);
          }
        })
      );
    }
  } catch (err) {
    console.error("[OnnadaCard] enrichWithOnnada error:", err);
  }

  return metaMap;
}
