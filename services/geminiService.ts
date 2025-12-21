
import { HighlightMatch, GoalEvent } from '../types';
import { FOOTBALL_API_KEY } from '../constants';

export type HighlightsResult = HighlightMatch[];

const CACHE_KEY = 'football_data_highlights_v5'; // Bumped version for Hybrid API

// --- MODULE STATE FOR RATE LIMITING ---
let lastTsdbPoll = 0;

// --- CACHING UTILITIES ---

interface CacheEntry<T> {
  date: string;
  timestamp: number;
  data: T;
}

const CACHE_DURATION_DEFAULT = 15 * 60 * 1000; // 15 minutes
const CACHE_DURATION_LIVE = 60 * 1000; // 1 minute

// Helper to get local date string YYYY-MM-DD
const getLocalDateString = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

export const getFromCache = <T>(key: string, ignoreTTL: boolean = false): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item) as CacheEntry<T>;
    
    // Check 1: Date (Matches must be from today)
    if (parsed.date !== getLocalDateString()) {
      return null;
    }

    // If ignoring TTL, return data immediately
    if (ignoreTTL) return parsed.data;

    const now = Date.now();
    let effectiveTTL = CACHE_DURATION_DEFAULT;

    // Analyze data if it is an array
    if (Array.isArray(parsed.data)) {
        const matches = parsed.data as any[];

        // Check 2: Smart Kick-off
        const hasPendingKickoff = matches.some(m => {
            if (m && typeof m === 'object' && 'status' in m && 'rawDate' in m) {
                const isScheduled = m.status === 'SCHEDULED' || m.status === 'TIMED';
                if (isScheduled && m.rawDate) {
                    const kickoff = new Date(m.rawDate).getTime();
                    // If we passed the kick-off time, invalidate cache to fetch live status
                    if (now >= kickoff) return true;
                }
            }
            return false;
        });

        if (hasPendingKickoff) return null;

        // Check 3: Live Activity
        const hasLiveActivity = matches.some(m => {
             if (m && typeof m === 'object' && 'status' in m) {
                 return m.status === 'IN_PLAY' || m.status === 'PAUSED';
             }
             return false;
        });

        if (hasLiveActivity) {
            effectiveTTL = CACHE_DURATION_LIVE;
        }
    }

    const timestamp = parsed.timestamp || 0;
    if (now - timestamp > effectiveTTL) {
        return null;
    }

    return parsed.data;
  } catch (e) {
    return null;
  }
};

const saveToCache = <T>(key: string, data: T): void => {
  try {
    const entry: CacheEntry<T> = {
      date: getLocalDateString(),
      timestamp: Date.now(),
      data: data
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    console.error("Failed to save to cache", e);
  }
};

const cleanupOldCache = (): void => {
  try {
    const today = getLocalDateString();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('broadcaster_') || key.includes('highlights'))) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const parsed = JSON.parse(item) as CacheEntry<any>;
            if (parsed.date !== today) {
              keysToRemove.push(key);
            }
          } catch (e) {
            keysToRemove.push(key);
          }
        }
      }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error("Cache cleanup failed", e);
  }
};

// --- SECONDARY API SERVICE (TheSportsDB) ---

