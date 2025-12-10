


import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { Category, EPGData, Channel, HighlightMatch, LocalMatchChannel } from '../types';
import { fetchFootballHighlights } from '../services/geminiService';
import { findLocalMatches } from '../services/epgService';
import { DEFAULT_LOGO } from '../constants';

interface SidebarProps {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
  allChannels: Channel[];
  globalChannels: Channel[]; // New Prop for Global Search
  epgData: EPGData;
  onChannelSelect: (channel: Channel) => void;
}

export interface SidebarRef {
    closeDrawer: () => void;
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ activeCategory, onSelectCategory, allChannels, globalChannels, epgData, onChannelSelect }, ref) => {
  const [highlights, setHighlights] = useState<HighlightMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Search State
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Results
  const [localMatches, setLocalMatches] = useState<LocalMatchChannel[]>([]);
  
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
      closeDrawer: () => {
          setActiveMatchId(null);
          if (drawerCloseTimerRef.current) {
              clearTimeout(drawerCloseTimerRef.current);
              drawerCloseTimerRef.current = null;
          }
      }
  }));

  useEffect(() => {
    const loadHighlights = async () => {
      setLoading(true);
      const matches = await fetchFootballHighlights();
      setHighlights(matches.slice(0, 12)); 
      setLoading(false);
    };
    loadHighlights();
  }, []);

  // Handle Back Button specifically for closing the drawer
  useEffect(() => {
    if (!activeMatchId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Escape' || e.keyCode === 461) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation(); 
            setActiveMatchId(null);
        }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true }); 
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activeMatchId]);

  const handleMatchClick = async (matchId: string, matchTitle: string) => {
    if (activeMatchId === matchId && localMatches.length > 0) return;

    setActiveMatchId(matchId);
    setIsSearching(true);
    setLocalMatches([]);
    
    const local = findLocalMatches(matchTitle, globalChannels, epgData);
    setLocalMatches(local);

    setIsSearching(false);
  };

  const handleMouseEnter = () => {
      if (drawerCloseTimerRef.current) {
          clearTimeout(drawerCloseTimerRef.current);
          drawerCloseTimerRef.current = null;
      }
  };

  const handleSidebarLeave = () => {
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    drawerCloseTimerRef.current = setTimeout(() => {
        setActiveMatchId(null);
    }, 2000);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = 
        target.closest('button') || 
        target.closest('[data-highlight-id]') ||
        target.closest('[data-drawer-result-index]') ||
        target.closest('.cursor-pointer');

    if (!isInteractive) {
        e.preventDefault();
    }
  };

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleSidebarLeave}
      onMouseDown={handleMouseDown}
      className="w-96 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col pt-10 relative z-50"
    >
      <nav className="shrink-0 px-4 space-y-4 relative z-20">
        {Object.values(Category).map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              data-sidebar-item={category}
              onClick={() => onSelectCategory(category)}
              className={`w-full group relative flex items-center px-4 py-4 rounded-xl 
                ${isActive 
                  ? 'bg-white/10' 
                  : 'hover:bg-white/5'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-purple-500 rounded-r-full"></div>
              )}
              
              <div className={`mr-4 p-2 rounded-lg ${isActive ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400'}`}>
                {category === Category.KANALER ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>

              <span className={`text-lg font-medium tracking-wide ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {category}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 flex flex-col justify-end px-4 pb-6 mt-4 overflow-hidden relative z-10">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Highlights</h3>
        
        {loading ? (
           <div className="space-y-2">
             <div className="h-16 bg-white/5 rounded-lg opacity-50"></div>
             <div className="h-16 bg-white/5 rounded-lg opacity-50"></div>
             <div className="h-16 bg-white/5 rounded-lg opacity-50"></div>
           </div>
        ) : highlights.length > 0 ? (
          <div className="space-y-2.5 overflow-y-auto no-scrollbar pb-2 relative">
            {highlights.map(match => {
              const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';
              const isFinished = match.status === 'FINISHED';
              const showScore = isLive || isFinished;
              
              return (
              <div 
                key={match.id} 
                data-highlight-id={match.id}
                tabIndex={-1} 
                onClick={(e) => {
                    e.currentTarget.focus();
                    handleMatchClick(match.id, match.match);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMatchClick(match.id, match.match);
                }}
                className={`bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 focus:bg-white/10 focus:border-white/30 outline-none cursor-pointer group flex flex-col gap-2 ${activeMatchId === match.id ? 'bg-white/10 border-white/30' : ''}`}
              >
                {/* Header: League and Time/Status */}
                <div className="flex justify-between items-center border-b border-white/5 pb-2 pointer-events-none">
                   <span className="text-[11px] font-bold text-purple-400 uppercase truncate max-w-[150px]">{match.league}</span>
                   <div className="flex items-center gap-2">
                       {isLive && (
                           <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                           </span>
                       )}
                       <span className={`text-[11px] font-medium ${isLive ? 'text-green-400 animate-pulse' : 'text-gray-400 group-hover:text-gray-200 group-focus:text-gray-200'}`}>
                         {isFinished ? 'FT' : match.time.split(' ').pop()?.replace(/CET|CEST/, '') || match.time}
                       </span>
                   </div>
                </div>

                {/* Teams Row */}
                <div className="flex flex-col gap-1.5 pointer-events-none mt-1">
                    {/* Home Team */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 flex items-center justify-center shrink-0 bg-white/10 rounded-full p-0.5">
                                {match.homeLogo ? (
                                    <img src={match.homeLogo} alt="" className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                                ) : (
                                    <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                                )}
                            </div>
                            <span className="text-2xl font-bold text-gray-200 leading-tight">{match.homeTeam}</span>
                        </div>
                        {showScore && match.homeScore !== null && (
                            <span className={`text-sm font-bold ${isLive ? 'text-green-400' : 'text-gray-300'}`}>{match.homeScore}</span>
                        )}
                    </div>

                    {/* Away Team */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 flex items-center justify-center shrink-0 bg-white/10 rounded-full p-0.5">
                                {match.awayLogo ? (
                                    <img src={match.awayLogo} alt="" className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                                ) : (
                                    <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                                )}
                            </div>
                            <span className="text-2xl font-bold text-gray-200 leading-tight">{match.awayTeam}</span>
                        </div>
                        {showScore && match.awayScore !== null && (
                            <span className={`text-sm font-bold ${isLive ? 'text-green-400' : 'text-gray-300'}`}>{match.awayScore}</span>
                        )}
                    </div>
                </div>
              </div>
            );
            })}
          </div>
        ) : (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center mt-2">
            <p className="text-sm font-bold text-gray-400">No major matches found for today.</p>
            <p className="text-xs text-gray-600 mt-1">Check back later for updates.</p>
          </div>
        )}
      </div>

      {/* SEARCH RESULT DRAWER */}
      <div 
        className={`hidden absolute top-0 bottom-0 left-full w-[450px] bg-[#111] border-l border-r border-white/10 shadow-2xl z-[100] flex-col pointer-events-auto
          ${activeMatchId ? '!flex' : ''}`}
      >
        <div className="p-6 border-b border-white/10 bg-white/5">
          <h4 className="text-xl font-bold text-white uppercase tracking-wider">Where to Watch</h4>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto no-scrollbar flex flex-col">
          <div className="mb-6">
              <h5 className="text-sm font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Watch Now (Your Channels)
              </h5>
              
              <hr className="border-white/10 mb-4" />

              {localMatches.length > 0 ? (
                <div className="space-y-4">
                   {localMatches.map((lm, i) => (
                      <div 
                        key={i} 
                        data-drawer-result-index={i}
                        tabIndex={-1}
                        onClick={() => onChannelSelect(lm.channel)}
                        onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                                 onChannelSelect(lm.channel);
                             }
                        }}
                        className="group flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 hover:border-white/20 focus:bg-white/10 focus:border-white cursor-pointer active:scale-95 transition-transform outline-none"
                      >
                         <div className="h-16 w-28 bg-gray-300 flex items-center justify-center rounded-lg p-2 shrink-0 border border-white/10">
                            <img src={lm.channel.logo} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
                         </div>
                         <div className="min-w-0 flex-1">
                             <div className="flex items-center gap-2">
                                <p className="text-white text-lg font-bold truncate group-hover:text-purple-400">{lm.channel.name}</p>
                                {lm.isLive && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold tracking-wider">LIVE</span>}
                             </div>
                             <p className="text-sm text-gray-400 truncate mt-1">{lm.programTitle}</p>
                         </div>
                         <div className="shrink-0 bg-white/10 p-3 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                         </div>
                      </div>
                   ))}
                </div>
              ) : (
                <div className="p-4 bg-white/5 rounded-lg border border-white/5 text-center">
                    <p className="text-xs text-gray-500 italic">No matching channels found in your playlist.</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});