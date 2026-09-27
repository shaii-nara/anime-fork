import Link from "next/link";
import { AnimeListItem } from "@/lib/linkkf";
import { PlayCircle } from "lucide-react";

export default function AnimeCard({ anime }: { anime: AnimeListItem }) {
  const targetHref = anime.id
    ? `/anime/${anime.id}`
    : anime.detail_url && !anime.detail_url.startsWith("http")
    ? anime.detail_url
    : "/";

  return (
    <Link
      href={targetHref}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#10182c]/80 transition duration-200 hover:-translate-y-1.5 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-900/30 text-decoration-none"
    >
      {/* 16:9 Landscape Poster Wrapper (가로로 긴 와이드 비율) */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
        {anime.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.poster}
            alt={anime.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            style={{ objectPosition: "center 25%" }}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
            No Image
          </div>
        )}

        {/* 좌측 상단 뱃지: 랭킹 or 평점 or 방영시각 */}
        {anime.rank ? (
          <span
            className={`absolute top-2 left-2 flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-extrabold shadow-md z-10 ${
              anime.rank === 1
                ? "bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-amber-500/50"
                : anime.rank === 2
                ? "bg-gradient-to-r from-slate-200 to-slate-400 text-black shadow-slate-400/40"
                : anime.rank === 3
                ? "bg-gradient-to-r from-orange-300 to-orange-600 text-black shadow-orange-500/40"
                : "bg-black/75 text-purple-400 border border-purple-500/40 backdrop-blur-md"
            }`}
          >
            {anime.rank > 30 ? `★ ${anime.rank}%` : `${anime.rank}위`}
          </span>
        ) : anime.rating ? (
          <span className="absolute top-2 left-2 rounded-lg bg-black/80 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30 backdrop-blur-md z-10">
            ★ {anime.rating}
          </span>
        ) : anime.time ? (
          <span className="absolute top-2 left-2 rounded-lg bg-black/80 px-2 py-0.5 text-[11px] font-semibold text-slate-300 border border-white/10 backdrop-blur-md z-10">
            {anime.time}
          </span>
        ) : null}

        {/* 우측 상단 뱃지: 자막 현황 or remarks */}
        {anime.remarks ? (
          <span className="absolute top-2 right-2 rounded-lg bg-black/80 px-2 py-0.5 text-xs font-bold text-purple-300 border border-purple-500/40 backdrop-blur-md z-10">
            {anime.remarks}
          </span>
        ) : anime.caption_count !== undefined && anime.caption_count !== null ? (
          <span className="absolute top-2 right-2 rounded-lg bg-emerald-950/80 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40 backdrop-blur-md z-10">
            자막 {anime.caption_count}명
          </span>
        ) : null}

        {/* 하단 그라디언트 오버레이 */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#10182c] via-[#10182c]/40 to-transparent pointer-events-none" />

        {/* 하단 좌측 뱃지: 제작사 (온나다) */}
        {anime.studio && (
          <span
            className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-purple-950/90 px-2 py-0.5 text-[11px] font-semibold text-purple-200 border border-purple-500/40 backdrop-blur-md z-10 shadow-sm max-w-[130px] truncate"
            title={`제작사: ${anime.studio}`}
          >
            {anime.studio}
          </span>
        )}

        {/* 하단 우측 뱃지: 분류 (TV 시리즈 / 극장판 등) */}
        {anime.classification && (
          <span className="absolute bottom-2 right-2 rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 border border-white/10 backdrop-blur-md z-10">
            {anime.classification}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-3">
        <h3
          className="line-clamp-2 text-sm font-bold text-slate-100 transition group-hover:text-purple-300 leading-snug"
          title={anime.title}
        >
          {anime.title}
        </h3>
        <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center transition group-hover:text-purple-400">
            <PlayCircle className="h-3.5 w-3.5 text-purple-500 mr-1" />
            <span className="font-medium">보러가기</span>
          </div>
          <div className="flex items-center gap-1.5">
            {anime.age_rating && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-medium border border-white/5">
                {anime.age_rating.replace(" 이상", "")}
              </span>
            )}
            {anime.time && !anime.rank && anime.rating && (
              <span className="text-[11px] text-slate-500">{anime.time}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
