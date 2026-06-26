// ═══════════════════════════════════════════════════════════════════
// ProductivityEngine — Centralized App Classification & Scoring
// ═══════════════════════════════════════════════════════════════════
//
// Single Source of Truth for productivity metrics.
// Used by: /reports/daily, email reports, dashboard summary.

export type AppCategory = 'productive' | 'unproductive' | 'neutral';

export type HighLevelCategory =
  | 'Development'
  | 'Communication'
  | 'Entertainment'
  | 'Browsing'
  | 'Office'
  | 'Design'
  | 'Social Media'
  | 'Other';

// ── Keyword dictionaries ─────────────────────────────────────────

const PRODUCTIVE_PATTERNS: RegExp[] = [
  // IDEs & Code Editors
  /\bvs\s*code\b/i, /\bvisual\s*studio\b/i, /\bintellij\b/i, /\bwebstorm\b/i,
  /\bpycharm\b/i, /\brider\b/i, /\bdatagrip\b/i, /\bsublime\b/i,
  /\bvim\b/i, /\bneovim\b/i, /\batom\b/i, /\beclipse\b/i, /\bnetbeans\b/i,
  /\bandroid\s*studio\b/i, /\bxcode\b/i, /\bcursor\b/i, /\bzed\b/i,

  // Terminal & DevOps
  /\bterminal\b/i, /\bcmd\.exe\b/i, /\bpowershell\b/i, /\bgit\b/i,
  /\bdocker\b/i, /\bpostman\b/i, /\binsomnia\b/i, /\bwarp\b/i,
  /\biterm\b/i, /\bwindows\s*terminal\b/i, /\bssh\b/i,

  // Office & Productivity
  /\bword\b/i, /\bexcel\b/i, /\bpowerpoint\b/i, /\boutlook\b/i,
  /\bonenote\b/i, /\bnotion\b/i, /\bobsidian\b/i, /\btodoist\b/i,
  /\btrello\b/i, /\basana\b/i, /\bjira\b/i, /\bconfluence\b/i,
  /\blinear\b/i, /\bclickup\b/i, /\bmonday\b/i,

  // Communication (work)
  /\bteams\b/i, /\bslack\b/i, /\bzoom\b/i, /\bmeet\b/i,
  /\bgoogle\s*meet\b/i, /\bwebex\b/i,

  // Design (work)
  /\bfigma\b/i, /\bphotoshop\b/i, /\billustrator\b/i,
  /\bsketch\b/i, /\bcanva\b/i, /\bblender\b/i,
  /\bafter\s*effects\b/i, /\bpremiere\b/i, /\bdavinci\b/i,

  // Databases & Data
  /\bdbeaver\b/i, /\bmysql\b/i, /\bpgadmin\b/i, /\bmongodb\s*compass\b/i,
  /\btableau\b/i, /\bpower\s*bi\b/i,
];

const UNPRODUCTIVE_PATTERNS: RegExp[] = [
  // Streaming & Video
  /\byoutube\b/i, /\bnetflix\b/i, /\btwitch\b/i,
  /\bhbo\b/i, /\bdisney\+?\b/i, /\bprime\s*video\b/i,
  /\bcrunchyroll\b/i, /\bfunimation\b/i, /\bparamount\b/i,
  /\bspotify\b/i, /\bapple\s*music\b/i, /\bdeezer\b/i,

  // Social Media
  /\btiktok\b/i, /\binstagram\b/i, /\bfacebook\b/i,
  /\btwitter\b/i, /\breddit\b/i, /\bsnapchat\b/i,
  /\bpinterest\b/i, /\btumblr\b/i, /\bx\.com\b/i,

  // Gaming
  /\bsteam\b/i, /\bepic\s*games\b/i, /\briot\b/i,
  /\bdiscord\b/i, /\bminecraft\b/i, /\broblox\b/i,
  /\bfortnight\b/i, /\bfortnite\b/i, /\bleague\b/i,
  /\bvalorant\b/i, /\bgenshin\b/i, /\boverwatch\b/i,

  // Messaging (personal)
  /\bwhatsapp\b/i, /\btelegram\b/i, /\bmessenger\b/i,
  /\bsignal\b/i,
];

