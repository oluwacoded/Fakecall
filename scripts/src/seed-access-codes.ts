import { db, accessCodesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const CODES = [
  "QXMVLRTKZH", "PABWNFJCYD", "VGTRMKQESN", "XLPDUAHFZR", "TYWCNBLJRX",
  "KPCEVMAGQY", "WTHNJPMFLK", "ZXDVRCYUQB", "XEGLFMTAQJ", "RWHBKSZNVC",
  "PTLXCRGDKM", "WYSJFNVGQA", "DLXPYRHTBE", "KMNWQFXJCV", "TAZGMHPLRK",
  "YUFQSNCJWB", "LVXDPZMTGH", "KRYQFLNBXA", "TCRJWMKESD", "VPUXHGJLQN",
  "AQTRVFMYKC", "ZEHNWPRXDL", "TZQBGMJFPY", "VKCWNALEHS", "DBQTXMRFUJ",
  "PCKYTGNQVL", "AFZHRMWJSP", "XDHVKCYTBN", "GLQFCZRUPK", "MAWXEHJNDT",
  "FVLBQMRYHX", "ZGTCWPLJAK", "NFSVDGQXBR", "MHYKPCUZTL", "EWFNQVJDMX",
  "RACHSYPTGN", "LKFVZQWMRJ", "XENBTGAYPH", "SDLCVKQNXF", "MRHWZUJGTP",
  "QALVYCKDMS", "RPTXHNFJWE", "BZQMGULKCA", "YDFRNVHXTP", "SJQWLEKMUZ",
  "CGTNAPXRYH", "VMLQDZKFJB", "HWXCYRAPTN", "ZMEKQJLFVS", "BGXUTRNHCP",
  "PLQWYVZKFM", "DRXJHCTBNA", "UGLPSQMVKE", "YTFRNCXWZH", "KJABQPLMVD",
  "XTHRFGWNCY", "ZMUPKQJELA", "VSBTXYNRHC", "QWLGFMPDAK", "RJXUZHCVTN",
  "ANKQYPLWFM", "DGCHTRXVJB", "LMSQWPAKZE", "YRFNTXHCVG", "BQJMLAZKPW",
  "UVXCHRTNFD", "EKYQWGPMZL", "HTJCRNAXFV", "WPZMKLQYDG", "FSUNHXBTRC",
  "JQKLVPMEAZ", "YTXRGCHNWB", "DMQPAKZLFV", "CHWJRYXNTG", "PLVKQMAEZH",
  "URFDXCNYTW", "BGJLPQMKVA", "XZHCTRFNWE", "KMYQGJPLDX", "VNRTAHWCFS",
  "EQZLPMKXUJ", "HYCBTRNWGA", "DFVQXLKPMJ", "SNTRHZCWYA", "GLQXVMKJPD",
  "UATRFNCYWE", "BXZMLQPHKV", "JRDTWGNCFA", "KYPLXMQVZH", "CNTRAWJDFG",
  "HQMVLXPZKE",
];

async function seed() {
  console.log(`Seeding ${CODES.length} access codes...`);

  try {
    const values = CODES.map((code) => ({ code }));
    await db
      .insert(accessCodesTable)
      .values(values)
      .onConflictDoNothing(); // safe to re-run

    // Verify
    const result = await db.execute(
      sql`SELECT COUNT(*) as total, SUM(CASE WHEN is_used THEN 1 ELSE 0 END) as used FROM access_codes`,
    );
    const row = result.rows[0] as { total: string; used: string };
    console.log(`✓ Done — ${row.total} total codes, ${row.used ?? 0} used.`);
  } catch (err: any) {
    console.error("Seed error:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seed();
