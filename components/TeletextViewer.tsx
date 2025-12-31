import React, { useState, useEffect, useCallback, useRef } from 'react';

interface TeletextViewerProps {
  onClose: () => void;
}

export const TeletextViewer: React.FC<TeletextViewerProps> = ({ onClose }) => {
  const [page, setPage] = useState('100');
  const [fullContent, setFullContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [inputBuffer, setInputBuffer] = useState('');
  const [subPageCount, setSubPageCount] = useState(0);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (pageNum: string) => {
    setLoading(true);
    setFullContent('');
    
    // Återställ scroll när vi byter sida
    if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
    }

    try {
      const res = await fetch(`https://api.texttv.nu/api/get/${pageNum}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        setSubPageCount(data.length);
        
        const combinedHtml = data.map((subPage: any, index: number) => {
            let html = Array.isArray(subPage.content) ? subPage.content.join('\n') : '';
            
            html = html.replace(/<a href="\/(\d+)">/g, '<span class="link" data-page="$1">');
            html = html.replace(/<\/a>/g, '</span>');

            if (index < data.length - 1) {
                // Avdelare mellan sidor
                html += '\n\n' + '─'.repeat(40) + '\n\n'; 
            }
            return html;
        }).join('');

        setFullContent(combinedHtml);
      } else {
        setFullContent('<div class="error">Sidan saknas / Page not found</div>');
        setSubPageCount(0);
      }
    } catch (err) {
      console.error("TextTV Error:", err);
      setFullContent('<div class="error">Kunde inte ladda Text-TV / Connection Error</div>');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  // Fokusera scrollcontainern för att tangenter ska funka säkert
  useEffect(() => {
      if (scrollContainerRef.current) {
          scrollContainerRef.current.focus();
      }
  }, [loading]);

  // --- NAVIGATION ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Backspace' || e.key === 'Escape' || e.keyCode === 461) {
        onClose();
        return;
      }

      const scrollAmount = 300; // Mängd att scrolla (pixlar)

      // SCROLL UPP (Pil Upp / P+ / PageUp / Kod 38)
      if (
          e.key === 'ArrowUp' || 
          e.key === 'ChannelUp' || 
          e.key === 'PageUp' || 
          e.keyCode === 38 || 
          e.keyCode === 33 || 
          e.keyCode === 427
      ) {
          if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          }
          return; // Viktigt: Avbryt här så vi inte gör något annat
      }

      // SCROLL NER (Pil Ner / P- / PageDown / Kod 40)
      if (
          e.key === 'ArrowDown' || 
          e.key === 'ChannelDown' || 
          e.key === 'PageDown' || 
          e.keyCode === 40 || 
          e.keyCode === 34 || 
          e.keyCode === 428
      ) {
          if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          }
          return;
      }

      // BYT SIDA (Vänster / Höger)
      if (e.key === 'ArrowRight' || e.keyCode === 39) setPage(p => String(parseInt(p) + 1));
      if (e.key === 'ArrowLeft' || e.keyCode === 37) setPage(p => String(Math.max(100, parseInt(p) - 1)));

      // SIFFROR
      let digit = '';
      if (/^[0-9]$/.test(e.key)) {
          digit = e.key;
      } else if (e.keyCode >= 48 && e.keyCode <= 57) {
          digit = String(e.keyCode - 48);
      }

      if (digit) {
        const newBuffer = inputBuffer + digit;
        if (newBuffer.length === 3) {
           setPage(newBuffer);
           setInputBuffer('');
           if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
        } else {
           setInputBuffer(newBuffer);
           if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
           inputTimeoutRef.current = setTimeout(() => {
               setInputBuffer(''); 
           }, 4000); 
        }
      }
      
      // FÄRGER
      if (e.key === 'Red' || e.key === 'r' || e.keyCode === 403) setPage('100'); 
      if (e.key === 'Green' || e.key === 'g' || e.keyCode === 404) setPage('300'); 
      if (e.key === 'Yellow' || e.key === 'y' || e.keyCode === 405) setPage('330'); 
      if (e.key === 'Blue' || e.key === 'b' || e.keyCode === 406) setPage('377'); 
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
    };
  }, [inputBuffer, onClose]); // Tog bort subPageCount dependency så scroll alltid är aktiv

  return (
    <div className="fixed inset-0 z-[60] bg-black font-mono">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');

        .scroll-wrapper {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            outline: none;
            
            scrollbar-width: none;
            -ms-overflow-style: none;
        }
        .scroll-wrapper::-webkit-scrollbar { display: none; }

        .teletext-content {
            font-family: 'VT323', monospace; 
            background-color: transparent;
            color: #e0e0e0;
            
            display: block;
            margin: 0 auto;
            
            /* Layout & Position */
            margin-top: 1.5vh;
            margin-bottom: 5vh;
            
            /* Skalning för 16:9 bredd */
            transform: scale(1.7, 1.25); 
            transform-origin: top center;
            
            white-space: pre;
            text-align: left;
            
            font-size: 3.1vh;     
            line-height: 1.05;     
            letter-spacing: 0.5px;
            
            text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
            width: fit-content;
        }
        
        /* Färger */
        .Y { color: #ffff00; }
        .C { color: #00ffff; }
        .G { color: #00ff00; }
        .R { color: #ff0000; }
        .W { color: #ffffff; }
        .B { color: #6666ff; }
        .M { color: #ff00ff; }
        .dh { font-weight: bold; color: #ffff00; }
        .bgB { background-color: #0000aa; color: white; }
        .bgR { background-color: #aa0000; color: white; }
        .bgG { background-color: #00aa00; color: white; }
        .link { border-bottom: 2px solid currentColor; }

        .top-bar {
            position: fixed;
            top: 1.5vh;
            right: 5vw;
            font-size: 4vh;
            color: #888;
            z-index: 100;
            font-family: 'VT323', monospace;
            background: rgba(0,0,0,0.8);
            padding: 5px 20px;
            border-radius: 8px;
            pointer-events: none;
        }

        .input-overlay {
            position: fixed;
            top: 5vh;
            left: 5vw;
            font-size: 8vh;
            color: #ffff00;
            font-family: 'VT323', monospace;
            background: rgba(0,0,0,0.95);
            padding: 15px 30px;
            border: 3px solid #ffff00;
            border-radius: 8px;
            z-index: 200;
            box-shadow: 0 0 30px rgba(0,0,0,0.8);
        }
      `}</style>

      {/* HEADER INFO */}
      <div className="top-bar">
         <span>SVT TEXT {page}</span>
         {subPageCount > 1 && (
             <span className="text-gray-500 ml-4 text-2xl tracking-widest">[SCROLL]</span>
         )}
      </div>

      {inputBuffer && (
          <div className="input-overlay">
              SID: {inputBuffer}<span className="animate-pulse">_</span>
          </div>
      )}

      {/* SCROLL CONTAINER - Nu med fokus och eventhantering */}
      <div className="scroll-wrapper" ref={scrollContainerRef} tabIndex={0}>
        {loading ? (
            <div className="flex h-full items-center justify-center">
                <div className="text-4xl font-mono text-green-500 animate-pulse">Hämtar sid {page}...</div>
            </div>
        ) : (
            <div 
                className="teletext-content"
                dangerouslySetInnerHTML={{ __html: fullContent }}
            />
        )}
      </div>
    </div>
  );
};