const NEUTRAL_PATTERNS: RegExp[] = [
  /\bchrome\b/i, /\bfirefox\b/i, /\bedge\b/i, /\bbrave\b/i,
  /\bsafari\b/i, /\bopera\b/i, /\bexplorer\b/i, /\bfinder\b/i,
  /\bfile\s*manager\b/i, /\bnotepad\b/i, /\bcalculator\b/i,
  /\bsettings\b/i, /\bcontrol\s*panel\b/i, /\btask\s*manager\b/i,
];

// ── High-level category mapping ──────────────────────────────────

const HL_CATEGORY_MAP: Array<{ category: HighLevelCategory; patterns: RegExp[] }> = [
  {
    category: 'Development',
    patterns: [
      /\bvs\s*code\b/i, /\bvisual\s*studio\b/i, /\bintellij\b/i, /\bwebstorm\b/i,
      /\bpycharm\b/i, /\brider\b/i, /\bdatagrip\b/i, /\bsublime\b/i,
      /\bvim\b/i, /\bneovim\b/i, /\bterminal\b/i, /\bcmd\b/i, /\bpowershell\b/i,
      /\bdocker\b/i, /\bpostman\b/i, /\bgit\b/i, /\bfigma\b/i, /\bphotoshop\b/i,
      /\bcursor\b/i, /\bzed\b/i, /\bxcode\b/i, /\bandroid\s*studio\b/i,
    ],
  },
  {
    category: 'Communication',
    patterns: [
      /\boutlook\b/i, /\bteams\b/i, /\bslack\b/i, /\bzoom\b/i,
      /\bmeet\b/i, /\bwebex\b/i,
    ],
  },
  {
    category: 'Entertainment',
    patterns: [
      /\byoutube\b/i, /\bnetflix\b/i, /\bspotify\b/i, /\btwitch\b/i,
      /\bsteam\b/i, /\bhbo\b/i, /\bdisney\b/i, /\bprime\s*video\b/i,
      /\bcrunchyroll\b/i, /\bepic\s*games\b/i,
    ],
  },
  {
    category: 'Social Media',
    patterns: [
      /\btiktok\b/i, /\binstagram\b/i, /\bfacebook\b/i,
      /\btwitter\b/i, /\breddit\b/i, /\bx\.com\b/i,
      /\bwhatsapp\b/i, /\btelegram\b/i, /\bdiscord\b/i,
    ],
  },
  {
    category: 'Browsing',
    patterns: [
      /\bchrome\b/i, /\bfirefox\b/i, /\bedge\b/i, /\bbrave\b/i,
      /\bsafari\b/i, /\bopera\b/i,
    ],
  },
  {
    category: 'Office',
    patterns: [
      /\bword\b/i, /\bexcel\b/i, /\bpowerpoint\b/i, /\bonenote\b/i,
      /\bnotion\b/i, /\bobsidian\b/i, /\bjira\b/i, /\bconfluence\b/i,
    ],
  },
  {
    category: 'Design',
    patterns: [
      /\bfigma\b/i, /\bphotoshop\b/i, /\billustrator\b/i,
      /\bsketch\b/i, /\bcanva\b/i, /\bblender\b/i,
      /\bafter\s*effects\b/i, /\bpremiere\b/i, /\bdavinci\b/i,
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// Core Classification Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Classify a single app name into productive / unproductive / neutral.
 */
export function categorizeApp(appName: string): AppCategory {
  if (PRODUCTIVE_PATTERNS.some((p) => p.test(appName))) return 'productive';
  if (UNPRODUCTIVE_PATTERNS.some((p) => p.test(appName))) return 'unproductive';
  if (NEUTRAL_PATTERNS.some((p) => p.test(appName))) return 'neutral';
  return 'neutral'; // Default: unknown apps are neutral
}

/**
 * Get a high-level category for pie charts and reports.
 */
export function getHighLevelCategory(appName: string): HighLevelCategory {
  for (const entry of HL_CATEGORY_MAP) {
    if (entry.patterns.some((p) => p.test(appName))) return entry.category;
  }
  return 'Other';
}

// ═══════════════════════════════════════════════════════════════════
// Productivity Analysis Engine
// ═══════════════════════════════════════════════════════════════════

export interface AppUsageEntry {
  app: string;
  seconds: number;
}

export interface ProductivityResult {
  /** Overall productivity score 0-100 */
  score: number;
  /** Label: Excellent | Good | Average | Low | Critical */
  label: string;
  /** Total seconds classified as productive */
  productiveSeconds: number;
  /** Total seconds classified as unproductive */
  unproductiveSeconds: number;
  /** Total seconds classified as neutral */
  neutralSeconds: number;
  /** Total active seconds */
  totalActiveSeconds: number;
  /** Per-app classification */
  appBreakdown: Array<{
    app: string;
    seconds: number;
    category: AppCategory;
    highLevelCategory: HighLevelCategory;
  }>;
  /** Category summary for pie charts */
  categoryBreakdown: Array<{
    name: HighLevelCategory;
    seconds: number;
    color: string;
  }>;
  /** Top productive apps */
  topProductive: Array<{ app: string; seconds: number }>;
  /** Top unproductive apps */
  topUnproductive: Array<{ app: string; seconds: number }>;
}

const CATEGORY_COLORS: Record<HighLevelCategory, string> = {
  Development: '#FF6B35',
  Communication: '#3B82F6',
  Entertainment: '#EF4444',
  Browsing: '#F59E0B',
  Office: '#10B981',
  Design: '#8B5CF6',
  'Social Media': '#EC4899',
  Other: '#6B7280',
};

/**
 * Analyze a list of app usage entries and produce a full productivity report.
 */
export function analyzeProductivity(appUsage: AppUsageEntry[]): ProductivityResult {
  let productiveSeconds = 0;
  let unproductiveSeconds = 0;
  let neutralSeconds = 0;

  const categoryMap: Record<string, number> = {};
  const appBreakdown: ProductivityResult['appBreakdown'] = [];

  for (const entry of appUsage) {
    const cat = categorizeApp(entry.app);
    const hlCat = getHighLevelCategory(entry.app);

    appBreakdown.push({
      app: entry.app,
      seconds: entry.seconds,
      category: cat,
      highLevelCategory: hlCat,
    });

    switch (cat) {
      case 'productive':
        productiveSeconds += entry.seconds;
        break;
      case 'unproductive':
        unproductiveSeconds += entry.seconds;
        break;
      default:
        neutralSeconds += entry.seconds;
    }

    categoryMap[hlCat] = (categoryMap[hlCat] || 0) + entry.seconds;
  }

  // Score: productive / (productive + unproductive) * 100
  // Neutral time is excluded from the ratio (it doesn't hurt or help).
  const denominator = productiveSeconds + unproductiveSeconds;
  const score = denominator > 0 ? Math.round((productiveSeconds / denominator) * 100) : 0;

  // Label
  let label: string;
  if (score >= 85) label = 'Excellent';
  else if (score >= 70) label = 'Good';
  else if (score >= 50) label = 'Average';
  else if (score >= 30) label = 'Low';
  else label = 'Critical';

  // Sort app breakdown by seconds desc
  appBreakdown.sort((a, b) => b.seconds - a.seconds);

  // Category breakdown for pie charts
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([name, seconds]) => ({
      name: name as HighLevelCategory,
      seconds,
      color: CATEGORY_COLORS[name as HighLevelCategory] || '#6B7280',
    }))
    .sort((a, b) => b.seconds - a.seconds);

  // Top apps by category
  const topProductive = appBreakdown
    .filter((a) => a.category === 'productive')
    .slice(0, 10)
    .map(({ app, seconds }) => ({ app, seconds }));

  const topUnproductive = appBreakdown
    .filter((a) => a.category === 'unproductive')
    .slice(0, 10)
    .map(({ app, seconds }) => ({ app, seconds }));

  return {
    score,
    label,
    productiveSeconds,
    unproductiveSeconds,
    neutralSeconds,
    totalActiveSeconds: productiveSeconds + unproductiveSeconds + neutralSeconds,
    appBreakdown,
    categoryBreakdown,
    topProductive,
    topUnproductive,
  };
}
