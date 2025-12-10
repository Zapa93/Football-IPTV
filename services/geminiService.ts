
import { HighlightMatch, GoalEvent } from '../types';
import { FOOTBALL_API_KEY } from '../constants';

export type HighlightsResult = HighlightMatch[];

const CACHE_KEY = 'football_data_highlights_v2';

// --- CACHING UTILITIES ---

interface CacheEntry<T> {
  date: string;
  timestamp: number;
  data: T;
}

const CACHE_DURATION_DEFAULT = 15 * 60 * 1000; // 15 minutes
const CACHE_DURATION_LIVE = 60 * 1000; // 1 minute

const getTodayDateString = (): string => {
  return new Date().toDateString(); // e.g. "Fri Oct 27 2023"
};

export const getFromCache = <T>(key: string, ignoreTTL: boolean = false): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item) as CacheEntry<T>;
    
    // Check 1: Date (Always enforce date check to avoid comparing with yesterday's matches)
    if (parsed.date !== getTodayDateString()) {
      return null;
    }

    // If ignoring TTL, return data immediately (skipping Smart Kick-off and Time checks)
    if (ignoreTTL) return parsed.data;

    const now = Date.now();
    let effectiveTTL = CACHE_DURATION_DEFAULT;

    // Analyze data if it is an array (assuming it's matches)
    if (Array.isArray(parsed.data)) {
        const matches = parsed.data as any[];

        // Check 2: Smart Kick-off
        // If we have cached matches that are marked SCHEDULED but the time has passed, 
        // we invalidate the cache to force a fetch of the new status (IN_PLAY).
        const hasPendingKickoff = matches.some(m => {
            if (m && typeof m === 'object' && 'status' in m && 'rawDate' in m) {
                const isScheduled = m.status === 'SCHEDULED' || m.status === 'TIMED';
                if (isScheduled && m.rawDate) {
                    const kickoff = new Date(m.rawDate).getTime();
                    if (now >= kickoff) return true;
                }
            }
            return false;
        });

        if (hasPendingKickoff) return null;

        // Check 3: Dynamic TTL
        // If ANY match is currently live or paused (halftime), we shorten the TTL to 1 minute.
        // This ensures status changes (like PAUSED -> IN_PLAY for 2nd half) are picked up quickly.
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

    // Check 4: TTL Application
    // If cache is older than effectiveTTL, invalidate it.
    // Fallback to 0 if timestamp is missing (legacy cache)
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
      date: getTodayDateString(),
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
    const today = getTodayDateString();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Clean up old highlights and legacy broadcaster keys
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

// --- SERVICES ---

export const fetchFootballHighlights = async (): Promise<HighlightsResult> => {
  cleanupOldCache();

  let matches: HighlightMatch[] = [];

  try {
    // 1. Check Cache
    const cachedMatches = getFromCache<HighlightMatch[]>(CACHE_KEY);
    
    if (cachedMatches && cachedMatches.length > 0 && cachedMatches[0].homeTeam) {
        matches = cachedMatches;
    } else {
        // Use Constant directly
        const apiKey = FOOTBALL_API_KEY;
        
        // Fetch matches for today AND tomorrow to ensure list isn't empty at night
        const todayDate = new Date();
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        
        const todayStr = todayDate.toISOString().split('T')[0];
        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
        
        console.log(`Fetching matches for ${todayStr} to ${tomorrowStr}...`);
        const response = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${todayStr}&dateTo=${tomorrowStr}`, {
            headers: {
                'X-Auth-Token': apiKey
            }
        });

        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            // If API fails (e.g. rate limit), return empty list so UI handles it gracefully
             if (cachedMatches) return cachedMatches; 
             return [];
        }

        const data = await response.json();
        
        // Map API response to our internal format
        if (data.matches && Array.isArray(data.matches)) {
            matches = data.matches.map((m: any) => {
                const date = new Date(m.utcDate);
                // Format time as HH:MM
                const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                
                const homeName = m.homeTeam?.name || 'Home';
                const awayName = m.awayTeam?.name || 'Away';
                const status = m.status;
                
                // Add Day prefix if tomorrow
                const matchDay = date.getDate();
                const currentDay = new Date().getDate();
                const timeLabel = matchDay !== currentDay ? `Tom ${timeStr}` : timeStr;

                return {
                    id: String(m.id),
                    league: m.competition?.name || 'Unknown',
                    match: `${homeName} vs ${awayName}`,
                    time: timeLabel,
                    rawDate: m.utcDate,
                    // New Fields
                    homeTeam: homeName,
                    awayTeam: awayName,
                    homeLogo: m.homeTeam?.crest || '',
                    awayLogo: m.awayTeam?.crest || '',
                    status: status,
                    homeScore: m.score?.fullTime?.home ?? null,
                    awayScore: m.score?.fullTime?.away ?? null
                };
            });
        }

        // Save raw results to cache if successful
        if (matches.length > 0) {
            saveToCache(CACHE_KEY, matches);
        }
    }

    // --- PROCESSING ---

    const now = new Date();
    
    // 1. Filter out old matches
    const validMatches = matches.filter(m => {
        try {
            // Keep LIVE matches always
            if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return true;

            let matchTime = 0;
            if (m.rawDate) {
                matchTime = new Date(m.rawDate).getTime();
            } else {
                return true; 
            }

            // Keep matches visible for 12 hours after start time (extended from 4)
            const matchEndInMs = matchTime + (720 * 60000);
            
            return now.getTime() < matchEndInMs;
        } catch (e) {
            return true;
        }
    });

    // --- TEAMS DEFINITIONS ---
    const topItalianTeams = ['juventus', 'napoli', 'roma', 'lazio', 'atalanta', 'fiorentina', 'bologna', 'torino', 'inter', 'milan'];
    const topGlobalTeams = ['man city', 'arsenal', 'liverpool', 'chelsea', 'man utd', 'tottenham', 'real madrid', 'barcelona', 'atletico', 'bayern', 'dortmund', 'psg', 'benfica', 'porto'];
    const allowedOtherTeams = [...topItalianTeams, ...topGlobalTeams, 'leipzig', 'newcastle', 'aston villa', 'brighton', 'ajax', 'psv', 'feyenoord', 'sporting'];

    // --- STRICT FILTERING ---
    let filteredMatches = validMatches.filter(m => {
        const text = (m.match + " " + m.league).toLowerCase();
        
        // Always keep Top Tier
        if (text.includes('inter ') || text.includes('internazionale')) return true;
        if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) return true;

        // Keep Major Leagues
        if (text.includes('serie a') || text.includes('calcio')) return true;
        if (text.includes('premier league') || text.includes('epl')) return true;
        if (text.includes('primera division') || text.includes('la liga')) return true;
        if (text.includes('champions league') || text.includes('europa')) return true;
        if (text.includes('bundesliga')) return true;

        // Keep if teams are interesting
        if (allowedOtherTeams.some(t => text.includes(t))) return true;

        return false;
    });

    // FALLBACK
    if (filteredMatches.length === 0 && validMatches.length > 0) {
        filteredMatches = validMatches.slice(0, 15);
    }

    // --- PRIORITY SCORING SYSTEM ---
    filteredMatches.sort((a, b) => {
      const getScore = (m: HighlightMatch) => {
        let score = 0;
        const text = (m.match + " " + m.league).toLowerCase();
        
        // TIER 0: GOD TIER (Inter & Milan)
        if (text.includes('inter ') || text.includes('internazionale')) return 5000000;
        if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) return 4900000;

        // BASE LEAGUE SCORES
        if (text.includes('serie a') || text.includes('calcio') || text.includes('coppa italia')) score += 50000;
        else if (text.includes('champions league')) score += 60000; 
        else if (text.includes('premier league') || text.includes('epl')) score += 40000;
        else if (text.includes('primera division') || text.includes('la liga')) score += 30000;
        else score += 10000;

        // TEAM BONUSES
        const italianCount = topItalianTeams.filter(t => text.includes(t)).length;
        score += (italianCount * 250000);

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
    return [];
  }
};

export const pollLiveScores = async (previousMatches: HighlightMatch[]): Promise<{ events: GoalEvent[], updatedMatches: HighlightMatch[] }> => {
  // If previousMatches is empty (e.g. initially or due to expired cache logic in parent), 
  // try to hydrate from cache IGNORING TTL to establish a baseline.
  // This prevents the "Silent Update" bug where new goals aren't notified because we had no prior state.
  let baselineMatches = previousMatches;
  if (!baselineMatches || baselineMatches.length === 0) {
      const cached = getFromCache<HighlightMatch[]>(CACHE_KEY, true); // ignoreTTL = true
      if (cached) {
          baselineMatches = cached;
      }
  }

  const apiKey = FOOTBALL_API_KEY;
  if (!apiKey) return { events: [], updatedMatches: baselineMatches };

  try {
    const response = await fetch(`https://api.football-data.org/v4/matches?status=IN_PLAY`, {
        headers: { 'X-Auth-Token': apiKey }
    });

    if (!response.ok) return { events: [], updatedMatches: baselineMatches };
    
    const data = await response.json();
    if (!data.matches) return { events: [], updatedMatches: baselineMatches };

    const goalEvents: GoalEvent[] = [];
    const newMatchesMap = new Map<string, any>();
    data.matches.forEach((m: any) => newMatchesMap.set(String(m.id), m));

    const updatedMatches = baselineMatches.map(prevMatch => {
        const liveMatch = newMatchesMap.get(prevMatch.id);
        if (!liveMatch) return prevMatch; 

        const newHomeScore = liveMatch.score?.fullTime?.home ?? 0;
        const newAwayScore = liveMatch.score?.fullTime?.away ?? 0;
        const oldHomeScore = prevMatch.homeScore ?? 0;
        const oldAwayScore = prevMatch.awayScore ?? 0;

        if (newHomeScore > oldHomeScore || newAwayScore > oldAwayScore) {
            goalEvents.push({
                matchId: prevMatch.id,
                matchTitle: prevMatch.match,
                score: `${newHomeScore} - ${newAwayScore}`,
                scorer: 'Checking...',
                minute: 'LIVE'
            });
        } else if (newHomeScore < oldHomeScore || newAwayScore < oldAwayScore) {
            // VAR Decision - Goal Disallowed
            goalEvents.push({
                matchId: prevMatch.id,
                matchTitle: prevMatch.match,
                score: `${newHomeScore} - ${newAwayScore}`,
                scorer: 'Goal Disallowed (VAR)',
                minute: 'VAR'
            });
        }

        return {
            ...prevMatch,
            status: liveMatch.status,
            homeScore: newHomeScore,
            awayScore: newAwayScore
        };
    });

    // Fetch details for scorer
    for (const event of goalEvents) {
        // Skip fetching scorer details for VAR events, as the API might return old goal data
        if (event.minute === 'VAR') continue;

        try {
            const detailRes = await fetch(`https://api.football-data.org/v4/matches/${event.matchId}`, {
                headers: { 'X-Auth-Token': apiKey }
            });
            if (detailRes.ok) {
                const detailData = await detailRes.json();
                const goals = detailData.goals || [];
                if (goals.length > 0) {
                    const lastGoal = goals[goals.length - 1];
                    event.scorer = lastGoal.scorer?.name || "Goal!";
                    if (lastGoal.minute) event.minute = `${lastGoal.minute}'`;
                }
            }
        } catch (e) { console.error(e); }
    }

    return { events: goalEvents, updatedMatches };

  } catch (e) {
    return { events: [], updatedMatches: baselineMatches };
  }
};