const fetchTheSportsDB = async (dateStr: string): Promise<HighlightMatch[]> => {
    try {
        // Using Free Tier Key '3'
        const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Soccer`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.events) return [];

        const targetLeagues = [
            'UEFA Europa League',
            'UEFA Conference League',
            'FA Cup',
            'Carabao Cup', // EFL Cup
            'Copa del Rey',
            'Coppa Italia',
            'DFB-Pokal',
            'Coupe de France',
            'Svenska Cupen'
        ];

        return data.events
            .filter((e: any) => targetLeagues.some(l => e.strLeague && e.strLeague.includes(l)))
            .map((e: any) => {
                // Status Mapping
                let status: any = 'SCHEDULED';
                if (e.strStatus === 'Match Finished' || e.strStatus === 'FT') status = 'FINISHED';
                else if (e.strStatus === 'Live' || e.strStatus === 'In Progress' || e.strStatus === 'HT') status = 'IN_PLAY';
                else if (e.strStatus === 'Postponed') status = 'POSTPONED';

                // Time formatting (HH:MM)
                const timeStr = e.strTime ? e.strTime.substring(0, 5) : '00:00';

                return {
                    id: `tsdb_${e.idEvent}`, // ID Prefix to avoid collision
                    league: e.strLeague,
                    match: e.strEvent,
                    time: timeStr,
                    rawDate: `${e.dateEvent}T${e.strTime}`, // Construct ISO-like string
                    homeTeam: e.strHomeTeam,
                    awayTeam: e.strAwayTeam,
                    homeLogo: e.strHomeTeamBadge || '',
                    awayLogo: e.strAwayTeamBadge || '',
                    status: status,
                    homeScore: e.intHomeScore ? parseInt(e.intHomeScore) : null,
                    awayScore: e.intAwayScore ? parseInt(e.intAwayScore) : null
                };
            });
    } catch (err) {
        console.warn("TheSportsDB Secondary Fetch failed (Non-critical):", err);
        return [];
    }
};

// --- MAIN SERVICE ---

export const fetchFootballHighlights = async (): Promise<HighlightsResult> => {
  cleanupOldCache();

  let matches: HighlightMatch[] = [];

  try {
    // 1. Check Cache
    const cachedMatches = getFromCache<HighlightMatch[]>(CACHE_KEY);
    
    if (cachedMatches && cachedMatches.length > 0) {
        matches = cachedMatches;
    } else {
        const apiKey = FOOTBALL_API_KEY;
        
        // Date Logic
        const todayDate = new Date();
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        
        const todayStr = getLocalDateString(todayDate);
        const tomorrowStr = getLocalDateString(tomorrowDate);
        
        console.log(`Fetching matches for ${todayStr}...`);
        
        // --- STEP 1: PRIMARY API (football-data.org) ---
        let mainMatches: HighlightMatch[] = [];
        try {
            const headers: HeadersInit = {};
            if (apiKey) headers['X-Auth-Token'] = apiKey;

            const response = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${todayStr}&dateTo=${tomorrowStr}`, {
                headers: headers
            });

            if (response.ok) {
                const data = await response.json();
                if (data.matches && Array.isArray(data.matches)) {
                    mainMatches = data.matches.map((m: any) => {
                        const date = new Date(m.utcDate);
                        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        const matchDay = date.getDate();
                        const currentDay = new Date().getDate();
                        const timeLabel = matchDay !== currentDay ? `Tom ${timeStr}` : timeStr;

                        return {
                            id: String(m.id),
                            league: m.competition?.name || 'Unknown',
                            match: `${m.homeTeam?.name || 'Home'} vs ${m.awayTeam?.name || 'Away'}`,
                            time: timeLabel,
                            rawDate: m.utcDate,
                            homeTeam: m.homeTeam?.name || 'Home',
                            awayTeam: m.awayTeam?.name || 'Away',
                            homeLogo: m.homeTeam?.crest || '',
                            awayLogo: m.awayTeam?.crest || '',
                            status: m.status,
                            homeScore: m.score?.fullTime?.home ?? null,
                            awayScore: m.score?.fullTime?.away ?? null
                        };
                    });
                }
            } else {
                console.warn(`Primary API Error: ${response.status}`);
            }
        } catch (e) {
            console.error("Primary API Failed", e);
        }

        // --- STEP 2: SECONDARY API (TheSportsDB) ---
        // We fetch missing leagues from here
        let extraMatches: HighlightMatch[] = [];
        try {
            extraMatches = await fetchTheSportsDB(todayStr);
            console.log(`Fetched ${extraMatches.length} extra matches from Secondary API`);
        } catch (e) {
            console.warn("Secondary API Failed completely", e);
        }

        // --- STEP 3: MERGE ---
        matches = [...mainMatches, ...extraMatches];

        // Save if we got anything
        if (matches.length > 0) {
            saveToCache(CACHE_KEY, matches);
        } else {
             // If both failed, try stale cache
             const staleCache = getFromCache<HighlightMatch[]>(CACHE_KEY, true);
             if (staleCache) return staleCache;
        }
    }

    // --- PROCESSING ---

    const now = new Date();
    
    // 1. Filter out old matches (keep live and upcoming)
    const validMatches = matches.filter(m => {
        try {
            if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return true;

            let matchTime = 0;
            if (m.rawDate) {
                matchTime = new Date(m.rawDate).getTime();
            } else {
                return true; 
            }

            // Keep matches visible for 12 hours after start time
            const matchEndInMs = matchTime + (720 * 60000);
            return now.getTime() < matchEndInMs;
        } catch (e) {
            return true;
        }
    });

    // --- TEAMS DEFINITIONS ---
    const topItalianTeams = ['juventus', 'napoli', 'roma', 'lazio', 'atalanta', 'fiorentina', 'bologna', 'torino', 'inter', 'milan'];
    const topGlobalTeams = ['man city', 'arsenal', 'liverpool', 'chelsea', 'man utd', 'tottenham', 'real madrid', 'barcelona', 'atletico', 'bayern', 'dortmund', 'psg', 'benfica', 'porto'];
    const allowedOtherTeams = [...topItalianTeams, ...topGlobalTeams, 'leipzig', 'newcastle', 'aston villa', 'brighton', 'ajax', 'psv', 'feyenoord', 'sporting', 'malmö', 'malmo', 'mff'];

    // --- STRICT FILTERING ---
    let filteredMatches = validMatches.filter(m => {
        // ALWAYS allow Secondary API matches
        if (m.id.startsWith('tsdb_')) return true;

        const text = (m.match + " " + m.league).toLowerCase();
        
        // Priority Leagues
        if (text.includes('inter ') || text.includes('internazionale')) return true;
        if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) return true;
        if (text.includes('serie a') || text.includes('calcio')) return true;
        if (text.includes('premier league') || text.includes('epl')) return true;
        if (text.includes('primera division') || text.includes('la liga')) return true;
        if (text.includes('champions league') || text.includes('europa') || text.includes('conference')) return true;
        if (text.includes('bundesliga')) return true;
        if (text.includes('cup') || text.includes('pokal')) return true; // Allow cups
        
        // Local Leagues (Sweden)
        if (text.includes('allsvenskan') || text.includes('superettan') || text.includes('svenska')) return true;

        // Teams
        if (allowedOtherTeams.some(t => text.includes(t))) return true;

        return false;
    });

    // --- PRIORITY SCORING SYSTEM ---
    filteredMatches.sort((a, b) => {
      const getScore = (m: HighlightMatch) => {
        let score = 0;
        const text = (m.match + " " + m.league).toLowerCase();
        
        // TIER 0: GOD TIER (Inter & Milan & Malmo)
        if (text.includes('inter ') || text.includes('internazionale')) return 5000000;
        if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) return 4900000;
        if (text.includes('malmö') || text.includes('malmo') || text.includes('mff')) return 4800000;

        // BASE LEAGUE SCORES
        if (text.includes('serie a') || text.includes('calcio')) score += 50000;
        else if (text.includes('champions league')) score += 60000; 
        else if (text.includes('europa') || text.includes('conference')) score += 55000; 
        else if (text.includes('premier league') || text.includes('epl')) score += 40000;
        else if (text.includes('primera division') || text.includes('la liga')) score += 30000;
        else if (text.includes('allsvenskan')) score += 35000;
        else if (text.includes('cup') || text.includes('pokal') || text.includes('coppa')) score += 25000; 
        else score += 10000;

        // TEAM BONUSES
        const italianCount = topItalianTeams.filter(t => text.includes(t)).length;
        score += (italianCount * 500000); 

        const globalCount = topGlobalTeams.filter(t => text.includes(t)).length;
        score += (globalCount * 200000);

        // LIVE BOOST
        if (m.status === 'IN_PLAY' || m.status === 'PAUSED') score += 5000;

        return score;
      };

      return getScore(b) - getScore(a);
    });

    return filteredMatches;

  } catch (error) {
    console.error("Failed to fetch highlights:", error);
    const fallback = getFromCache<HighlightMatch[]>(CACHE_KEY, true);
    return fallback || [];
  }
};

