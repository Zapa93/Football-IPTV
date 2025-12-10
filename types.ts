

export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  tvgId?: string;
}

export interface ChannelGroup {
  title: string;
  channels: Channel[];
}

export enum Category {
  KANALER = 'Kanaler',
  FOTBOLL = 'Fotboll'
}

export type PlaylistData = ChannelGroup[];

export interface EPGProgram {
  id: string; // tvg-id
  title: string;
  description: string;
  start: Date;
  end: Date;
}

export interface EPGData {
  [tvgId: string]: EPGProgram[];
}

export interface HighlightMatch {
  id: string;
  league: string;
  match: string; // "Home vs Away" (kept for compat)
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  rawDate?: string;
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED' | 'AWARDED';
  homeScore: number | null;
  awayScore: number | null;
}

export interface GoalEvent {
  matchId: string;
  matchTitle: string;
  score: string;
  scorer: string;
  minute: string;
  channelToWatch?: Channel;
}

export interface LocalMatchChannel {
    channel: Channel;
    programTitle: string;
    isLive: boolean;
    start: Date;
}