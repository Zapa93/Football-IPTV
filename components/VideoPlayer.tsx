
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Channel, EPGData, EPGProgram, ChannelGroup, Category } from '../types';
import { DEFAULT_LOGO } from '../constants';
import { getCurrentProgram, getNextProgram } from '../services/epgService';
import { PlayerChannelItem, PlayerGroupItem } from './ListItems';
import { TeletextViewer } from './TeletextViewer';

interface VideoPlayerProps {
  channel: Channel;
  activeCategory: Category;
  allChannels: Channel[]; // Default list (if needed)
  globalChannels: Channel[]; // For Global Search on Goal Alerts (Legacy prop, might be used elsewhere)
  playlist: ChannelGroup[]; // All groups for switching
  epgData: EPGData;
  onClose: () => void;
  onChannelSelect: (channel: Channel) => void;
}

declare global {
  interface Window { Hls: any; }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, activeCategory, allChannels, globalChannels, playlist, epgData, onClose, onChannelSelect }) => {
  
	
  const videoRef = useRef<HTMLVideoElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  
  const snapshotRef = useRef<HTMLCanvasElement>(null); // <--- NY
  const [showSnapshot, setShowSnapshot] = useState(false); // <--- NY
  
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  const [showTeletext, setShowTeletext] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  
  // Stream Switching State
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);
  const [streamSwitchToast, setStreamSwitchToast] = useState<string | null>(null);
  const streamToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // State for virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  // EPG Current Program State
  const [currentProgram, setCurrentProgram] = useState<EPGProgram | null>(null);
  const [nextProgram, setNextProgram] = useState<EPGProgram | null>(null);
  const [progress, setProgress] = useState(0);

  // Navigation State
  const [viewMode, setViewMode] = useState<'channels' | 'groups'>('channels');
  const [focusArea, setFocusArea] = useState<'list' | 'sidebar'>('list');
  
  // Data State
  const [currentChannelList, setCurrentChannelList] = useState<Channel[]>(allChannels);
  const [currentGroup, setCurrentGroup] = useState<ChannelGroup | null>(() => {
      return playlist.find(g => g.title === channel.group) || null;
  });

  // Constants
  const ITEM_HEIGHT = 65; 
  const LIST_HEIGHT = 900; 
  const RENDER_BUFFER = 80; 

  // Derived State Sync
  if (channel.id !== prevChannelId) {
     const idx = currentChannelList.findIndex(c => c.id === channel.id);
     if (idx !== -1) {
        setSelectedIndex(idx);
        setPrevChannelId(channel.id);
     } else {
        const group = playlist.find(g => g.title === channel.group);
        if (group) {
            setCurrentGroup(group);
            setCurrentChannelList(group.channels);
            const newIdx = group.channels.findIndex(c => c.id === channel.id);
            if (newIdx !== -1) setSelectedIndex(newIdx);
        }
        setPrevChannelId(channel.id);
     }
     // Reset states when channel changes
     setActiveStreamIndex(0);
     setStreamSwitchToast(null);
     setIsListOpen(false); // Ensure list is closed on channel switch
  }
  const captureSnapshot = useCallback(() => {
      const video = videoRef.current;
      const canvas = snapshotRef.current;
      if (video && canvas && !video.paused && !video.ended) {
          try {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  setShowSnapshot(true);
              }
          } catch (e) {
              console.warn("Could not capture snapshot", e);
          }
      }
  }, []);

  // Update EPG info periodically
  useEffect(() => {
     const updateEPG = () => {
        if (channel.tvgId && epgData[channel.tvgId]) {
           const prog = getCurrentProgram(epgData[channel.tvgId]);
           const next = getNextProgram(epgData[channel.tvgId]);
           
           setCurrentProgram(prog);
           setNextProgram(next);

           if (prog) {
               const total = prog.end.getTime() - prog.start.getTime();
               const elapsed = new Date().getTime() - prog.start.getTime();
               setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
           } else {
               setProgress(0);
           }
        } else {
            setCurrentProgram(null);
            setNextProgram(null);
            setProgress(0);
        }
     };
     
     updateEPG();
     const interval = setInterval(updateEPG, 30000); // Update every 30s
     return () => clearInterval(interval);
  }, [channel, epgData]);

  // Refs for Event Listeners
  const channelRef = useRef(channel);
  const currentChannelListRef = useRef(currentChannelList);
  const playlistRef = useRef(playlist);
  const isListOpenRef = useRef(isListOpen);
  const selectedIndexRef = useRef(selectedIndex);
  const viewModeRef = useRef(viewMode);
  const focusAreaRef = useRef(focusArea);
  const onCloseRef = useRef(onClose);
  const showTeletextRef = useRef(showTeletext);
  const activeStreamIndexRef = useRef(activeStreamIndex);
  
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { currentChannelListRef.current = currentChannelList; }, [currentChannelList]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { isListOpenRef.current = isListOpen; }, [isListOpen]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { focusAreaRef.current = focusArea; }, [focusArea]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { showTeletextRef.current = showTeletext; }, [showTeletext]);
  useEffect(() => { activeStreamIndexRef.current = activeStreamIndex; }, [activeStreamIndex]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);

  // Auto-scroll logic (For when navigating inside the list)
  useEffect(() => {
    if (isListOpen && listContainerRef.current && focusArea === 'list') {
      const currentScroll = listContainerRef.current.scrollTop;
      const itemTop = selectedIndex * ITEM_HEIGHT;
      const itemBottom = itemTop + ITEM_HEIGHT;
      
      if (itemTop < currentScroll || itemBottom > currentScroll + LIST_HEIGHT) {
         const targetScroll = Math.max(0, selectedIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
         listContainerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' }); 
      }
    }
  }, [selectedIndex, isListOpen, viewMode, focusArea]);

  // History / Back
  useEffect(() => {
    const state = { playerOpen: true, id: Date.now() };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = (_event: PopStateEvent) => { 
        if (showTeletextRef.current) {
            setShowTeletext(false);
            window.history.pushState({ playerOpen: true, id: Date.now() }, '', window.location.href);
            return;
        }

        if (isListOpenRef.current) {
            setIsListOpen(false);
            window.history.pushState({ playerOpen: true, id: Date.now() }, '', window.location.href);
        } else {
             onCloseRef.current(); 
        }
    };
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.playerOpen) {
          window.history.back();
      }
    };
  }, []);

  // Video Logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { 
        captureSnapshot(); 
        hlsRef.current.destroy(); 
        hlsRef.current = null; 
    }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
    
    setIsLoading(true);
    setResolution(null);

    const loadStream = () => {
        setIsLoading(true);
        // Determine URL based on stream variants or fallback to default
        let url = channel.url;
        if (channel.streams && channel.streams.length > 0 && channel.streams[activeStreamIndex]) {
            url = channel.streams[activeStreamIndex].url;
        }

        const isNativeSupported = video.canPlayType('application/vnd.apple.mpegurl');

        if (isNativeSupported) {
          video.src = url;
          video.load();
        } else if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => { setIsLoading(false); video.play().catch(() => {}); });
          hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) { hls.destroy(); retryConnection(); }
          });
        } else {
           video.src = url;
        }
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => { loadStream(); }, 3000);
    };

    const updateResolution = () => {
        if (video.videoWidth && video.videoHeight) {
            setResolution(`${video.videoWidth}x${video.videoHeight}`);
        }
    };

    const handleStreamReady = () => { 
        setIsLoading(false);
		setShowSnapshot(false);
        if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
        if (video.paused) video.play().catch(() => {}); 
        updateResolution();
    };
    
    const handleNativeError = () => { retryConnection(); };
    
    const handleWaiting = () => {
        setIsLoading(true);
        if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = setTimeout(() => {
            retryConnection();
        }, 15000); 
    };

    video.addEventListener('loadedmetadata', handleStreamReady);
    video.addEventListener('canplay', handleStreamReady);
    video.addEventListener('playing', handleStreamReady);
    video.addEventListener('timeupdate', () => { if (video.currentTime > 0.1 && isLoading) setIsLoading(false); });
    video.addEventListener('error', handleNativeError);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('resize', updateResolution);

    loadStream();

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
      video.removeEventListener('loadedmetadata', handleStreamReady);
      video.removeEventListener('canplay', handleStreamReady);
      video.removeEventListener('playing', handleStreamReady);
      video.removeEventListener('error', handleNativeError);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('resize', updateResolution);
      video.removeAttribute('src'); 
      video.load();
    };
  }, [channel, activeStreamIndex]);

  // Controls Logic
  const resetControls = useCallback(() => {
    if (isListOpen) { setShowControls(false); return; }
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 5000); 
  }, [isListOpen]);

  useEffect(() => {
	resetControls();
    window.addEventListener('mousemove', resetControls);
    return () => {
      window.removeEventListener('mousemove', resetControls);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControls]);

  // Handle Stream Switching Toast
  const showStreamToast = (quality: string) => {
      if (streamToastTimerRef.current) clearTimeout(streamToastTimerRef.current);
      setStreamSwitchToast(quality);
      streamToastTimerRef.current = setTimeout(() => {
          setStreamSwitchToast(null);
      }, 2000);
  };

  // Helper to open list at correct position (Center selection)
  const openChannelList = () => {
      const list = currentChannelListRef.current;
      const currentId = channelRef.current.id;
      const idx = list.findIndex(c => c.id === currentId);
      const targetIndex = idx !== -1 ? idx : 0;
      
      setSelectedIndex(targetIndex);
      setViewMode('channels');
      setFocusArea('list');
      
      // Pre-calculate scroll position to ensure virtual list renders correct range immediately
      // This prevents the list from showing the top items first
      const targetScroll = Math.max(0, targetIndex * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
      setScrollTop(targetScroll);
      
      setIsListOpen(true);
  };

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      
      // --- TELETEXT TOGGLE ---
      if (e.key === 'b' || e.key === 'a' || e.keyCode === 406 || e.key === 'Blue') {
          e.preventDefault();
          setShowTeletext(prev => !prev);
          return;
      }

      // --- IF TELETEXT IS OPEN, BLOCK ALL PLAYER INPUTS ---
      if (showTeletextRef.current) {
          // Let the Teletext component handle its own inputs via its own listener
          return;
      }

      const isEnter = e.key === 'Enter';
      const currentIsListOpen = isListOpenRef.current;

      resetControls();
      
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isUp = e.key === 'ArrowUp';
      const isDown = e.key === 'ArrowDown';
      const isLeft = e.key === 'ArrowLeft';
      const isRight = e.key === 'ArrowRight';
      const isChUp = e.key === 'PageUp' || e.keyCode === 33 || e.key === 'ChannelUp';
      const isChDown = e.key === 'PageDown' || e.keyCode === 34 || e.key === 'ChannelDown';

      const currentCursorIndex = selectedIndexRef.current;
      const currentList = currentChannelListRef.current;
      const currentView = viewModeRef.current;
      const currentFocus = focusAreaRef.current;
      const currentGroups = playlistRef.current;

      // Find where the CURRENTLY PLAYING channel is in the current list
      const playingChannelId = channelRef.current.id;
      const playingIndex = currentList.findIndex(c => c.id === playingChannelId);
      
      // Determine effective index for navigation:
      // If list is open: use the cursor position.
      // If list is closed: use the playing channel position (or 0 if not found).
      const effectiveIndex = currentIsListOpen ? currentCursorIndex : (playingIndex !== -1 ? playingIndex : 0);

      const activeListLength = currentView === 'channels' ? currentList.length : currentGroups.length;
      
      // Sidebar button indices:
      // If hasGroups: 0=Group, 1=Exit
      // If !hasGroups: 0=Exit
      const hasGroups = currentGroups.length > 1;
      const showGroupBtn = currentView === 'channels' && hasGroups;
      const maxSidebarIndex = showGroupBtn ? 1 : 0;

      if (isBack) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (currentIsListOpen) {
            if (currentView === 'groups') {
                 setViewMode('channels');
                 setFocusArea('list');
                 const idx = currentList.findIndex(c => c.id === playingChannelId);
                 setSelectedIndex(idx !== -1 ? idx : 0);
            } else {
                 setIsListOpen(false);
            }
        } else {
            window.history.back(); 
        }
        return;
      }

      // --- STREAM SWITCHING (Left/Right) when List is CLOSED ---
      if (!currentIsListOpen && channelRef.current.streams && channelRef.current.streams.length > 1) {
          if (isLeft) {
              e.preventDefault(); e.stopPropagation();
              const streams = channelRef.current.streams;
              const currentIndex = activeStreamIndexRef.current;
              // Cycle Previous
              const newIndex = (currentIndex - 1 + streams.length) % streams.length;
              setActiveStreamIndex(newIndex);
              showStreamToast(streams[newIndex].quality);
              return;
          } else if (isRight) {
              e.preventDefault(); e.stopPropagation();
              const streams = channelRef.current.streams;
              const currentIndex = activeStreamIndexRef.current;
              // Cycle Next
              const newIndex = (currentIndex + 1) % streams.length;
              setActiveStreamIndex(newIndex);
              showStreamToast(streams[newIndex].quality);
              return;
          }
      }

      if (isLeft) {
          if (currentIsListOpen && currentFocus === 'list') {
              e.preventDefault(); e.stopPropagation();
              setFocusArea('sidebar');
              setSelectedIndex(showGroupBtn ? 0 : 0); 
          }
      } else if (isRight) {
          if (currentIsListOpen && currentFocus === 'sidebar') {
              e.preventDefault(); e.stopPropagation();
              setFocusArea('list');
              setSelectedIndex(0); 
          }
      } else if (isUp) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) {
             openChannelList();
        }
        else if (currentFocus === 'sidebar') {
             setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        else if (currentFocus === 'list') {
            setSelectedIndex(prev => Math.max(0, prev - 1));
        }
      } else if (isDown) {
        e.preventDefault(); e.stopPropagation();
        if (!currentIsListOpen) {
            openChannelList();
        }
        else if (currentFocus === 'sidebar') {
            setSelectedIndex(prev => Math.min(maxSidebarIndex, prev + 1));
        }
        else if (currentFocus === 'list') {
            setSelectedIndex(prev => Math.min(activeListLength - 1, prev + 1));
        }
      } else if (isChUp) { 
        e.preventDefault(); e.stopPropagation();
        if (currentIsListOpen && currentFocus === 'list') {
             setSelectedIndex(prev => Math.min(activeListLength - 1, prev + 1));
        } else if (!currentIsListOpen) {
           const nextIdx = Math.min(currentList.length - 1, effectiveIndex + 1);
           if (nextIdx !== effectiveIndex) onChannelSelect(currentList[nextIdx]);
        }
      } else if (isChDown) { 
        e.preventDefault(); e.stopPropagation();
        if (currentIsListOpen && currentFocus === 'list') {
             setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (!currentIsListOpen) {
            const prevIdx = Math.max(0, effectiveIndex - 1);
            if (prevIdx !== effectiveIndex) onChannelSelect(currentList[prevIdx]);
        }
      } else if (isEnter) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        
        if (currentIsListOpen) {
          if (currentFocus === 'sidebar') {
               // Handle Sidebar Clicks via Enter
               if (showGroupBtn && currentCursorIndex === 0) {
                   setViewMode('groups');
                   setFocusArea('list');
                   setSelectedIndex(0);
               } else {
                   // This is the EXIT button (either index 0 or 1 depending on group presence)
                   onClose();
               }
               return;
          }

          if (currentView === 'groups') {
               const selectedGroup = currentGroups[currentCursorIndex];
               setCurrentGroup(selectedGroup);
               setCurrentChannelList(selectedGroup.channels);
               setViewMode('channels');
               setSelectedIndex(0);
               if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
          } else {
               const target = currentList[currentCursorIndex];
               if (target.id === channelRef.current.id) setIsListOpen(false);
               else onChannelSelect(target);
          }
        } else {
          openChannelList();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChannelSelect, resetControls, playlist.length, onClose]);

  const renderVirtualList = () => {
    if (!isListOpen) return null;

    const dataList = viewMode === 'channels' ? currentChannelList : playlist;
    const totalHeight = dataList.length * ITEM_HEIGHT;
    const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
    const renderStart = Math.max(0, startIndex - RENDER_BUFFER);
    const renderEnd = Math.min(dataList.length, startIndex + Math.ceil(LIST_HEIGHT / ITEM_HEIGHT) + RENDER_BUFFER);
    
    if (dataList.length === 0) return <div className="p-8 text-gray-500">No items found</div>;

    return (
      <div 
        ref={listContainerRef} 
        className="flex-1 overflow-y-auto no-scrollbar relative"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking scrollbar/list area
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {dataList.slice(renderStart, renderEnd).map((item, i) => {
            const actualIndex = renderStart + i;
            const isSelected = actualIndex === selectedIndex && focusArea === 'list';
            
            if (viewMode === 'groups') {
                const group = item as ChannelGroup;
                return (
                    <PlayerGroupItem
                        key={group.title}
                        group={group}
                        index={actualIndex}
                        itemHeight={ITEM_HEIGHT}
                        isSelected={isSelected}
                        onMouseEnter={() => {
                            if (focusArea === 'sidebar') setFocusArea('list');
                            setSelectedIndex(actualIndex);
                        }}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setCurrentGroup(group);
                            setCurrentChannelList(group.channels);
                            setViewMode('channels');
                            setSelectedIndex(0);
                            if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
                        }}
                    />
                );
            }

            const c = item as Channel;
            const isActiveChannel = c.id === channel.id;
            const prog = c.tvgId ? getCurrentProgram(epgData[c.tvgId]) : null;
            let itemProgress = 0;
            if (prog) {
                const t = prog.end.getTime() - prog.start.getTime();
                const e = new Date().getTime() - prog.start.getTime();
                itemProgress = Math.min(100, Math.max(0, (e / t) * 100));
            }

            return (
               <PlayerChannelItem
                 key={c.id}
                 channel={c}
                 index={actualIndex}
                 itemHeight={ITEM_HEIGHT}
                 isSelected={isSelected}
                 isActiveChannel={isActiveChannel}
                 currentProg={prog}
                 progress={itemProgress}
                 onMouseEnter={() => {
                     if (focusArea === 'sidebar') setFocusArea('list');
                     setSelectedIndex(actualIndex);
                 }}
                 onClick={(e: React.MouseEvent) => {
                   e.stopPropagation(); 
                   setSelectedIndex(actualIndex);
                   if (c.id === channel.id) setIsListOpen(false);
                   else onChannelSelect(c);
                 }}
               />
            );
          })}
        </div>
      </div>
    );
  };

  const hasGroups = playlist.length > 1;
  const showGroupBtn = viewMode === 'channels' && hasGroups;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      
      {/* --- NYTT: CANVAS (Last Frame Freeze) --- */}
      {/* Ligger ovanpå videon (z-20) men är osynlig tills vi säger till */}
      <canvas 
        ref={snapshotRef}
        className={`absolute inset-0 w-full h-full object-contain pointer-events-none z-20 transition-opacity duration-500 ${showSnapshot ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* --- UPPDATERAD VIDEO --- */}
      {/* bg-transparent (istället för black) och z-10 så den ligger under canvasen */}
      <video 
        ref={videoRef} 
        className="relative z-10 w-full h-full object-contain bg-transparent cursor-pointer" 
        autoPlay 
        playsInline 
        onClick={() => {
           if (!isListOpen && !showTeletext) {
               openChannelList();
           }
        }}
      />
      
      {/* --- RESTEN ÄR SAMMA SOM FÖRUT --- */}

      {/* TELETEXT VIEWER */}
      {showTeletext && (
          <TeletextViewer onClose={() => setShowTeletext(false)} />
      )}

      {/* STREAM SWITCHING TOAST */}
      <div 
        className={`absolute top-10 inset-x-0 flex justify-center pointer-events-none transition-opacity duration-300 z-[70]
          ${streamSwitchToast ? 'opacity-100' : 'opacity-0'}`}
      >
          <div className="bg-black/60 backdrop-blur-md px-10 py-4 rounded-full border-2 border-white/20">
              <span className="text-4xl font-black text-white uppercase tracking-widest">{streamSwitchToast}</span>
          </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center justify-center bg-black/60 p-8 rounded-3xl border border-white/10">
             <div className="relative w-20 h-20">
                <svg className="animate-satisfy-spin w-full h-full" viewBox="0 0 50 50">
                  <circle className="opacity-25" cx="25" cy="25" r="20" stroke="white" strokeWidth="4" fill="none" />
                  <circle
                    className="animate-satisfy-dash"
                    cx="25" cy="25" r="20"
                    stroke="white" strokeWidth="4"
                    fill="none" strokeLinecap="round"
                  />
                </svg>
             </div>
             <p className="text-white/80 font-medium tracking-widest mt-4 text-sm uppercase">Buffering</p>
          </div>
        </div>
      )}

      {/* LIST MODAL WRAPPER */}
      <div 
        className={`fixed inset-0 z-40 items-center justify-center ${isListOpen && !showTeletext ? 'flex' : 'hidden'}`}
        onClick={() => setIsListOpen(false)}
      >
        <div 
            className="flex gap-6 items-start"
            onClick={(e) => e.stopPropagation()}
        >
             {/* LEFT CARD - Sidebar */}
             <div 
                className={`w-[160px] p-1.5 bg-[#111] rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 shrink-0 ${focusArea === 'sidebar' ? 'border-white ring-1 ring-white/50' : 'opacity-90'}`}
             >
                {showGroupBtn && (
                    <div 
                        className={`w-full p-4 rounded-xl text-center cursor-pointer ${focusArea === 'sidebar' && selectedIndex === 0 ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                        onClick={() => {
                            setViewMode('groups');
                            setFocusArea('list');
                            setSelectedIndex(0);
                        }}
                        onMouseEnter={() => {
                            setFocusArea('sidebar');
                            setSelectedIndex(0);
                        }}
                    >
                        <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Current Group</div>
                        <div className="font-bold text-sm leading-tight line-clamp-2">{currentGroup?.title || 'All'}</div>
                        <div className="mt-2 text-[10px] opacity-75 flex items-center justify-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                            Change
                        </div>
                    </div>
                )}
                <div 
                    className={`w-full p-4 rounded-xl text-center cursor-pointer ${focusArea === 'sidebar' && ((showGroupBtn && selectedIndex === 1) || (!showGroupBtn && selectedIndex === 0)) ? 'bg-red-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    onClick={onClose}
                    onMouseEnter={() => {
                        setFocusArea('sidebar');
                        setSelectedIndex(showGroupBtn ? 1 : 0);
                    }}
                >
                     <div className="flex justify-center my-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    </div>
                    <div className="font-bold text-sm leading-tight">Exit to Home</div>
                </div>
             </div>

            {/* RIGHT CARD - List */}
            <div className="w-[950px] h-[900px] bg-black/60 backdrop-blur-none rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                {renderVirtualList()}
            </div>
        </div>
      </div>

      {/* CONTROLS OVERLAY */}
      <div className={`absolute inset-0 pointer-events-none ${showControls && !isListOpen && !showTeletext ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-12 flex items-end justify-between">
          <div className="flex items-end gap-6 w-3/4">
            <div className="h-28 w-28 rounded-xl bg-gray-300 p-2 border border-white/10 shrink-0 flex items-center justify-center">
              <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
            </div>
            <div className="mb-1 flex-1">
               <div className="flex items-center gap-4 mb-3">
                   <h1 className="text-4xl font-bold text-white">{channel.name}</h1>
                   
                   {/* Resolution Badge */}
                   {resolution && (
                       <div className="px-3 py-1.5 rounded-md bg-white/20 border border-white/30 text-sm font-mono text-white font-bold backdrop-blur-md">
                           {resolution}
                       </div>
                   )}

                   {/* Current Quality Badge - Made Bigger */}
                   {channel.streams && channel.streams.length > 1 && (
                       <div className="px-4 py-2 rounded-lg bg-purple-600 border-2 border-purple-400 text-xl font-black text-white uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                           {channel.streams[activeStreamIndex]?.quality || 'Multi-Stream'}
                       </div>
                   )}
               </div>

               {currentProgram ? (
                   <div className="mb-3">
                       <div className="flex items-baseline gap-2 mb-1">
                           <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase">Just nu</span>
                           <span className="text-4xl text-white font-medium">{currentProgram.title}</span>
                           <span className="text-lg text-gray-300 ml-2">
                               {currentProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})} - {currentProgram.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                           </span>
                       </div>
                       <div className="w-2/3 h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                       </div>
                       {currentProgram.description && (
                           <p className="text-gray-300 text-lg line-clamp-2">{currentProgram.description}</p>
                       )}
                   </div>
               ) : (
                   <p className="text-xl text-gray-400 mb-2">No Program Information</p>
               )}

               {nextProgram && (
                   <div className="flex items-center gap-2 opacity-80">
                        <span className="text-xs font-bold bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">Nästa</span>
                        <span className="text-lg text-gray-300 truncate">{nextProgram.title}</span>
                        <span className="text-xs text-gray-500">
                             {nextProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                        </span>
                   </div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

      {/* LIST MODAL WRAPPER */}
      <div 
        className={`fixed inset-0 z-40 items-center justify-center ${isListOpen && !showTeletext ? 'flex' : 'hidden'}`}
        onClick={() => setIsListOpen(false)}
      >
        <div 
            className="flex gap-6 items-start"
            onClick={(e) => e.stopPropagation()}
        >
             {/* LEFT CARD - Sidebar */}
             <div 
                className={`w-[160px] p-1.5 bg-[#111] rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 shrink-0 ${focusArea === 'sidebar' ? 'border-white ring-1 ring-white/50' : 'opacity-90'}`}
             >
                {showGroupBtn && (
                    <div 
                        className={`w-full p-4 rounded-xl text-center cursor-pointer ${focusArea === 'sidebar' && selectedIndex === 0 ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                        onClick={() => {
                            setViewMode('groups');
                            setFocusArea('list');
                            setSelectedIndex(0);
                        }}
                        onMouseEnter={() => {
                            setFocusArea('sidebar');
                            setSelectedIndex(0);
                        }}
                    >
                        <div className="text-[10px] uppercase font-bold tracking-wider mb-1">Current Group</div>
                        <div className="font-bold text-sm leading-tight line-clamp-2">{currentGroup?.title || 'All'}</div>
                        <div className="mt-2 text-[10px] opacity-75 flex items-center justify-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                            Change
                        </div>
                    </div>
                )}
                <div 
                    className={`w-full p-4 rounded-xl text-center cursor-pointer ${focusArea === 'sidebar' && ((showGroupBtn && selectedIndex === 1) || (!showGroupBtn && selectedIndex === 0)) ? 'bg-red-600 text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    onClick={onClose}
                    onMouseEnter={() => {
                        setFocusArea('sidebar');
                        setSelectedIndex(showGroupBtn ? 1 : 0);
                    }}
                >
                     <div className="flex justify-center my-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    </div>
                    <div className="font-bold text-sm leading-tight">Exit to Home</div>
                </div>
             </div>

            {/* RIGHT CARD - List */}
            <div className="w-[950px] h-[900px] bg-black/60 backdrop-blur-none rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                {renderVirtualList()}
            </div>
        </div>
      </div>

      {/* CONTROLS OVERLAY */}
      <div className={`absolute inset-0 pointer-events-none ${showControls && !isListOpen && !showTeletext ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-12 flex items-end justify-between">
          <div className="flex items-end gap-6 w-3/4">
            <div className="h-28 w-28 rounded-xl bg-gray-300 p-2 border border-white/10 shrink-0 flex items-center justify-center">
              <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
            </div>
            <div className="mb-1 flex-1">
               <div className="flex items-center gap-4 mb-3">
                   <h1 className="text-4xl font-bold text-white">{channel.name}</h1>
                   
                   {/* Resolution Badge */}
                   {resolution && (
                       <div className="px-3 py-1.5 rounded-md bg-white/20 border border-white/30 text-sm font-mono text-white font-bold backdrop-blur-md">
                           {resolution}
                       </div>
                   )}

                   {/* Current Quality Badge - Made Bigger */}
                   {channel.streams && channel.streams.length > 1 && (
                       <div className="px-4 py-2 rounded-lg bg-purple-600 border-2 border-purple-400 text-xl font-black text-white uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                           {channel.streams[activeStreamIndex]?.quality || 'Multi-Stream'}
                       </div>
                   )}
               </div>

               {currentProgram ? (
                   <div className="mb-3">
                       <div className="flex items-baseline gap-2 mb-1">
                           <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase">Just nu</span>
                           <span className="text-4xl text-white font-medium">{currentProgram.title}</span>
                           <span className="text-lg text-gray-300 ml-2">
                               {currentProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})} - {currentProgram.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                           </span>
                       </div>
                       <div className="w-2/3 h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                       </div>
                       {currentProgram.description && (
                           <p className="text-gray-300 text-lg line-clamp-2">{currentProgram.description}</p>
                       )}
                   </div>
               ) : (
                   <p className="text-xl text-gray-400 mb-2">No Program Information</p>
               )}

               {nextProgram && (
                   <div className="flex items-center gap-2 opacity-80">
                        <span className="text-xs font-bold bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">Nästa</span>
                        <span className="text-lg text-gray-300 truncate">{nextProgram.title}</span>
                        <span className="text-xs text-gray-500">
                             {nextProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                        </span>
                   </div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
