import React, { memo } from 'react';
import { DEFAULT_LOGO } from '../constants';

// --- HOME SCREEN COMPONENTS (Huvudmenyn) ---

export const GroupItem = memo(({ item, isFocused, onClick, onMouseEnter }: any) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${item.height}px`,
        transform: `translateY(${item.top}px)`,
        willChange: 'transform'
      }}
      className={`group flex items-center px-8 cursor-pointer select-none ${isFocused ? 'z-10' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
        <div className={`w-full h-[80px] flex items-center bg-[#111] rounded-xl border-2 ${isFocused ? 'border-white' : 'border-white/5'}`}>
            <div className="w-[140px] h-full flex items-center justify-center bg-gray-300 border-r border-white/5 shrink-0 rounded-l-lg">
                <svg className="w-16 h-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
            </div>
            <div className="flex-1 px-8">
                <h3 className={`text-4xl font-bold truncate ${isFocused ? 'text-white' : 'text-gray-200'}`}>{item.title}</h3>
                <p className="text-gray-500 text-lg mt-1">{item.count} Channels</p>
            </div>
        </div>
    </div>
  );
});

export const ChannelItem = memo(({ item, currentProg, isFocused, onClick, onMouseEnter }: any) => {
    let progress = 0;
    if (currentProg) {
        const t = currentProg.end.getTime() - currentProg.start.getTime();
        const e = new Date().getTime() - currentProg.start.getTime();
        progress = Math.min(100, Math.max(0, (e / t) * 100));
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${item.height}px`,
                transform: `translateY(${item.top}px)`,
                willChange: 'transform'
            }}
            className={`group flex items-center px-8 cursor-pointer select-none ${isFocused ? 'z-10' : ''}`}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
        >
            <div className={`w-full h-full flex items-center bg-[#111] rounded-xl overflow-hidden border-2 ${isFocused ? 'border-white' : 'border-white/5'}`}>
                <div className="h-full w-[140px] bg-gray-300 flex items-center justify-center shrink-0 border-r border-white/10 p-2">
                    <img 
                        src={item.data.logo} 
                        className="w-full h-full object-contain" 
                        onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} 
                    />
                </div>
                
                <div className="flex-1 px-8 min-w-0 flex flex-col justify-center h-full">
                    <div className="flex items-baseline justify-between">
                        <div className="flex items-center gap-6 min-w-0">
                            <span className="text-3xl font-mono text-gray-500 font-bold w-12 text-right shrink-0">{item.channelNumber}</span>
                            <h3 className={`text-3xl font-semibold truncate ${isFocused ? 'text-white' : 'text-gray-200'}`}>{item.data.name}</h3>
                        </div>
                        {currentProg && (
                            <span className="text-lg text-gray-400 shrink-0 font-medium">
                                {currentProg.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                            </span>
                        )}
                    </div>

                    <div className="pl-[72px] mt-1.5 min-w-0">
                        {currentProg ? (
                            <div className="flex flex-col gap-1.5">
                                <p className={`text-xl truncate ${isFocused ? 'text-gray-300' : 'text-gray-500'}`}>{currentProg.title}</p>
                                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-600 italic">No Program Info</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

// --- PLAYER COMPONENTS (Overlay-listan i videospelaren) ---

export const PlayerGroupItem = memo(({ group, index, itemHeight, isSelected, onClick, onMouseEnter }: any) => {
    return (
        <div
            onMouseEnter={onMouseEnter}
            onClick={onClick}
            style={{ 
                position: 'absolute', 
                top: `${index * itemHeight}px`, 
                left: 0, right: 0, 
                height: `${itemHeight}px` 
            }}
            className={`flex items-center gap-6 px-8 cursor-pointer ${isSelected ? 'bg-white/10' : ''}`}
        >
                <div className={`w-14 h-14 flex items-center justify-center rounded-lg ${isSelected ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <h3 className={`text-3xl font-bold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>{group.title}</h3>
                    <p className="text-gray-500 text-base">{group.channels.length} Channels</p>
                </div>
                {isSelected && (
                    <div className="bg-white text-black rounded-full p-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    </div>
                )}
        </div>
    );
});

export const PlayerChannelItem = memo(({ channel, index, itemHeight, isSelected, isActiveChannel, currentProg, nextProg, progress, onClick, onMouseEnter }: any) => {
    return (
        <div 
            onMouseEnter={onMouseEnter}
            onClick={onClick}
            style={{ 
                position: 'absolute', 
                top: `${index * itemHeight}px`, 
                left: 0, right: 0, 
                height: `${itemHeight}px` 
            }}
            className={`flex items-center gap-0 cursor-pointer overflow-hidden ${isSelected ? 'border-2 border-white z-10 bg-white/10' : 'border-2 border-transparent'} ${isActiveChannel ? 'text-green-400' : 'text-gray-200'}`}
        >
            {/* LOGO */}
            <div className="h-full w-[110px] bg-gray-300 flex items-center justify-center flex-shrink-0 border-r border-white/5 p-3">
                <img 
                    src={channel.logo} 
                    className="w-full h-full object-contain" 
                    onError={(e) => (e.target as HTMLImageElement).src = DEFAULT_LOGO} 
                />
            </div>

            {/* INFO CONTENT */}
            <div className="flex-1 min-w-0 pl-6 flex flex-col justify-center h-full relative">
                
                {/* RAD 1: Kanalnummer, Namn & Tid */}
                <div className="flex justify-between items-end pr-8 mb-0">
                    <div className="flex items-center gap-4 overflow-hidden">
                        <span className="text-3xl font-mono font-bold text-white flex-shrink-0">
                            {index + 1}
                        </span>
                        <p className={`font-bold truncate ${isSelected ? 'text-2xl text-white' : 'text-2xl text-gray-200'}`}>{channel.name}</p>
                    </div>
                    {currentProg && (
                        <span className="text-base text-gray-400 shrink-0 font-medium bg-black/40 px-2 rounded">
                            {currentProg.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                        </span>
                    )}
                </div>

                {/* EPG Info - Tillbaka till rent utseende */}
                {currentProg ? (
                    <div className="flex flex-col gap-0 pr-8">
                            
                            {/* TITEL med fade */}
                            <p 
                                className={`text-xl font-medium leading-none mb-0.5 whitespace-nowrap overflow-hidden ${isSelected ? 'text-gray-100' : 'text-gray-300'}`}
                                style={{ 
                                    maskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)' 
                                }}
                            >
                                {currentProg.title}
                            </p>
                            
                            {/* Progress Bar */}
                            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden my-0.5">
                                <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                            </div>
                            
                            {/* Nästa program */}
                            {nextProg && (
                                <p className={`text-base truncate leading-tight ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <span className="opacity-70 font-bold tracking-wide text-[10px] uppercase mr-1">Next</span> 
                                    {nextProg.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})} - {nextProg.title}
                                </p>
                            )}
                    </div>
                ) : (
                    <p className="text-lg text-gray-500 truncate mt-0.5 italic">Ingen programinformation</p>
                )}
            </div>
            
            {/* Active Indicator */}
            {isActiveChannel && <div className="w-3 h-3 rounded-full bg-green-500 mr-6 shrink-0"></div>}
        </div>
    );
});