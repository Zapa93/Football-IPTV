import { HighlightMatch } from '../types';

export type HighlightsResult = HighlightMatch[];

// Nyckeln för backup-cachen
const CACHE_KEY = 'football_data_highlights_live_v1'; 

// --- CACHING UTILITIES (Endast för backup vid fel) ---

interface CacheEntry<T> {
  date: string;
  timestamp: number;
  data: T;
}

const getLocalDateString = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
};

// Hämtar BARA om vi måste (backup)
export const getFromCache = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item) as CacheEntry<T>;
    
    // Måste vara från idag
    if (parsed.date !== getLocalDateString()) return null;

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
    console.error("Failed to save backup cache", e);
  }
};

// --- MAIN SERVICE ---

export const fetchFootballHighlights = async (): Promise<HighlightsResult> => {
  let matches: HighlightMatch[] = [];

  // 1. FÖRSÖK ALLTID MED API FÖRST (Live-uppdatering)
  const apiKey = import.meta.env.VITE_FOOTBALL_API_KEY; 
  const todayStr = getLocalDateString(new Date());
  
  try {
      console.log(`🔄 Hämtar LIVE-data för ${todayStr}...`);
      
      const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${todayStr}&timezone=Europe/Stockholm`, {
          headers: {
              'x-apisports-key': apiKey, 
          }
      });

      const data = await response.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
          console.error("API Error:", data.errors);
          throw new Error("API Limit Reached or Error"); // Kasta fel för att trigga backup
      }

      if (data.response && Array.isArray(data.response)) {
          matches = data.response.map((item: any) => {
              const f = item.fixture;
              const l = item.league;
              const t = item.teams;
              const g = item.goals;
              
              const date = new Date(f.date);
              const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              
              // Status Mapping
              let status: HighlightMatch['status'] = 'SCHEDULED';
              const s = f.status.short;
              
              if (['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(s)) status = 'IN_PLAY';
              else if (s === 'HT') status = 'PAUSED';
              else if (['FT', 'AET', 'PEN'].includes(s)) status = 'FINISHED';
              else if (s === 'PST') status = 'POSTPONED';
              else if (s === 'CANC') status = 'CANCELLED';
              else if (s === 'ABD') status = 'SUSPENDED';

              return {
                  id: String(f.id),
                  leagueId: l.id,
                  league: l.name || 'Unknown',
                  match: `${t.home.name} vs ${t.away.name}`,
                  time: timeStr,
                  rawDate: f.date,
                  homeTeam: t.home.name,
                  awayTeam: t.away.name,
                  homeLogo: t.home.logo || '',
                  awayLogo: t.away.logo || '',
                  status: status,
                  homeScore: g.home,
                  awayScore: g.away
              };
          });

          // Om lyckat: Spara som backup inför framtiden
          if (matches.length > 0) {
              saveToCache(CACHE_KEY, matches);
          }
      }

  } catch (e) {
      console.error("Nätverksfel eller API-fel, använder backup:", e);
      // 2. BACKUP: Om API misslyckas (t.ex. inget internet), hämta från cache
      const cachedMatches = getFromCache<HighlightMatch[]>(CACHE_KEY);
      if (cachedMatches) {
          console.log("⚠️ Visar cachad backup-data.");
          matches = cachedMatches;
      }
  }

  // --- FILTRERING ---
  const WANTED_LEAGUES = [
      39, 45, 48, 135, 137, 140, 143, 78, 529, 61, 66, 2, 3, 848, 113, 114, 119
  ];
  const allowedOtherTeams = ['inter', 'milan', 'liverpool', 'arsenal', 'man city', 'chelsea', 'real madrid', 'barcelona', 'bayern', 'psg', 'malmö', 'aik', 'djurgården', 'hammarby', 'häcken'];

  let filteredMatches = matches.filter(m => {
      if (m.leagueId && WANTED_LEAGUES.includes(m.leagueId)) return true;
      const text = (m.match + " " + m.league).toLowerCase();
      if (allowedOtherTeams.some(t => text.includes(t))) return true;
      return false;
  });

  // --- SORTERING ---
  filteredMatches.sort((a, b) => {
    const getScore = (m: HighlightMatch) => {
      let score = 0;
      const text = (m.match + " " + m.league).toLowerCase();
      
      // Prioritera dina lag
      if (text.includes('inter ') || text.includes('internazionale')) return 5000000;
      if (text.includes('ac milan') || (text.includes('milan') && !text.includes('inter'))) return 4900000;
      if (text.includes('malmö') || text.includes('mff')) return 4800000;

      // Prioritera ligor
      if (m.leagueId === 135) score += 50000; // Serie A
      else if (m.leagueId === 39) score += 40000; // PL
      else if (m.leagueId === 2) score += 60000; // CL
      else if (m.leagueId === 113) score += 35000; // Allsvenskan
      else score += 10000;

      // Live matcher alltid högst upp bland resten
      if (m.status === 'IN_PLAY' || m.status === 'PAUSED') score += 5000;

      return score;
    };

    return getScore(b) - getScore(a);
  });

  return filteredMatches;
};