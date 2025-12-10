


import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Sidebar, SidebarRef } from './components/Sidebar';
import { VideoPlayer } from './components/VideoPlayer';
import { fetchPlaylist } from './services/m3uService';
import { fetchEPG, getCurrentProgram } from './services/epgService';
import { Category, Channel, PlaylistData, EPGData, ChannelGroup } from './types';
import { ENTERTAINMENT_URL, SPORT_URL, DEFAULT_LOGO, MANUAL_EPG_URL, CUSTOM_EPG_URL } from './constants';
import { GroupItem, ChannelItem } from './components/ListItems';

// --- CONSTANTS FOR VIRTUALIZATION ---
const CHANNEL_HEIGHT = 90; // px
const HEADER_HEIGHT = 50; // px

interface FlatItem {
  type: 'group' | 'channel'; 
  id: string;
  top: number;
  height: number;
  data?: Channel;      
  groupData?: ChannelGroup;
  title?: string;
  index: number; 
  channelNumber?: number;
  count?: number; 
}

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>(Category.KANALER);
  const [playlist, setPlaylist] = useState<PlaylistData>([]);
  const [allKnownChannels, setAllKnownChannels] = useState<Channel[]>([]); // Combined list for Global Search
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ChannelGroup | null>(null);
  
  // EPG State
  const [epgData, setEpgData] = useState<EPGData>({});
  
  // --- VIRTUAL LIST STATE ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  // --- FOCUS STATE ---
  const [activeSection, setActiveSection] = useState<'sidebar' | 'list'>('sidebar');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [savedGroupIndex, setSavedGroupIndex] = useState<number>(0); 

  const sidebarRef = useRef<SidebarRef>(null);

  // Load Playlist & EPG
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setPlaylist([]);
      setEpgData({});
      setSelectedGroup(null); 
      
      // Fetch BOTH playlists to enable Global Search
      const [entData, sportData] = await Promise.all([
        fetchPlaylist(ENTERTAINMENT_URL),
        fetchPlaylist(SPORT_URL)
      ]);

      // Combine all channels and remove duplicates by URL
      const allEntChannels = entData.groups.flatMap(g => g.channels);
      const allSportChannels = sportData.groups.flatMap(g => g.channels);
      
      const uniqueChannelsMap = new Map<string, Channel>();
      [...allEntChannels, ...allSportChannels].forEach(c => {
         if (c.url && !uniqueChannelsMap.has(c.url)) {
             uniqueChannelsMap.set(c.url, c);
         }
      });
      const combinedChannels = Array.from(uniqueChannelsMap.values());
      setAllKnownChannels(combinedChannels);
      
      // Set the Visible Playlist based on Active Category
      const activeData = activeCategory === Category.KANALER ? entData : sportData;
      setPlaylist(activeData.groups);
      
      setActiveSection('sidebar');
      setFocusedIndex(-1);
      setSavedGroupIndex(0);

      if (activeData.groups.length === 1) {
          setSelectedGroup(activeData.groups[0]);
      }

      // Dual EPG Strategy: Provider + Custom
      // Use the active playlist's EPG URL as fallback for provider source
      const providerSource = MANUAL_EPG_URL || activeData.epgUrl;
      const customSource = CUSTOM_EPG_URL;
      
      const fetchTasks: Promise<EPGData>[] = [];
      
      // 1. Fetch Provider EPG (or resolve empty)
      if (providerSource) {
          fetchTasks.push(fetchEPG(providerSource));
      } else {
          fetchTasks.push(Promise.resolve({}));
      }

      // 2. Fetch Custom EPG (or resolve empty)
      if (customSource) {
          fetchTasks.push(fetchEPG(customSource));
      } else {
          fetchTasks.push(Promise.resolve({}));
      }

      // 3. Wait for both and merge
      Promise.all(fetchTasks).then(([providerData, customData]) => {
          // Merge logic: Spread provider first, then overwrite with custom
          const mergedData = { ...providerData, ...customData };
          console.log(`EPG Loaded. Provider: ${Object.keys(providerData).length}, Custom: ${Object.keys(customData).length} channels.`);
          setEpgData(mergedData);
      });
    };
    loadData();
  }, [activeCategory]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        if (selectedGroup) {
             // FIX: If this is a single-group playlist (e.g. Kanaler), never go back to group view
             if (playlist.length === 1) return;

             if (!event.state || !event.state.group) {
                  setSelectedGroup(null);
                  setFocusedIndex(savedGroupIndex);
                  setActiveSection('list');
             }
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedGroup, savedGroupIndex, playlist]);

  const { items: flatItems, totalHeight } = useMemo(() => {
    const items: FlatItem[] = [];
    let currentTop = 0;
    
    if (!selectedGroup) {
        playlist.forEach((group) => {
             if (group.channels.length === 0) return;
             
             items.push({
                 type: 'group',
                 id: `grp-${group.title}`,
                 title: group.title,
                 groupData: group,
                 top: currentTop,
                 height: CHANNEL_HEIGHT,
                 index: items.length,
                 count: group.channels.length
             });
             currentTop += CHANNEL_HEIGHT;
        });
    } else {
        selectedGroup.channels.forEach((channel, idx) => {
            items.push({
                type: 'channel',
                id: channel.id,
                data: channel,
                top: currentTop,
                height: CHANNEL_HEIGHT,
                index: items.length,
                channelNumber: idx + 1
            });
            currentTop += CHANNEL_HEIGHT;
        });
    }
    
    return { items, totalHeight: currentTop };
  }, [playlist, selectedGroup]);

  useEffect(() => {
    if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight);
    const handleResize = () => { if (scrollRef.current) setContainerHeight(scrollRef.current.clientHeight); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop);

  useEffect(() => {
    if (activeSection === 'list' && focusedIndex !== -1 && scrollRef.current) {
      const item = flatItems[focusedIndex];
      if (item) {
        const currentScroll = scrollRef.current.scrollTop;
        const viewH = scrollRef.current.clientHeight;
        
        if (item.top < currentScroll) {
            scrollRef.current.scrollTo({ top: item.top, behavior: 'auto' });
        } else if (item.top + item.height > currentScroll + viewH) {
            scrollRef.current.scrollTo({ top: item.top + item.height - viewH, behavior: 'auto' });
        }
      }
    }
  }, [focusedIndex, activeSection, flatItems]);

  useEffect(() => {
    if (selectedChannel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      
      if (!document.activeElement || document.activeElement === document.body) {
         const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
         btn?.focus();
      }

      const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'PageUp', 'PageDown', 'Backspace', 'Escape'].includes(e.key) || e.keyCode === 461; 
      if (!isNav) return;

      if (e.key === 'Backspace' || e.key === 'Escape' || e.keyCode === 461) {
          if (selectedGroup) {
              if (playlist.length === 1) {
                  if (activeSection === 'list') {
                      e.preventDefault();
                      setActiveSection('sidebar');
                      const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
                      btn?.focus();
                  }
                  return;
              }

              e.preventDefault();
              window.history.back(); 
              return;
          }
          return;
      }

      if (activeSection === 'sidebar') {
        const currentEl = document.activeElement as HTMLElement;
        const currentSidebarItem = currentEl?.getAttribute('data-sidebar-item');
        const currentHighlightId = currentEl?.getAttribute('data-highlight-id');
        const currentDrawerIndex = currentEl?.getAttribute('data-drawer-result-index');

        if (e.key === 'ArrowRight') {
           e.preventDefault();
           if (currentDrawerIndex) {
               sidebarRef.current?.closeDrawer();
               setActiveSection('list');
               if (focusedIndex === -1) setFocusedIndex(0);
               return;
           }
           if (currentHighlightId) {
               const firstDrawerResult = document.querySelector('[data-drawer-result-index="0"]') as HTMLElement;
               if (firstDrawerResult) {
                   firstDrawerResult.focus();
                   return; 
               }
           }
           sidebarRef.current?.closeDrawer();
           setActiveSection('list');
           if (focusedIndex === -1) {
              setFocusedIndex(0);
           }
           currentEl?.blur();
           return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();

            if (currentSidebarItem) {
                 const categories = Object.values(Category);
                 const idx = categories.indexOf(currentSidebarItem as Category);
                 if (idx < categories.length - 1) {
                     const nextCat = categories[idx + 1];
                     (document.querySelector(`[data-sidebar-item="${nextCat}"]`) as HTMLElement)?.focus();
                 } else {
                     const firstHighlight = document.querySelector('[data-highlight-id]') as HTMLElement;
                     if (firstHighlight) firstHighlight.focus();
                 }
            } else if (currentHighlightId) {
                 const next = currentEl.nextElementSibling as HTMLElement;
                 if (next && next.hasAttribute('data-highlight-id')) {
                     next.focus();
                 }
            } else if (currentDrawerIndex) {
                 const next = currentEl.nextElementSibling as HTMLElement;
                 if (next && next.hasAttribute('data-drawer-result-index')) {
                     next.focus();
                 }
            } else {
                 const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
                 btn?.focus();
            }
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();

            if (currentSidebarItem) {
                 const categories = Object.values(Category);
                 const idx = categories.indexOf(currentSidebarItem as Category);
                 if (idx > 0) {
                     const prevCat = categories[idx - 1];
                     (document.querySelector(`[data-sidebar-item="${prevCat}"]`) as HTMLElement)?.focus();
                 }
            } else if (currentHighlightId) {
                 const prev = currentEl.previousElementSibling as HTMLElement;
                 if (prev && prev.hasAttribute('data-highlight-id')) {
                     prev.focus();
                 } else {
                     const categories = Object.values(Category);
                     const lastCat = categories[categories.length - 1];
                     (document.querySelector(`[data-sidebar-item="${lastCat}"]`) as HTMLElement)?.focus();
                 }
            } else if (currentDrawerIndex) {
                 const prev = currentEl.previousElementSibling as HTMLElement;
                 if (prev && prev.hasAttribute('data-drawer-result-index')) {
                     prev.focus();
                 }
            }
        }
        
        if (e.key === 'ArrowLeft') {
            if (currentDrawerIndex) {
                e.preventDefault();
                const activeHighlight = document.querySelector('[data-highlight-id].bg-white\\/10') as HTMLElement;
                if (activeHighlight) activeHighlight.focus();
                else {
                    const firstH = document.querySelector('[data-highlight-id]') as HTMLElement;
                    if (firstH) firstH.focus();
                }
                return;
            }
        }

        if (e.key === 'Enter') {
            const currentVal = document.activeElement?.getAttribute('data-sidebar-item');
            if (currentVal && currentVal !== activeCategory) {
               e.preventDefault();
               setActiveCategory(currentVal as Category);
            }
        }
      } else {
        e.preventDefault();
        if (e.key === 'ArrowLeft') {
           setActiveSection('sidebar');
           setTimeout(() => {
              const btn = document.querySelector(`[data-sidebar-item="${activeCategory}"]`) as HTMLElement;
              btn?.focus();
           }, 0);
           return;
        }
        if (e.key === 'Enter') {
            const item = flatItems[focusedIndex];
            if (!item) return;

            if (item.type === 'group' && item.groupData) {
                setSavedGroupIndex(focusedIndex); 
                setSelectedGroup(item.groupData);
                setFocusedIndex(0); 
                window.history.pushState({ group: item.groupData.title }, ""); 
                if (scrollRef.current) scrollRef.current.scrollTo(0,0);
            } else if (item.type === 'channel' && item.data) {
                setSelectedChannel(item.data);
            }
            return;
        }

        let nextIndex = focusedIndex;
        if (e.key === 'ArrowUp') nextIndex--;
        else if (e.key === 'ArrowDown') nextIndex++;
        else if (e.key === 'PageUp') nextIndex -= 5;
        else if (e.key === 'PageDown') nextIndex += 5;

        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= flatItems.length) nextIndex = flatItems.length - 1;
        
        setFocusedIndex(nextIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSection, focusedIndex, flatItems, loading, selectedChannel, activeCategory, selectedGroup, savedGroupIndex, playlist]);

  const renderVirtualItems = () => {
    if (loading || flatItems.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
         <p>No channels or groups found.</p>
      </div>
    );

    let startIndex = 0;
    const RENDER_BUFFER_PX = 2000; 
    const topBound = Math.max(0, scrollTop - RENDER_BUFFER_PX);
    const bottomBound = scrollTop + containerHeight + RENDER_BUFFER_PX;

    let low = 0, high = flatItems.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (flatItems[mid].top + flatItems[mid].height < topBound) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    startIndex = Math.max(0, low);
    
    let endIndex = startIndex;
    for (let i = startIndex; i < flatItems.length; i++) {
        if (flatItems[i].top > bottomBound) break;
        endIndex = i;
    }

    return flatItems.slice(startIndex, endIndex + 1).map((item) => {
        if (item.type === 'group') {
            return (
                <GroupItem
                    key={item.id}
                    item={item}
                    isFocused={activeSection === 'list' && focusedIndex === item.index}
                    onMouseEnter={() => {
                        setFocusedIndex(item.index);
                        setActiveSection('list');
                        sidebarRef.current?.closeDrawer();
                    }}
                    onMouseMove={() => {
                        if (activeSection !== 'list' || focusedIndex !== item.index) {
                            setFocusedIndex(item.index);
                            setActiveSection('list');
                        }
                    }}
                    onClick={() => {
                        setFocusedIndex(item.index);
                        setActiveSection('list');
                        sidebarRef.current?.closeDrawer();
                        if (item.groupData) {
                            setSavedGroupIndex(item.index);
                            setSelectedGroup(item.groupData);
                            setFocusedIndex(0);
                            window.history.pushState({ group: item.groupData.title }, "");
                            if (scrollRef.current) scrollRef.current.scrollTo(0,0);
                        }
                    }}
                />
            );
        }

        const currentProg = item.data?.tvgId ? getCurrentProgram(epgData[item.data.tvgId]) : null;
        return (
            <ChannelItem
                key={item.id}
                item={item}
                currentProg={currentProg}
                isFocused={activeSection === 'list' && focusedIndex === item.index}
                onMouseEnter={() => {
                  setFocusedIndex(item.index);
                  setActiveSection('list');
                  sidebarRef.current?.closeDrawer();
                }}
                onMouseMove={() => {
                    if (activeSection !== 'list' || focusedIndex !== item.index) {
                        setFocusedIndex(item.index);
                        setActiveSection('list');
                    }
                }}
                onClick={() => {
                    setFocusedIndex(item.index);
                    setActiveSection('list');
                    sidebarRef.current?.closeDrawer();
                    if (item.data) setSelectedChannel(item.data);
                }}
            />
        );
    });
  };

  const handleClosePlayer = useCallback(() => setSelectedChannel(null), []);

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden">
      <Sidebar 
        ref={sidebarRef}
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
        allChannels={playlist.flatMap(g => g.channels)}
        globalChannels={allKnownChannels}
        epgData={epgData}
        onChannelSelect={setSelectedChannel}
      />

      <div className="flex-1 flex flex-col h-full relative z-0">
        <header className="h-24 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a] z-20 shadow-sm shrink-0">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-3xl font-bold text-white tracking-tight">{activeCategory}</h2>
               {selectedGroup && selectedGroup.title !== 'Uncategorized' && (
                   <>
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h2 className="text-3xl font-bold text-purple-400 tracking-tight">{selectedGroup.title}</h2>
                   </>
               )}
            </div>
            <p className="text-gray-400 text-sm mt-1">
              {loading 
                 ? 'Loading...' 
                 : selectedGroup 
                    ? `${selectedGroup.channels.length} channels`
                    : `${playlist.length} Groups`
              }
            </p>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative no-scrollbar">
          {loading ? (
             <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <div key={i} className="h-20 w-full bg-white/5 rounded-lg opacity-50" />)}
            </div>
          ) : (
            <>
                <div style={{ height: totalHeight, width: '100%' }} />
                {renderVirtualItems()}
            </>
          )}
        </div>
      </div>

      {selectedChannel && (
        <VideoPlayer 
          channel={selectedChannel} 
          activeCategory={activeCategory}
          allChannels={selectedGroup ? selectedGroup.channels : playlist.flatMap(g => g.channels)}
          globalChannels={allKnownChannels}
          playlist={playlist}
          epgData={epgData}
          onChannelSelect={setSelectedChannel}
          onClose={handleClosePlayer} 
        />
      )}
    </div>
  );
};

export default App;