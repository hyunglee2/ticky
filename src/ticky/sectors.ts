// Which industry a stock belongs to, so two Tickies of the same industry can talk shop when they meet.
// A hand-made list of well-known names (no data source gives this for free); anything else has no
// industry and just chats as usual.

export type Sector =
  | "semi" | "battery" | "bio" | "internet" | "bigtech" | "software" | "auto" | "bank"
  | "game" | "ent" | "defense" | "ship" | "energy" | "crypto";

/** how the Tickies call it in a sentence ("{s} 오늘 왜 이래") */
export const SECTOR_NAME: Record<Sector, string> = {
  semi: "반도체",
  battery: "2차전지",
  bio: "바이오",
  internet: "인터넷",
  bigtech: "빅테크",
  software: "소프트웨어",
  auto: "자동차",
  bank: "금융",
  game: "게임",
  ent: "엔터",
  defense: "방산",
  ship: "조선",
  energy: "에너지",
  crypto: "코인",
};

const LIST: Record<Sector, string[]> = {
  semi: [
    "005930", "000660", "042700", "000990", "058470", "403870", "240810", // 삼성전자 SK하이닉스 한미반도체 DB하이텍 리노공업 HPSP 원익IPS
    "NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM", "MU", "ASML", "ARM", "TXN", "AMAT", "LRCX", "KLAC", "MRVL",
    "SOXL", "SOXS", "SOXX", "SMH",
  ],
  battery: [
    "373220", "006400", "051910", "247540", "086520", "003670", "066970", "005070", // LG엔솔 삼성SDI LG화학 에코프로비엠 에코프로 포스코퓨처엠 엘앤에프 코스모신소재
    "ALB", "QS",
  ],
  bio: [
    "207940", "068270", "196170", "000100", "128940", "326030", "028300", // 삼성바이오 셀트리온 알테오젠 유한양행 한미약품 SK바이오팜 HLB
    "LLY", "NVO", "PFE", "MRNA", "JNJ", "ABBV", "AMGN", "MRK",
  ],
  internet: ["035420", "035720", "323410", "377300", "NFLX", "UBER", "SHOP", "BABA"], // NAVER 카카오 카카오뱅크 카카오페이
  bigtech: ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "QQQ", "TQQQ", "SQQQ"],
  software: ["PLTR", "CRM", "ORCL", "ADBE", "SNOW", "NOW", "IONQ", "SMCI"],
  auto: ["005380", "000270", "012330", "TSLA", "TSLL", "RIVN", "LCID", "F", "GM", "TM"], // 현대차 기아 현대모비스
  bank: ["105560", "055550", "086790", "316140", "024110", "JPM", "BAC", "WFC", "C", "GS", "MS"], // KB 신한 하나 우리 기업은행
  game: ["259960", "036570", "251270", "263750", "293490", "RBLX", "EA", "TTWO"], // 크래프톤 엔씨 넷마블 펄어비스 카카오게임즈
  ent: ["352820", "041510", "035900", "122870"], // 하이브 에스엠 JYP YG
  defense: ["012450", "079550", "064350", "047810", "LMT", "RTX", "NOC", "GD"], // 한화에어로 LIG넥스원 현대로템 KAI
  ship: ["329180", "009540", "042660", "010140", "010620"], // HD현대중공업 HD한국조선해양 한화오션 삼성중공업 HD현대미포
  energy: ["096770", "010950", "XOM", "CVX", "OXY"], // SK이노베이션 S-Oil
  crypto: ["COIN", "MSTR", "IBIT", "MARA"],
};

const BY_SYMBOL = new Map<string, Sector>(
  (Object.entries(LIST) as [Sector, string[]][]).flatMap(([sector, symbols]) => symbols.map((s) => [s, sector] as const)),
);

/** the stock's industry, or undefined when it isn't on the list ("005930.KS" and "nvda" work too) */
export function sectorOf(symbol: string): Sector | undefined {
  return BY_SYMBOL.get(symbol.split(".")[0].toUpperCase());
}
