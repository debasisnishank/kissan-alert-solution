/**
 * Agricultural News Crawler for Indian Sources
 * Direct RSS feeds from Indian news publishers (no Google News)
 */

import { execute, query, queryOne } from "$db/client.ts";

interface NewsArticle {
  title: string;
  summary: string;
  content: string;
  category: string;
  source: string;
  sourceUrl: string;
  imageUrl: string | null;
  publishedAt: Date;
}

// Direct Indian News Publisher RSS Feeds (verified working)
const NEWS_SOURCES = [
  // The Hindu - Agri Business
  {
    name: "The Hindu",
    url: "https://www.thehindu.com/business/agri-business/feeder/default.rss",
    category: "market",
  },
  // Indian Express - Commodities
  {
    name: "Indian Express",
    url: "https://indianexpress.com/section/business/commodities/feed/",
    category: "market",
  },
  // Livemint - Economy
  {
    name: "Livemint",
    url: "https://www.livemint.com/rss/economy",
    category: "market",
  },
  // Hindustan Times - India News
  {
    name: "Hindustan Times",
    url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
    category: "general",
  },
  // Business Standard - Economy
  {
    name: "Business Standard",
    url: "https://www.business-standard.com/rss/economy-102.rss",
    category: "market",
  },
  // Financial Express - Economy
  {
    name: "Financial Express",
    url: "https://www.financialexpress.com/economy/feed/",
    category: "market",
  },
  // Moneycontrol - Commodities
  {
    name: "Moneycontrol",
    url: "https://www.moneycontrol.com/rss/commodities.xml",
    category: "market",
  },
  // Zee News - India
  {
    name: "Zee News",
    url: "https://zeenews.india.com/rss/india-national-news.xml",
    category: "general",
  },
];

// Agriculture keywords for filtering general news
const AGRI_KEYWORDS = [
  "farm",
  "farmer",
  "kisan",
  "crop",
  "agriculture",
  "agri",
  "msp",
  "mandi",
  "harvest",
  "sowing",
  "irrigation",
  "monsoon",
  "wheat",
  "rice",
  "paddy",
  "cotton",
  "sugarcane",
  "soybean",
  "fertilizer",
  "pesticide",
  "seed",
  "soil",
  "pm-kisan",
  "pmfby",
  "rural",
  "village",
  "rainfall",
  "drought",
  "flood",
];

/**
 * Check if article is agriculture related
 */
function isAgriRelated(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  return AGRI_KEYWORDS.some((keyword) => text.includes(keyword));
}

/**
 * Clean HTML entities and tags from text
 */
function cleanText(html: string): string {
  if (!html) return "";

  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(
      /&#x([a-fA-F0-9]+);/g,
      (_, code) => String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract image URL from RSS item XML
 */
function extractImageUrl(itemXml: string): string | null {
  // Try media:content
  let match = itemXml.match(/<media:content[^>]*url=["']([^"']+)["']/i);
  if (match) return match[1];

  // Try media:thumbnail
  match = itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
  if (match) return match[1];

  // Try enclosure with image type
  match = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
  if (match && /\.(jpg|jpeg|png|webp|gif)/i.test(match[1])) return match[1];

  // Try image tag in content
  match = itemXml.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (match) return match[1];

  return null;
}

/**
 * Categorize article based on keywords
 */
function categorizeArticle(
  title: string,
  content: string,
  defaultCategory: string,
): string {
  const text = `${title} ${content}`.toLowerCase();

  if (/weather|rain|monsoon|forecast|climate|drought|flood|imd/.test(text)) {
    return "weather";
  }
  if (/price|msp|market|mandi|export|import|trade|rate|₹|rs\.?/i.test(text)) {
    return "market";
  }
  if (
    /scheme|subsidy|pm.?kisan|pmfby|government|policy|budget|minister/.test(
      text,
    )
  ) {
    return "scheme";
  }
  if (
    /pest|disease|seed|fertilizer|harvest|sowing|irrigation|organic/.test(text)
  ) {
    return "farming";
  }
  if (/technology|drone|ai|digital|app|startup|innovation/.test(text)) {
    return "technology";
  }

  return defaultCategory || "general";
}

/**
 * Parse RSS XML to extract articles
 */
function parseRSSXml(
  xml: string,
  sourceName: string,
  defaultCategory: string,
  filterAgri: boolean,
): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const match of itemMatches) {
    const itemXml = match[1];

    // Extract tag content
    const getTag = (tag: string): string => {
      const cdataMatch = itemXml.match(
        new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
          "i",
        ),
      );
      if (cdataMatch) return cdataMatch[1].trim();

      const tagMatch = itemXml.match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
      );
      return tagMatch ? tagMatch[1].trim() : "";
    };

    const rawTitle = getTag("title");
    const rawDescription = getTag("description") ||
      getTag("content:encoded") ||
      getTag("content");
    const link = getTag("link") || getTag("guid");
    const pubDate = getTag("pubDate") || getTag("dc:date") ||
      getTag("published");

    if (!rawTitle || !link) continue;

    // Skip Google redirect URLs
    if (link.includes("news.google.com")) continue;

    // Clean the content
    const title = cleanText(rawTitle);
    const description = cleanText(rawDescription);

    // Filter for agriculture-related articles if needed
    if (filterAgri && !isAgriRelated(title, description)) {
      continue;
    }

    // Get image
    const imageUrl = extractImageUrl(itemXml);

    // Categorize
    const category = categorizeArticle(title, description, defaultCategory);

    articles.push({
      title,
      summary: description.slice(0, 500),
      content: description,
      category,
      source: sourceName,
      sourceUrl: link,
      imageUrl,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }

  return articles;
}

