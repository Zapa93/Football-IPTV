import React, { useState, useEffect, useCallback, useRef } from 'react';

interface TeletextViewerProps {
  onClose: () => void;
}

export const TeletextViewer: React.FC<TeletextViewerProps> = ({ onClose }) => {
  const [page, setPage] = useState('100');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [inputBuffer, setInputBuffer] = useState('');
  
  // Timeout för inmatning av sidnummer
  const inputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hämta sidan
  const fetchPage = useCallback(async (pageNum: string) => {
    setLoading(true);
    try {
      // Vi använder texttv.nu API som är mycket stabilare och CORS-vänligt
      const res = await fetch(`https://api.texttv.nu/api/get/${pageNum}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        // API:et returnerar en array med sidor. Vi tar content från den första.
        // Vi måste rensa bort vissa länkar som APIet lägger till för att det ska se snyggt ut på TV
        let rawHtml = data[0].content.join('\n');
        
        // Ta bort texttv.nu specifika länkar/banners om de finns
        rawHtml = rawHtml.replace(/<a href="\/(\d+)">/g, '<span class="link" data-page="$1">');
        rawHtml = rawHtml.replace(/<\/a>/g, '</span>');
        
        setContent(rawHtml);
      } else {
        setContent('<div class="error">Sidan saknas / Page not found</div>');
      }
    } catch (err) {
      console.error("TextTV Error:", err);
      setContent('<div class="error">Kunde inte ladda Text-TV / Connection Error</div>');
    } finally {
      setLoading(false);
    }
  }, []);

  // Ladda sida vid start och när page ändras
  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  // Hantera tangentbordsinmatning (Fjärrkontroll)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Stäng med Back/Exit/Escape
      if (e.key === 'Backspace' || e.key === 'Escape' || e.keyCode === 461) {
        onClose();
        return;
      }

      // Navigera +1 / -1
      if (e.key === 'ArrowRight') {
        setPage(p => String(parseInt(p) + 1));
      } else if (e.key === 'ArrowLeft') {
        setPage(p => String(Math.max(100, parseInt(p) - 1)));
      } 
      // Navigera +100 / -100 (Upp/Ner)
      else if (e.key === 'ArrowUp') {
        setPage(p => String(parseInt(p) + 100)); // Hoppa snabbt framåt
      } else if (e.key === 'ArrowDown') {
         setPage(p => String(Math.max(100, parseInt(p) - 100))); // Hoppa snabbt bakåt
      }

      // Sifferinmatning (0-9)
      if (/^[0-9]$/.test(e.key)) {
        const digit = e.key;
        
        // Lägg till i buffern
        const newBuffer = inputBuffer + digit;
        
        if (newBuffer.length === 3) {
           // Vi har 3 siffror (t.ex. "377") -> Gå till sidan direkt
           setPage(newBuffer);
           setInputBuffer('');
           if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
        } else {
           // Vänta på fler siffror
           setInputBuffer(newBuffer);
           
           if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
           inputTimeoutRef.current = setTimeout(() => {
               setInputBuffer(''); // Rensa om man är för långsam
           }, 3000);
        }
      }
      
      // Färgknappar (Genvägar)
      // Röd (403), Grön (404), Gul (405), Blå (406) - Koderna varierar beroende på TV
      if (e.key === 'Red' || e.key === 'r') setPage('100'); // Index
      if (e.key === 'Green' || e.key === 'g') setPage('300'); // Sport
      if (e.key === 'Yellow' || e.key === 'y') setPage('330'); // Resultatbörsen
      if (e.key === 'Blue' || e.key === 'b') setPage('377'); // Målservice
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
    };
  }, [inputBuffer, onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-black font-mono flex items-center justify-center">
      {/* CSS STYLES FÖR TEXT-TV FÄRGER */}
      <style>{`
        .teletext-container {
            font-family: 'Courier New', Courier, monospace;
            background-color: #111; /* Lite mjukare svart */
            color: #eee;
            
            /* --- VIKTIGA ÄNDRINGAR FÖR PROPORTIONER --- */
            font-size: 3.8vh;     /* Större text så den fyller höjden (25 rader * 3.8 = 95vh) */
            line-height: 1.0;     /* Inget extra utrymme mellan rader (viktigt för grafik!) */
            letter-spacing: 0.05em; /* Lite luft mellan tecken */
            
            /* Simulera TV-format (dra ut den på bredden) */
            transform: scaleX(1.3); 
            transform-origin: center top;
            
            white-space: pre;
            overflow: hidden;
            display: inline-block;
            padding: 20px 40px; /* Mer padding på sidorna pga scaleX */
            border: 2px solid #333;
            box-shadow: 0 0 50px rgba(0,0,0,0.8);
        }
        
        /* TextTV.nu classes */
        .Y { color: #ff0; }
        .C { color: #0ff; }
        .G { color: #0f0; }
        .R { color: #f00; }
        .W { color: #fff; }
        .B { color: #00f; }
        .M { color: #f0f; }
        .dh { font-size: 1.2em; font-weight: bold; }
        .bgB { background-color: #00f; }
        .bgR { background-color: #f00; }
        .bgG { background-color: #0f0; }
        
        .top-bar {
            position: absolute;
            top: 10px;
            left: 0; 
            right: 0;
            text-align: center;
            font-size: 2vh;
            color: #888;
            z-index: 10;
            font-family: sans-serif;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .input-overlay {
            position: absolute;
            top: 20px;
            right: 40px;
            font-size: 4vh;
            color: yellow;
            font-family: monospace;
            font-weight: bold;
            background: rgba(0,0,0,0.8);
            padding: 5px 15px;
            border: 1px solid yellow;
            z-index: 20;
        }

        /* Dölj scrollbars om de råkar dyka upp */
        .teletext-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* HEADER INFO */}
      <div className="top-bar">
         <span>SVT TEXT {page}</span>
         <span className="ml-4 text-xs opacity-50">(Arrows to navigate, 0-9 to search)</span>
      </div>

      {/* INPUT FEEDBACK (Visar siffrorna du skriver in, t.ex. "3..") */}
      {inputBuffer && (
          <div className="input-overlay">{inputBuffer}_</div>
      )}

      {/* MAIN CONTENT */}
      {loading ? (
        <div className="text-xl text-green-500 animate-pulse">Laddar sida {page}...</div>
      ) : (
        <div 
            className="teletext-container shadow-2xl"
            dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  );
};