// --- POLL LIVE SCORES (SMART DELAY & HYBRID) ---

export const pollLiveScores = async (previousMatches: HighlightMatch[]): Promise<{ events: GoalEvent[], updatedMatches: HighlightMatch[] }> => {
  // 1. Setup Baseline
  let baselineMatches = previousMatches;
  if (!baselineMatches || baselineMatches.length === 0) {
      const cached = getFromCache<HighlightMatch[]>(CACHE_KEY, true); 
      if (cached) baselineMatches = cached;
  }
  if (!baselineMatches) return { events: [], updatedMatches: [] };

  const apiKey = FOOTBALL_API_KEY;
  const headers: HeadersInit = {};
  if (apiKey) headers['X-Auth-Token'] = apiKey;

  // 2. Poll Sources
  const primaryLiveMap = new Map<string, any>();
  let secondaryLiveMap: Map<string, HighlightMatch> | null = null;

  // A. Primary
  try {
    const response = await fetch(`https://api.football-data.org/v4/matches?status=IN_PLAY`, { headers });
    if (response.ok) {
        const data = await response.json();
        data.matches?.forEach((m: any) => primaryLiveMap.set(String(m.id), m));
    }
  } catch (e) { console.error(e); }

  // B. Secondary (Rate Limited)
  const now = Date.now();
  if (now - lastTsdbPoll > 120000) {
      try {
          lastTsdbPoll = now;
          const tsdbMatches = await fetchTheSportsDB(getLocalDateString());
          secondaryLiveMap = new Map();
          tsdbMatches.forEach(m => secondaryLiveMap!.set(m.id, m));
      } catch (e) { console.warn(e); }
  }

  // 3. Detect Candidates
  const candidates: string[] = []; // IDs
  
  for (const prev of baselineMatches) {
      // TSDB Matches
      if (prev.id.startsWith('tsdb_')) {
          if (secondaryLiveMap && secondaryLiveMap.has(prev.id)) {
              const fresh = secondaryLiveMap.get(prev.id)!;
              if (fresh.homeScore !== prev.homeScore || fresh.awayScore !== prev.awayScore) {
                  candidates.push(prev.id);
              }
          }
          continue;
      }

      // Primary Matches
      if (primaryLiveMap.has(prev.id)) {
          const fresh = primaryLiveMap.get(prev.id);
          const fHome = fresh.score?.fullTime?.home ?? 0;
          const fAway = fresh.score?.fullTime?.away ?? 0;
          const pHome = prev.homeScore ?? 0;
          const pAway = prev.awayScore ?? 0;
          
          if (fHome !== pHome || fAway !== pAway) {
              candidates.push(prev.id);
          }
      }
  }

  // 4. Verify & Build Events (Refactored with Retry Loop)
  const goalEvents: GoalEvent[] = [];
  const verifiedMap = new Map<string, HighlightMatch>();

  const processCandidate = async (cid: string) => {
      const prev = baselineMatches.find(m => m.id === cid)!;

      // Secondary (TSDB) - Accept without re-fetch (no detail endpoint available on free tier)
      if (cid.startsWith('tsdb_')) {
          const fresh = secondaryLiveMap!.get(cid)!;
          goalEvents.push({
              matchId: cid,
              matchTitle: prev.match,
              score: `${fresh.homeScore} - ${fresh.awayScore}`,
              scorer: 'Goal!',
              minute: fresh.status === 'IN_PLAY' ? 'LIVE' : 'FT'
          });
          verifiedMap.set(cid, fresh);
          return;
      }

      // Primary - Re-verify via Detail Endpoint with Retry Loop
      let matchData: any = null;
      let scorerName: string | null = null;
      let minuteStr = "LIVE";
      const maxAttempts = 3;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Wait 10 seconds before each check
          await new Promise(r => setTimeout(r, 10000));

          try {
              const res = await fetch(`https://api.football-data.org/v4/matches/${cid}`, { headers });
              if (res.ok) {
                  const d = await res.json();
                  matchData = d;

                  // Check for goals and scorer name
                  if (d.goals && d.goals.length > 0) {
                      const lastGoal = d.goals[d.goals.length - 1];
                      if (lastGoal.scorer && lastGoal.scorer.name) {
                          scorerName = lastGoal.scorer.name;
                          if (lastGoal.minute) minuteStr = `${lastGoal.minute}'`;
                          // Found the name, break the loop early
                          break;
                      }
                  }
              }
          } catch(e) { 
              console.error(`Verification attempt ${attempt + 1} failed for ${cid}`, e); 
          }
      }

      // After loop finishes (either success or max attempts)
      if (matchData) {
          const newHome = matchData.score?.fullTime?.home ?? 0;
          const newAway = matchData.score?.fullTime?.away ?? 0;
          const oldHome = prev.homeScore ?? 0;
          const oldAway = prev.awayScore ?? 0;

          // Compare vs Baseline (Prevent Zombies / confirm change)
          if (newHome !== oldHome || newAway !== oldAway) {
              let displayScorer = "Goal!";
              let displayMinute = "LIVE";
              
              // VAR Check: If score decreased, it's a disallowed goal
              if (newHome < oldHome || newAway < oldAway) {
                  displayScorer = "Goal Disallowed (VAR)";
                  displayMinute = "VAR";
              } else {
                  // Use found name or fallback
                  if (scorerName) {
                      displayScorer = scorerName;
                      displayMinute = minuteStr;
                  }
              }

              goalEvents.push({
                  matchId: cid,
                  matchTitle: prev.match,
                  score: `${newHome} - ${newAway}`,
                  scorer: displayScorer,
                  minute: displayMinute
              });

              verifiedMap.set(cid, {
                  ...prev,
                  status: matchData.status,
                  homeScore: newHome,
                  awayScore: newAway
              });
          } else {
              // Reverted/False Alarm - Update status but no event
               verifiedMap.set(cid, {
                  ...prev,
                  status: matchData.status,
                  homeScore: newHome,
                  awayScore: newAway
              });
          }
      }
  };

  // Run all candidates concurrently
  if (candidates.length > 0) {
      await Promise.all(candidates.map(cid => processCandidate(cid)));
  }

  // 6. Construct Updated List
  const updatedMatches = baselineMatches.map(prev => {
      // If we verified it (Confirmed or Reverted), use that exact state
      if (verifiedMap.has(prev.id)) return verifiedMap.get(prev.id)!;
      
      // If it wasn't a candidate, try to update status/time from initial polls (keep clock ticking)
      if (prev.id.startsWith('tsdb_')) {
          if (secondaryLiveMap && secondaryLiveMap.has(prev.id)) return secondaryLiveMap.get(prev.id)!;
      } else {
          if (primaryLiveMap.has(prev.id)) {
              const fresh = primaryLiveMap.get(prev.id);
              return {
                  ...prev,
                  status: fresh.status,
                  homeScore: fresh.score?.fullTime?.home ?? prev.homeScore,
                  awayScore: fresh.score?.fullTime?.away ?? prev.awayScore
              };
          }
      }

      return prev;
  });

  return { events: goalEvents, updatedMatches };
};