/**
 * Fetch RSS feed from publisher
 */
async function fetchRSSFeed(
  source: { name: string; url: string; category: string },
): Promise<NewsArticle[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[News] ${source.name}: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // Filter for agri content on general news feeds
    const filterAgri = ["general"].includes(source.category);
    const articles = parseRSSXml(xml, source.name, source.category, filterAgri);

    console.log(
      `[News] Fetched ${articles.length} articles from ${source.name}`,
    );
    return articles.slice(0, 10);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.warn(`[News] ${source.name}: Timeout`);
      } else {
        console.warn(`[News] ${source.name}: ${error.message}`);
      }
    }
    return [];
  }
}

/**
 * Save article to database (avoid duplicates)
 */
async function saveArticle(article: NewsArticle): Promise<boolean> {
  try {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM news_articles 
       WHERE source_url = $1 
       OR (LOWER(title) = LOWER($2) AND created_at > NOW() - INTERVAL '2 days')
       LIMIT 1`,
      [article.sourceUrl, article.title],
    );

    if (existing) return false;

    await execute(
      `INSERT INTO news_articles (
        title, summary, content, category, source, source_url, image_url, published_at, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [
        article.title,
        article.summary,
        article.content,
        article.category,
        article.source,
        article.sourceUrl,
        article.imageUrl,
        article.publishedAt,
      ],
    );

    return true;
  } catch (error) {
    console.error(`[News] Save error:`, error);
    return false;
  }
}

/**
 * Clean up old articles (older than 30 days)
 */
async function cleanupOldArticles(): Promise<number> {
  try {
    const result = await execute(
      `DELETE FROM news_articles WHERE created_at < NOW() - INTERVAL '30 days'`,
      [],
    );
    return result?.rowCount || 0;
  } catch {
    return 0;
  }
}

/**
 * Main crawler function
 */
export async function crawlAllSources(): Promise<{
  fetched: number;
  saved: number;
  sources: number;
}> {
  console.log("[News] Starting crawl from Indian publishers...");

  let totalFetched = 0;
  let totalSaved = 0;
  let sourcesProcessed = 0;

  for (const source of NEWS_SOURCES) {
    const articles = await fetchRSSFeed(source);
    totalFetched += articles.length;

    for (const article of articles) {
      const saved = await saveArticle(article);
      if (saved) totalSaved++;
    }

    sourcesProcessed++;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const cleaned = await cleanupOldArticles();
  if (cleaned > 0) console.log(`[News] Cleaned ${cleaned} old articles`);

  console.log(`[News] Done: ${totalFetched} fetched, ${totalSaved} saved`);

  return {
    fetched: totalFetched,
    saved: totalSaved,
    sources: sourcesProcessed,
  };
}

/**
 * Get latest news from database
 */
export async function getLatestNews(
  options: { category?: string; limit?: number; offset?: number } = {},
): Promise<
  Array<{
    id: string;
    title: string;
    summary: string;
    category: string;
    source: string;
    sourceUrl: string;
    imageUrl: string | null;
    publishedAt: Date;
  }>
> {
  const { category, limit = 10, offset = 0 } = options;

  let whereClause = "is_active = true";
  const params: unknown[] = [];

  if (category) {
    params.push(category);
    whereClause += ` AND category = $${params.length}`;
  }

  const results = await query<{
    id: string;
    title: string;
    summary: string;
    category: string;
    source: string;
    source_url: string;
    image_url: string | null;
    published_at: Date;
  }>(
    `SELECT id, title, summary, category, source, source_url, image_url, published_at
     FROM news_articles
     WHERE ${whereClause}
     ORDER BY published_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return results.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    category: r.category,
    source: r.source,
    sourceUrl: r.source_url,
    imageUrl: r.image_url,
    publishedAt: r.published_at,
  }));
}

export { NEWS_SOURCES };
