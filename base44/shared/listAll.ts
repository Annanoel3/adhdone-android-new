// Reads EVERY matching record, a page at a time.
//
// Base44's list()/filter() return only 50 records when no limit is passed, and
// at most 5,000 per request. The notification jobs used to read "the 500 most
// recently updated tasks" and "the first 50 users", so once the app grew past
// those numbers, older tasks and newer users would silently drop out of
// reminders, smart nudges and the morning digest. Any job that needs the whole
// table goes through here instead.
//
// Pages are sorted by created_date, which never changes, so records being
// updated while we page can't shuffle the order. A record created mid-read can
// shift a page by one row; the id check below absorbs that.
const PAGE_SIZE = 1000;
const MAX_RECORDS = 100000; // runaway guard, not a product limit

async function readAllPages(fetchPage: (limit: number, skip: number) => Promise<any[]>): Promise<any[]> {
  const out: any[] = [];
  const seen = new Set<string>();
  for (let skip = 0; skip < MAX_RECORDS; skip += PAGE_SIZE) {
    const page = await fetchPage(PAGE_SIZE, skip);
    if (!Array.isArray(page) || page.length === 0) break;
    let added = 0;
    for (const row of page) {
      const id = row?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(row);
      added++;
    }
    // A short page is the last page. A page that added nothing new means skip
    // isn't advancing — stop rather than spin.
    if (page.length < PAGE_SIZE || added === 0) break;
  }
  return out;
}

export function listAll(entity: any): Promise<any[]> {
  return readAllPages((limit, skip) => entity.list('-created_date', limit, skip));
}

export function filterAll(entity: any, query: Record<string, unknown>): Promise<any[]> {
  return readAllPages((limit, skip) => entity.filter(query, '-created_date', limit, skip));
}